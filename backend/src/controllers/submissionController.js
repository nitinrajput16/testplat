const Submission=require('../models/Submission');
const Question=require('../models/Question');
const Exam=require('../models/Exam');
const ExamSession=require('../models/ExamSession');
const asyncHandler=require('../utils/asyncHandler');
const { runJudge0Submission, isJudge0Configured }=require('../utils/judge0Client');
const { getLanguageLabel }=require('../utils/codeTemplates');

function normalizeId(value){
    if(!value){
        return null;
    }
    if(typeof value==='string'){
        return value;
    }
    if(value._id && typeof value._id.toString==='function'){
        return value._id.toString();
    }
    if(typeof value.toString==='function'){
        return value.toString();
    }
    return null;
}

function studentCanAccessExam(exam,user){
    if(!exam || !user){
        return false;
    }

    const organizationIds=new Set((user.organizations||[]).map((id)=>id.toString()));
    const examOrganizations=(exam.organizationTargets||[])
        .map((organization)=>normalizeId(organization?._id||organization))
        .filter(Boolean);
    const isOrgMember=examOrganizations.some((id)=>organizationIds.has(id));

    const invitedEmails=(exam.invitedStudentEmails||[]).map((email)=>email.toLowerCase());
    const isInvited=invitedEmails.includes(user.email?.toLowerCase());

    switch(exam.visibility){
    case 'public':
        return true;
    case 'organizations':
        return isOrgMember;
    case 'custom':
        return isInvited;
    case 'mixed':
        return isOrgMember || isInvited;
    default:
        return false;
    }
}

function buildResponseSnapshots(answers,questionMap){
    if(!Array.isArray(answers) || !questionMap){
        return [];
    }

    const recordedAt=new Date();

    return answers.map((answer)=>{
        const questionId=answer?.question?.toString?.();
        const question=questionId?questionMap.get(questionId):null;
        const type=(question?.type||'mcq').toLowerCase();
        const correctness=typeof answer.isCorrect==='boolean'?answer.isCorrect:null;

        const snapshot={
            question:answer.question,
            answerType:type,
            recordedAt,
            answerData:{}
        };

        if(type==='written'){
            snapshot.answerData={
                answerText:answer.answerText||'',
                isCorrect:correctness
            };
            return snapshot;
        }

        if(type==='code'){
            const evaluation=answer.codeAnswer||{};
            snapshot.answerData={
                languageId:evaluation.languageId,
                languageName:evaluation.languageName,
                source:evaluation.source,
                lastRun:{
                    input:evaluation.lastRunInput,
                    output:evaluation.lastRunOutput,
                    error:evaluation.lastRunError,
                    statusId:evaluation.statusId,
                    statusDescription:evaluation.statusDescription,
                    time:evaluation.time,
                    memory:evaluation.memory
                },
                testResults:Array.isArray(evaluation.testResults)?evaluation.testResults:[],
                manualReviewRequired:Boolean(evaluation.manualReviewRequired),
                notes:evaluation.notes||'',
                isCorrect:correctness
            };
            return snapshot;
        }

        snapshot.answerData={
            selectedOptionIndex:answer.selectedOptionIndex,
            isCorrect:correctness
        };

        return snapshot;
    });
}

function summariseSessionActivity(session,suspiciousEvents){
    const summary={
        totalEvents:0,
        byEventType:{},
        lastEventAt:null
    };

    if(!session){
        return summary;
    }

    const events=Array.isArray(session.events)?session.events:[];

    events.forEach((event)=>{
        const eventTypeRaw=typeof event?.eventType==='string'?event.eventType.trim():'';
        const eventType=eventTypeRaw.toUpperCase();

        if(!eventType || !suspiciousEvents.has(eventType)){
            return;
        }

        summary.totalEvents+=1;
        summary.byEventType[eventType]=(summary.byEventType[eventType]||0)+1;

        const occurredAt=event.occurredAt? new Date(event.occurredAt):null;
        if(occurredAt && (!summary.lastEventAt || occurredAt>summary.lastEventAt)){
            summary.lastEventAt=occurredAt;
        }
    });

    return summary;
}

const createSubmission=asyncHandler(async (req,res)=>{
    const { examId, responses, sessionId }=req.body;

    if(!examId || !Array.isArray(responses) || responses.length===0){
        return res.status(400).json({ message:'Exam ID and responses are required.' });
    }

    const exam=await Exam.findById(examId);

    if(!exam){
        return res.status(404).json({ message:'Exam not found.' });
    }

    if(!studentCanAccessExam(exam,req.user)){
        return res.status(403).json({ message:'You are not allowed to submit this exam.' });
    }

    const now=new Date();
    if(exam.startsAt && exam.startsAt>now){
        return res.status(400).json({ message:'The exam has not started yet.' });
    }

    if(exam.endsAt && exam.endsAt < new Date()){
        return res.status(400).json({ message:'The exam has already ended.' });
    }

    const existingSubmission=await Submission.findOne({ exam:examId, student:req.user._id });
    if(existingSubmission){
        return res.status(409).json({ message:'You have already submitted this exam.' });
    }

    const questionIds=responses
        .map((response)=>response.questionId)
        .filter(Boolean);
    const questions=await Question.find({ _id:{ $in:questionIds }, exam:examId });
    const questionMap=new Map();
    questions.forEach((question)=>questionMap.set(question._id.toString(), question));

    if(!sessionId){
        return res.status(400).json({ message:'Active exam session is required to submit.' });
    }

    const session=await ExamSession.findOne({
        _id:sessionId,
        exam:examId,
        student:req.user._id
    });

    if(!session){
        return res.status(404).json({ message:'Exam session not found. Please restart your attempt.' });
    }

    if(session.status!=='active'){
        return res.status(409).json({ message:'This exam session is no longer active.' });
    }

    let score=0;
    let invalidResponse=false;
    const answers=[];

    for(const response of responses){
        const questionId=String(response.questionId);
        const question=questionMap.get(questionId);
        if(!question){
            invalidResponse=true;
            break;
        }

        if(question.type==='written'){
            const answerText=typeof response.answerText==='string'? response.answerText.trim():'';

            if(!answerText){
                invalidResponse=true;
                break;
            }

            const correctness=question.isCorrect(answerText);
            if(correctness===true){
                score+=1;
            }

            answers.push({
                question:question._id,
                answerText,
                isCorrect:correctness===null?undefined:correctness
            });
            continue;
        }

        if(question.type==='code'){
            const rawSource=typeof response.source==='string'
                ? response.source
                : (typeof response.code==='string'?response.code:'');

            if(!rawSource.trim()){
                invalidResponse=true;
                break;
            }

            const settings=question.codeSettings;

            if(!settings || !Array.isArray(settings.testCases) || !settings.testCases.length){
                invalidResponse=true;
                break;
            }

            const responseLanguageId=Number(response.languageId);
            const configuredLanguageId=Number(settings.languageId);
            const languageId=Number.isInteger(responseLanguageId) && responseLanguageId>0
                ? responseLanguageId
                : (Number.isInteger(configuredLanguageId) && configuredLanguageId>0 ? configuredLanguageId : NaN);

            if(!Number.isInteger(languageId) || languageId<=0){
                invalidResponse=true;
                break;
            }

            const studentInput=typeof response.stdin==='string'?response.stdin:'';
            const languageName=typeof response.languageName==='string' && response.languageName.trim()
                ? response.languageName.trim()
                : (typeof settings.languageName==='string' ? settings.languageName : '');

            const evaluation={
                languageId,
                languageName:getLanguageLabel(languageId,languageName),
                source:rawSource,
                lastRunInput:studentInput,
                lastRunOutput:'',
                lastRunError:'',
                statusId:null,
                statusDescription:null,
                time:null,
                memory:null,
                testResults:[],
                manualReviewRequired:false,
                notes:''
            };

            let allPassed=true;

            if(!isJudge0Configured()){
                evaluation.manualReviewRequired=true;
                evaluation.notes='Automated code evaluation unavailable. Requires manual review.';
                allPassed=false;
            }else{
                for(let index=0; index<settings.testCases.length; index+=1){
                    const testCase=settings.testCases[index];
                    try{
                        const result=await runJudge0Submission({
                            sourceCode:rawSource,
                            languageId,
                            stdin:testCase.input||'',
                            expectedOutput:testCase.expectedOutput||'',
                            cpuTimeLimit:settings.timeLimit,
                            memoryLimit:settings.memoryLimit
                        });

                        const status=result?.status||{};
                        const stdout=result?.stdout||'';
                        const stderr=result?.stderr||'';
                        const compileOutput=result?.compile_output||'';

                        const statusId=Number(status.id);
                        const statusDescription=status.description||'';
                        const passed=statusId===3 || statusDescription.toLowerCase()==='accepted';

                        if(!passed){
                            allPassed=false;
                        }

                        evaluation.statusId=statusId;
                        evaluation.statusDescription=statusDescription;
                        evaluation.lastRunOutput=stdout;
                        evaluation.lastRunError=stderr||compileOutput||'';
                        evaluation.time=result?.time||null;
                        evaluation.memory=result?.memory||null;

                        evaluation.testResults.push({
                            index,
                            passed,
                            statusId,
                            statusDescription,
                            stdout,
                            stderr:stderr||compileOutput||'',
                            time:result?.time||null,
                            memory:result?.memory||null
                        });
                    }catch(error){
                        console.error('Judge0 evaluation failed',error);
                        evaluation.manualReviewRequired=true;
                        evaluation.notes='Automated evaluation failed: '+(error.message||'Unknown error');
                        allPassed=false;
                        break;
                    }
                }

                if(!evaluation.testResults.length && !evaluation.manualReviewRequired){
                    evaluation.manualReviewRequired=true;
                    evaluation.notes='No evaluation results were recorded.';
                    allPassed=false;
                }
            }

            if(!evaluation.manualReviewRequired && allPassed){
                score+=1;
            }

            answers.push({
                question:question._id,
                codeAnswer:evaluation,
                isCorrect:evaluation.manualReviewRequired?undefined:allPassed
            });

            continue;
        }

        const selectedIndex=Number(response.selectedOptionIndex);

        if(Number.isNaN(selectedIndex) || selectedIndex<0 || selectedIndex>=question.options.length){
            invalidResponse=true;
            break;
        }

        const isCorrect=question.isCorrect(selectedIndex);
        if(isCorrect){
            score+=1;
        }

        answers.push({
            question:question._id,
            selectedOptionIndex:selectedIndex,
            isCorrect
        });
    }

    if(invalidResponse){
        return res.status(400).json({ message:'One or more answers are invalid.' });
    }

    if(answers.length!==questions.length || answers.length!==exam.questions.length){
        return res.status(400).json({ message:'Please answer every question before submitting.' });
    }

    let submission;
    try{
        submission=await Submission.create({
            exam:examId,
            student:req.user._id,
            session:session._id,
            answers,
            score
        });
    }catch(error){
        if(error.code===11000){
            return res.status(409).json({ message:'You have already submitted this exam.' });
        }
        throw error;
    }

    const responsesSnapshots=buildResponseSnapshots(answers,questionMap);

    session.status='submitted';
    session.endedAt=new Date();
    session.submission=submission._id;
    session.responses=responsesSnapshots;
    session.finalScore=score;
    session.markModified('responses');

    try{
        await session.save();
    }catch(error){
        console.error('Failed to update exam session after submission',error);
    }

    res.status(201).json(submission);
});

const getSubmissionsForExam=asyncHandler(async (req,res)=>{
    const { examId }=req.params;

    const exam=await Exam.findById(examId);
    if(!exam){
        return res.status(404).json({ message:'Exam not found.' });
    }

    if(!exam.createdBy.equals(req.user._id) && req.user.role!=='admin'){
        return res.status(403).json({ message:'You cannot view submissions for this exam.' });
    }

    const submissions=await Submission.find({ exam:examId })
        .populate('student','name email role')
        .sort('-createdAt')
        .lean();

    const studentIds=submissions
        .map((submission)=>submission?.student?._id)
        .filter(Boolean)
        .map((id)=>id.toString());

    let activityLookup=new Map();

    const suspiciousEvents=new Set(['TAB_HIDDEN','CONTEXT_MENU','COPY','CUT','PASTE']);

    if(studentIds.length){
        const sessions=await ExamSession.find({
            exam:exam._id,
            student:{ $in:studentIds }
        }).lean();

        activityLookup=sessions.reduce((map,sessionItem)=>{
            const studentId=sessionItem?.student?.toString?.();
            if(!studentId){
                return map;
            }

            const summary=summariseSessionActivity(sessionItem,suspiciousEvents);
            const existing=map.get(studentId)||{
                totalEvents:0,
                byEventType:{},
                lastEventAt:null
            };

            if(summary.totalEvents>0){
                existing.totalEvents+=summary.totalEvents;
                Object.entries(summary.byEventType||{}).forEach(([eventType,count])=>{
                    existing.byEventType[eventType]=(existing.byEventType[eventType]||0)+count;
                });
            }

            if(summary.lastEventAt){
                const existingDate=existing.lastEventAt?new Date(existing.lastEventAt):null;
                if(!existingDate || summary.lastEventAt>existingDate){
                    existing.lastEventAt=summary.lastEventAt;
                }
            }

            map.set(studentId,existing);
            return map;
        },new Map());
    }

    let sessionsBySubmissionId=new Map();

    if(submissions.length){
        const submissionIds=submissions.map((submission)=>submission._id);
        const relatedSessions=await ExamSession.find({ submission:{ $in:submissionIds } }).lean();

        sessionsBySubmissionId=relatedSessions.reduce((map,sessionItem)=>{
            if(!sessionItem?.submission){
                return map;
            }
            map.set(sessionItem.submission.toString(),sessionItem);
            return map;
        },new Map());
    }

    const annotatedSubmissions=submissions.map((submission)=>{
        const studentId=submission?.student?._id?.toString();
        const summary=studentId?activityLookup.get(studentId):null;
        const session=sessionsBySubmissionId.get(submission._id.toString());

        const responses=(session?.responses || []).map((response)=>{
            if(!response || response.answerType!=='code'){
                return response;
            }

            const data=response.answerData||{};

            return {
                ...response,
                answerData:{
                    ...data,
                    manualReviewRequired:Boolean(data.manualReviewRequired),
                    notes:data.notes||''
                }
            };
        });

        return {
            ...submission,
            activitySummary:summary?{
                totalEvents:summary.totalEvents,
                byEventType:summary.byEventType,
                lastEventAt:summary.lastEventAt?summary.lastEventAt.toISOString():null
            }:{
                totalEvents:0,
                byEventType:{},
                lastEventAt:null
            },
            examSession:{
                id:session?._id?.toString()||null,
                status:session?.status||null,
                startedAt:session?.startedAt?new Date(session.startedAt).toISOString():null,
                endedAt:session?.endedAt?new Date(session.endedAt).toISOString():null,
                finalScore:session?.finalScore,
                responses,
                metadata:session?.metadata || null
            }
        };
    });

    res.json(annotatedSubmissions);
});

const getMySubmissions=asyncHandler(async (req,res)=>{
    const submissions=await Submission.find({ student:req.user._id })
        .populate('exam','title description startsAt')
        .populate('session','status startedAt endedAt finalScore')
        .sort('-createdAt');

    res.json(submissions);
});

module.exports={
    createSubmission,
    getSubmissionsForExam,
    getMySubmissions
};

// Update submission score (manual grading)
const updateSubmissionScore = asyncHandler(async (req, res) => {
    const { submissionId } = req.params;
    const { score } = req.body;

    if (!submissionId) {
        return res.status(400).json({ message: 'Submission id is required.' });
    }

    const submission = await Submission.findById(submissionId);
    if (!submission) {
        return res.status(404).json({ message: 'Submission not found.' });
    }

    const exam = await Exam.findById(submission.exam);
    if (!exam) {
        return res.status(404).json({ message: 'Associated exam not found.' });
    }

    // Only exam creator or admin can update
    if (!exam.createdBy.equals(req.user._id) && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'You cannot modify this submission.' });
    }

    const parsed = Number(score);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return res.status(400).json({ message: 'Score must be a non-negative number.' });
    }

    // Cap by question count if available
    const questionCount = Array.isArray(submission.answers) ? submission.answers.length : 0;
    if (questionCount && parsed > questionCount) {
        return res.status(400).json({ message: `Score cannot exceed total questions (${questionCount}).` });
    }

    submission.score = parsed;
    await submission.save();

    // Optionally update session.finalScore if linked
    if (submission.session) {
        const session = await ExamSession.findById(submission.session);
        if (session) {
            session.finalScore = parsed;
            await session.save();
        }
    }

    res.json({ success: true, submissionId: submission._id, score: submission.score });
});

module.exports.updateSubmissionScore = updateSubmissionScore;

// Update score for a specific answer (manual per-question grading)
const updateSubmissionAnswerScore = asyncHandler(async (req, res) => {
    const { submissionId, answerIndex } = req.params;
    const { isCorrect } = req.body;

    const idx = Number(answerIndex);
    if (!submissionId || Number.isNaN(idx) || idx < 0) {
        return res.status(400).json({ message: 'Invalid submission or answer index.' });
    }

    const submission = await Submission.findById(submissionId);
    if (!submission) {
        return res.status(404).json({ message: 'Submission not found.' });
    }

    const exam = await Exam.findById(submission.exam);
    if (!exam) {
        return res.status(404).json({ message: 'Associated exam not found.' });
    }

    // Only exam creator or admin can update
    if (!exam.createdBy.equals(req.user._id) && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'You cannot modify this submission.' });
    }

    if (typeof isCorrect !== 'boolean') {
        return res.status(400).json({ message: 'isCorrect must be boolean.' });
    }

    if (!Array.isArray(submission.answers) || idx >= submission.answers.length) {
        return res.status(400).json({ message: 'Answer index out of range.' });
    }

    // Update the answer correctness
    submission.answers[idx].isCorrect = isCorrect;

    // Recalculate total score (count of correct answers)
    let newScore = 0;
    submission.answers.forEach((ans) => {
        if (ans && typeof ans.isCorrect === 'boolean' && ans.isCorrect === true) newScore += 1;
    });

    submission.score = newScore;
    await submission.save();

    // If session exists, update finalScore
    if (submission.session) {
        const session = await ExamSession.findById(submission.session);
        if (session) {
            session.finalScore = newScore;
            await session.save();
        }
    }

    res.json({ success: true, submissionId: submission._id, answerIndex: idx, isCorrect, score: newScore });
});

module.exports.updateSubmissionAnswerScore = updateSubmissionAnswerScore;

// Delete a submission (instructors / admins)
const deleteSubmission = asyncHandler(async (req, res) => {
    const { submissionId } = req.params;

    if (!submissionId) {
        return res.status(400).json({ message: 'Submission id is required.' });
    }

    const submission = await Submission.findById(submissionId);
    if (!submission) {
        return res.status(404).json({ message: 'Submission not found.' });
    }

    const exam = await Exam.findById(submission.exam);
    if (!exam) {
        return res.status(404).json({ message: 'Associated exam not found.' });
    }

    // Only exam creator or admin can delete
    if (!exam.createdBy.equals(req.user._id) && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'You cannot delete this submission.' });
    }

    // If a session references this submission, clear reference and finalScore
    if (submission.session) {
        try {
            const session = await ExamSession.findById(submission.session);
            if (session) {
                session.submission = null;
                session.finalScore = null;
                session.markModified('submission');
                session.markModified('finalScore');
                await session.save();
            }
        } catch (err) {
            // non-fatal, continue with deletion
            console.error('Failed to clear referenced session for deleted submission', err);
        }
    }

    await Submission.deleteOne({ _id: submission._id });

    res.json({ success: true, submissionId: submission._id });
});

module.exports.deleteSubmission = deleteSubmission;

// Adjust scores for all submissions of an exam by a delta (can be negative)
const adjustSubmissionScores = asyncHandler(async (req, res) => {
    const { examId } = req.params;
    const { delta } = req.body;

    if (!examId) {
        return res.status(400).json({ message: 'Exam id is required.' });
    }

    const parsedDelta = Number(delta);
    if (!Number.isFinite(parsedDelta) || parsedDelta === 0) {
        return res.status(400).json({ message: 'Delta must be a non-zero number.' });
    }

    const exam = await Exam.findById(examId);
    if (!exam) {
        return res.status(404).json({ message: 'Exam not found.' });
    }

    // Only exam creator or admin can adjust
    if (!exam.createdBy.equals(req.user._id) && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'You cannot modify submissions for this exam.' });
    }

    // Fetch submissions for the exam
    const submissions = await Submission.find({ exam: examId });
    let updatedCount = 0;

    for (const submission of submissions) {
        const questionCount = Array.isArray(submission.answers) ? submission.answers.length : 0;
        const current = Number(submission.score) || 0;
        let next = current + parsedDelta;
        if (next < 0) next = 0;
        if (questionCount && next > questionCount) next = questionCount;
        if (next !== current) {
            submission.score = next;
            try {
                await submission.save();
                // update session finalScore if present
                if (submission.session) {
                    try {
                        const session = await ExamSession.findById(submission.session);
                        if (session) {
                            session.finalScore = next;
                            await session.save();
                        }
                    } catch (err) {
                        console.error('Failed to update session after adjusting scores', err);
                    }
                }
                updatedCount += 1;
            } catch (err) {
                console.error('Failed to save adjusted submission', submission._id, err);
            }
        }
    }

    res.json({ success: true, updated: updatedCount, total: submissions.length, delta: parsedDelta });
});

module.exports.adjustSubmissionScores = adjustSubmissionScores;
