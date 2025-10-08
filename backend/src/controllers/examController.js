const Exam=require('../models/Exam');
const Organization=require('../models/Organization');
const Question=require('../models/Question');
const Submission=require('../models/Submission');
const ExamSession=require('../models/ExamSession');
const ExamActivityLog=require('../models/ExamActivityLog');
const asyncHandler=require('../utils/asyncHandler');
const { isValidEmail }=require('../utils/validators');

const VISIBILITY_OPTIONS=['public','organizations','custom','mixed'];

function toArray(value){
    if(Array.isArray(value)){
        return value;
    }
    if(typeof value==='undefined' || value===null || value===''){
        return [];
    }
    return [value];
}

function normalizeEmails(values){
    const emails=new Set();
    toArray(values).forEach((value)=>{
        if(typeof value!=='string'){
            return;
        }
        const email=value.trim().toLowerCase();
        if(email){
            emails.add(email);
        }
    });
    return Array.from(emails);
}

function normalizeId(value){
    if(!value){
        return null;
    }
    if(typeof value==='string'){
        return value;
    }
    if(typeof value.toString==='function'){
        return value.toString();
    }
    if(value._id && typeof value._id.toString==='function'){
        return value._id.toString();
    }
    return null;
}

function studentCanAccessExam(exam,user){
    if(!exam || !user){
        return false;
    }

    const userOrganizations=new Set((user.organizations||[]).map((id)=>id.toString()));
    const examOrganizations=(exam.organizationTargets||[])
        .map((organization)=>normalizeId(organization?._id||organization))
        .filter(Boolean);

    const invitedEmails=(exam.invitedStudentEmails||[])
        .map((email)=>email.toLowerCase());
    const userEmail=user.email?.toLowerCase();

    const isOrganizationMember=examOrganizations.some((organizationId)=>userOrganizations.has(organizationId));
    const isInvitedStudent=userEmail?invitedEmails.includes(userEmail):false;

    switch(exam.visibility){
    case 'public':
        return true;
    case 'organizations':
        return isOrganizationMember;
    case 'custom':
        return isInvitedStudent;
    case 'mixed':
        return isOrganizationMember || isInvitedStudent;
    default:
        return false;
    }
}

function sanitizeExamForStudent(exam){
    const examObject=exam.toObject({ virtuals:true });

    if(Array.isArray(examObject.organizationTargets)){
        examObject.organizationTargets=examObject.organizationTargets.map((organization)=>{
            if(!organization){
                return null;
            }
            return {
                _id:organization._id,
                name:organization.name,
                description:organization.description
            };
        }).filter(Boolean);
    }

    if(Array.isArray(examObject.questions)){
        examObject.questions=examObject.questions.map((question)=>{
            const type=(question.type||'mcq').toLowerCase();
            const category=(typeof question.category==='string' && question.category.trim())
                ? question.category.trim()
                : 'General';
            const base={
                _id:question._id,
                text:question.text,
                type,
                category,
                requiresManualGrading:type==='written' && !(question.expectedAnswer||'').trim()
            };

            if(type==='mcq'){
                base.options=(question.options||[]).map((option)=>option.text||option);
            }

            if(type==='code'){
                const settings=question.codeSettings||{};
                const publicTestCases=(settings.testCases||[])
                    .filter((testCase)=>testCase && testCase.isPublic)
                    .map((testCase)=>({
                        input:testCase.input||'',
                        expectedOutput:testCase.expectedOutput||''
                    }));

                base.codeSettings={
                    languageId:settings.languageId,
                    languageName:settings.languageName||'',
                    starterCode:settings.starterCode||'',
                    timeLimit:settings.timeLimit||5,
                    memoryLimit:settings.memoryLimit||128000,
                    publicTestCases
                };
            }

            return base;
        });
    }else{
        examObject.questions=[];
    }

    examObject.invitedStudentEmailsCount=(exam.invitedStudentEmails||[]).length;
    delete examObject.invitedStudentEmails;

    return examObject;
}

async function resolveAudienceOptions({ body, user },currentVisibility='public',currentOrganizations=[],currentEmails=[]){
    const requestedVisibility=typeof body.visibility==='string'? body.visibility.toLowerCase():currentVisibility;

    if(!VISIBILITY_OPTIONS.includes(requestedVisibility)){
        const error=new Error('Invalid visibility option.');
        error.status=400;
        throw error;
    }

    const organizationInput=typeof body.organizationIds!=='undefined'
        ? body.organizationIds
        : (typeof body.organizationTargets!=='undefined'? body.organizationTargets:currentOrganizations.map((id)=>id.toString()));

    const uniqueOrganizationIds=Array.from(new Set(toArray(organizationInput).map((value)=>value?.toString()).filter(Boolean)));

    let invitedEmails=normalizeEmails(body.invitedStudentEmails||body.studentEmails||body.allowedStudents||currentEmails);

    let resolvedOrganizations=[];
    if(uniqueOrganizationIds.length){
        const organizations=await Organization.find({ _id:{ $in:uniqueOrganizationIds } }).select('_id');
        if(organizations.length!==uniqueOrganizationIds.length){
            const error=new Error('One or more selected organizations were not found.');
            error.status=400;
            throw error;
        }
        resolvedOrganizations=organizations.map((organization)=>organization._id);
    }

    if(user.role==='instructor' && resolvedOrganizations.length){
        const allowedOrganizationIds=new Set((user.organizations||[]).map((id)=>id.toString()));
        const unauthorized=resolvedOrganizations.filter((organizationId)=>!allowedOrganizationIds.has(organizationId.toString()));
        if(unauthorized.length){
            const error=new Error('You can only target organizations that you belong to.');
            error.status=403;
            throw error;
        }
    }

    if(requestedVisibility==='organizations' && !resolvedOrganizations.length){
        const error=new Error('Select at least one organization for this exam.');
        error.status=400;
        throw error;
    }

    if(requestedVisibility==='custom' && !invitedEmails.length){
        const error=new Error('Provide at least one student email for this exam.');
        error.status=400;
        throw error;
    }

    if(requestedVisibility==='mixed'){
        if(!resolvedOrganizations.length){
            const error=new Error('Provide at least one organization when using mixed visibility.');
            error.status=400;
            throw error;
        }

        if(!invitedEmails.length){
            const error=new Error('Provide at least one student email when using mixed visibility.');
            error.status=400;
            throw error;
        }
    }

    const invalidEmail=invitedEmails.find((email)=>!isValidEmail(email));
    if(invalidEmail){
        const error=new Error(`Invalid email address: ${invalidEmail}`);
        error.status=400;
        throw error;
    }

    if(requestedVisibility==='public'){
        resolvedOrganizations=[];
        invitedEmails=[];
    }

    if(requestedVisibility==='organizations'){
        invitedEmails=[];
    }

    if(requestedVisibility==='custom'){
        resolvedOrganizations=[];
    }

    return {
        visibility:requestedVisibility,
        organizationTargets:resolvedOrganizations,
        invitedStudentEmails:invitedEmails
    };
}

const getExams=asyncHandler(async (req,res)=>{
    const exams=await Exam.find()
        .populate('createdBy','name email role')
        .populate('organizationTargets','name description')
        .populate('questions');

    res.json(exams);
});

const getUpcomingExams=asyncHandler(async (req,res)=>{
    const now=new Date();
    const filters=[
        {
            $or:[
                { endsAt:{ $exists:false } },
                { endsAt:null },
                { endsAt:{ $gte:now } }
            ]
        }
    ];

    if(req.user.role==='student'){
        const organizationIds=(req.user.organizations||[]).map((id)=>id.toString());
        filters.push({
            $or:[
                { visibility:'public' },
                {
                    visibility:{ $in:['organizations','mixed'] },
                    organizationTargets:{ $in:organizationIds }
                },
                {
                    visibility:{ $in:['custom','mixed'] },
                    invitedStudentEmails:req.user.email.toLowerCase()
                }
            ]
        });
    }else if(req.user.role==='instructor'){
        filters.push({ createdBy:req.user._id });
    }

    const exams=await Exam.find({ $and:filters })
        .populate('createdBy','name email role')
        .populate('organizationTargets','name description')
        .sort({ startsAt:1, createdAt:1 });

    const examObjects=exams.map((exam)=>exam.toObject({ virtuals:true }));

    if(req.user.role==='student' && examObjects.length){
        const examIds=examObjects.map((exam)=>exam._id);
        const submissions=await Submission.find({
            student:req.user._id,
            exam:{ $in:examIds }
        }).select('exam');

        const submittedSet=new Set(submissions.map((submission)=>submission.exam.toString()));

        examObjects.forEach((exam)=>{
            const hasSubmitted=submittedSet.has(exam._id.toString());
            exam.hasSubmitted=hasSubmitted;
            exam.hasSubmission=hasSubmitted;
        });
    }

    res.json(examObjects);
});

const getExamById=asyncHandler(async (req,res)=>{
    const exam=await Exam.findById(req.params.id)
        .populate('createdBy','name email role')
        .populate('organizationTargets','name description')
        .populate('questions');

    if(!exam){
        return res.status(404).json({ message:'Exam not found.' });
    }

    if(req.user.role==='student'){
        const now=new Date();

        if(exam.startsAt && exam.startsAt>now){
            return res.status(400).json({ message:'This exam is not open yet.' });
        }

        if(exam.endsAt && exam.endsAt<now){
            return res.status(400).json({ message:'This exam has already ended.' });
        }

        if(!studentCanAccessExam(exam,req.user)){
            return res.status(403).json({ message:'You do not have access to this exam.' });
        }

        const existingSubmission=await Submission.exists({ exam:exam._id, student:req.user._id });
        if(existingSubmission){
            return res.status(409).json({ message:'You have already submitted this exam.' });
        }

        const sanitizedExam=sanitizeExamForStudent(exam);
        return res.json(sanitizedExam);
    }

    res.json(exam);
});

const createExam=asyncHandler(async (req,res)=>{
    const { title, description, durationMinutes, startsAt, endsAt }=req.body;

    if(!title || !durationMinutes){
        return res.status(400).json({ message:'Title and durationMinutes are required.' });
    }

    const audience=await resolveAudienceOptions(req);

    const exam=await Exam.create({
        title,
        description,
        durationMinutes,
        startsAt,
        endsAt,
        createdBy:req.user._id,
        visibility:audience.visibility,
        organizationTargets:audience.organizationTargets,
        invitedStudentEmails:audience.invitedStudentEmails
    });

    await exam.populate([
        { path:'createdBy', select:'name email role' },
        { path:'organizationTargets', select:'name description' }
    ]);

    res.status(201).json(exam);
});

const updateExam=asyncHandler(async (req,res)=>{
    const exam=await Exam.findById(req.params.id);

    if(!exam){
        return res.status(404).json({ message:'Exam not found.' });
    }

    if(!exam.createdBy.equals(req.user._id) && req.user.role!=='admin'){
        return res.status(403).json({ message:'You cannot modify this exam.' });
    }

    const updatableFields=['title','description','durationMinutes','startsAt','endsAt'];
    updatableFields.forEach((field)=>{
        if(typeof req.body[field]!=='undefined'){
            exam[field]=req.body[field];
        }
    });

    const audienceFields=['visibility','organizationIds','organizationTargets','invitedStudentEmails','studentEmails','allowedStudents'];
    const shouldUpdateAudience=audienceFields.some((field)=>typeof req.body[field]!=='undefined');

    if(shouldUpdateAudience){
        const audience=await resolveAudienceOptions(req,exam.visibility,exam.organizationTargets,exam.invitedStudentEmails);
        exam.visibility=audience.visibility;
        exam.organizationTargets=audience.organizationTargets;
        exam.invitedStudentEmails=audience.invitedStudentEmails;
    }

    await exam.save();

    await exam.populate([
        { path:'createdBy', select:'name email role' },
        { path:'organizationTargets', select:'name description' }
    ]);

    res.json(exam);
});

const deleteExam=asyncHandler(async (req,res)=>{
    const exam=await Exam.findById(req.params.id);

    if(!exam){
        return res.status(404).json({ message:'Exam not found.' });
    }

    if(!exam.createdBy.equals(req.user._id) && req.user.role!=='admin'){
        return res.status(403).json({ message:'You cannot delete this exam.' });
    }

    await Promise.all([
        Question.deleteMany({ exam:exam._id }),
        Submission.deleteMany({ exam:exam._id }),
        ExamSession.deleteMany({ exam:exam._id }),
        ExamActivityLog.deleteMany({ exam:exam._id })
    ]);

    await exam.deleteOne();

    res.status(204).end();
});

const ensureExamSession=asyncHandler(async (req,res)=>{
    if(req.user.role!=='student'){
        return res.status(403).json({ message:'Only students can start exam sessions.' });
    }

    const exam=await Exam.findById(req.params.id)
        .select('startsAt endsAt visibility organizationTargets invitedStudentEmails durationMinutes');

    if(!exam){
        return res.status(404).json({ message:'Exam not found.' });
    }

    const now=new Date();

    if(exam.startsAt && exam.startsAt>now){
        return res.status(400).json({ message:'This exam is not open yet.' });
    }

    if(exam.endsAt && exam.endsAt<now){
        return res.status(400).json({ message:'This exam has already ended.' });
    }

    if(!studentCanAccessExam(exam,req.user)){
        return res.status(403).json({ message:'You do not have access to this exam.' });
    }

    const existingSubmission=await Submission.exists({ exam:exam._id, student:req.user._id });
    if(existingSubmission){
        return res.status(409).json({ message:'You have already submitted this exam.' });
    }

    const ipHeader=req.headers['x-forwarded-for'];
    const ipAddress=Array.isArray(ipHeader)? ipHeader[0]:((ipHeader||'').split(',')[0]||req.ip||'');

    let session=await ExamSession.findOne({
        exam:exam._id,
        student:req.user._id,
        status:'active'
    });

    if(session && session.status!=='active'){
        return res.status(409).json({ message:'This exam session is no longer active.' });
    }

    if(!session){
        session=await ExamSession.create({
            exam:exam._id,
            student:req.user._id,
            status:'active',
            startedAt:now,
            metadata:{
                userAgent:req.get('user-agent')||'',
                ipAddress,
                additional:{
                    durationMinutes:exam.durationMinutes,
                    ensureCount:1,
                    lastEnsuredAt:now
                }
            }
        });
    }else{
        const updates={};
        if(!session.metadata){
            session.metadata={};
        }

        if(!session.metadata.userAgent && req.get('user-agent')){
            updates['metadata.userAgent']=req.get('user-agent');
        }

        if(!session.metadata.ipAddress && ipAddress){
            updates['metadata.ipAddress']=ipAddress;
        }

        updates['metadata.additional.ensureCount']=Number(session.metadata?.additional?.ensureCount||0)+1;
        updates['metadata.additional.lastEnsuredAt']=now;

        if(Object.keys(updates).length){
            session=await ExamSession.findByIdAndUpdate(session._id,{ $set:updates },{ new:true });
        }
    }

    res.json({
        session:{
            id:session._id,
            status:session.status,
            startedAt:session.startedAt,
            createdAt:session.createdAt,
            updatedAt:session.updatedAt
        }
    });
});

module.exports={
    getExams,
    getUpcomingExams,
    getExamById,
    createExam,
    updateExam,
    deleteExam,
    ensureExamSession
};
