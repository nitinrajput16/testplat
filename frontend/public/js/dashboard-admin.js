const token=localStorage.getItem('token');
let currentUser=null;

if(!token){
    window.location.href='/login';
}

try{
    currentUser=JSON.parse(localStorage.getItem('currentUser')||'{}');
}catch(error){
    console.error('Failed to parse currentUser from storage',error);
}

if(!currentUser || !currentUser.role){
    window.location.href='/login';
}

if(currentUser.role!=='admin' && currentUser.role!=='instructor'){
    window.location.href='/dashboard-student';
}

const API={
    organizations:'/api/organizations',
    teachers:'/api/admin/teachers',
    exams:'/api/exams',
    questions:'/api/questions',
    assignTeacher:(orgId,teacherId)=>`/api/organizations/${orgId}/teachers/${teacherId}`,
    submissionsForExam:(examId)=>`/api/submissions/exam/${examId}`
};

const CSV_MAX_FILE_SIZE=1024*1024;

const welcomeMessage=document.getElementById('welcomeMessage');
const messageBox=document.getElementById('dashboardMessage');
const adminSection=document.getElementById('adminSection');
const instructorSection=document.getElementById('instructorSection');

const organizationForm=document.getElementById('organizationForm');
const teacherForm=document.getElementById('teacherForm');
const assignTeacherForm=document.getElementById('assignTeacherForm');
const examForm=document.getElementById('examForm');
const examVisibilitySelect=document.getElementById('examVisibility');
const examOrganizationsField=document.getElementById('examOrganizationsField');
const examOrganizationsSelect=document.getElementById('examOrganizations');
const examOrganizationsHint=document.getElementById('examOrganizationsHint');
const examStudentsField=document.getElementById('examStudentsField');
const customStudentEmailsInput=document.getElementById('customStudentEmails');

const teacherOrganizationSelect=document.getElementById('teacherOrganization');
const assignTeacherSelect=document.getElementById('assignTeacherSelect');
const assignOrganizationSelect=document.getElementById('assignOrganizationSelect');
const questionExamSelect=document.getElementById('questionExamSelect');
const questionForm=document.getElementById('questionForm');
const questionImportForm=document.getElementById('questionImportForm');
const questionCsvInput=document.getElementById('questionCsvInput');
const questionImportSubmitButton=questionImportForm?.querySelector('button[type="submit"]');
const questionImportHint=document.getElementById('questionImportHint');
const questionImportHelper=document.getElementById('questionImportHelper');
const questionImportIssues=document.getElementById('questionImportIssues');
const questionTextInput=document.getElementById('questionText');
const questionCategoryInput=document.getElementById('questionCategory');
const DEFAULT_QUESTION_CATEGORY_LABEL=(questionCategoryInput?.defaultValue || 'General').trim() || 'General';
const questionTypeSelect=document.getElementById('questionType');
const correctOptionSelect=document.getElementById('correctOption');
const mcqFields=document.getElementById('mcqFields');
const expectedAnswerField=document.getElementById('expectedAnswerField');
const expectedAnswerInput=document.getElementById('expectedAnswer');
const optionInputs=Array.from(document.querySelectorAll('[data-option-index]'));
const codeFields=document.getElementById('codeFields');
const codeLanguageSelect=document.getElementById('codeLanguage');
const codeStarterEditorContainer=document.getElementById('codeStarterEditor');
const codeStarterTextarea=document.getElementById('codeStarterValue');
const codeTimeLimitInput=document.getElementById('codeTimeLimit');
const codeMemoryLimitInput=document.getElementById('codeMemoryLimit');
const codeTestcasesContainer=document.getElementById('codeTestcasesContainer');
const addTestcaseButton=document.getElementById('addTestcaseButton');
const questionList=document.getElementById('questionList');
const questionEmpty=document.getElementById('questionEmpty');
const questionPreview=document.getElementById('questionPreview');
const questionPreviewContent=document.getElementById('questionPreviewContent');
const examSubmitButton=document.getElementById('examSubmitButton');
const cancelExamEditButton=document.getElementById('cancelExamEditButton');
const questionSubmitButton=document.getElementById('questionSubmitButton');
const cancelQuestionEditButton=document.getElementById('cancelQuestionEditButton');
const examTitleInput=document.getElementById('examTitle');
const examDescriptionInput=document.getElementById('examDescription');
const examDurationInput=document.getElementById('examDuration');
const examStartsAtInput=document.getElementById('examStartsAt');
const examEndsAtInput=document.getElementById('examEndsAt');

const organizationList=document.getElementById('organizationList');
const organizationEmpty=document.getElementById('organizationEmpty');
const organizationSearchInput=document.getElementById('organizationSearch');
const teacherList=document.getElementById('teacherList');
const teacherSearchInput=document.getElementById('teacherSearch');
const teacherEmpty=document.getElementById('teacherEmpty');
const myExamsList=document.getElementById('myExams');
const myExamsEmpty=document.getElementById('myExamsEmpty');
const submissionsPanel=document.getElementById('submissionsPanel');
const submissionsHeader=document.getElementById('submissionsHeader');
const submissionsExamTitle=document.getElementById('submissionsExamTitle');
const submissionsSummary=document.getElementById('submissionsSummary');
const submissionsList=document.getElementById('submissionsList');
const submissionsEmpty=document.getElementById('submissionsEmpty');
const submissionsLoading=document.getElementById('submissionsLoading');
const refreshSubmissionsButton=document.getElementById('refreshSubmissionsButton');
const submissionsSearch=document.getElementById('submissionsSearch');
const globalDeltaInput=document.getElementById('globalDelta');
const applyGlobalDeltaBtn=document.getElementById('applyGlobalDelta');
const instructorNav=document.getElementById('instructorNav');
const instructorTabButtons=Array.from(document.querySelectorAll('[data-instructor-page-target]'));
const instructorPageElements=new Map();
document.querySelectorAll('[data-instructor-page]').forEach((element)=>{
    const key=element.dataset.instructorPage;
    if(key){
        instructorPageElements.set(key,element);
    }
});
let activeInstructorPage=instructorTabButtons.find((button)=>button.classList.contains('active'))?.dataset.instructorPageTarget || 'overview';

const isAdmin=currentUser.role==='admin';
const isInstructor=currentUser.role==='instructor';
const canManageExams=isAdmin || isInstructor;

let cachedOrganizations=[];
let cachedTeachers=[];
let cachedExams=[];
const cachedQuestions=new Map();
let codeEditor=null;
let codeTestcases=[];
let testcaseCounter=0;
const cachedSubmissions=new Map();
const ANTI_CHEAT_EVENT_LABELS={
    TAB_HIDDEN:'Tab hidden / switched',
    CONTEXT_MENU:'Context menu',
    COPY:'Copy',
    CUT:'Cut',
    PASTE:'Paste'
};
const ANTI_CHEAT_RELEVANT_EVENTS=new Set(Object.keys(ANTI_CHEAT_EVENT_LABELS));
let activeSubmissionsExamId=null;
let submissionsLoadingState=false;
let editingExamId=null;
let editingQuestionState=null;
const DATE_TIME_FORMATTER=new Intl.DateTimeFormat(undefined,{ dateStyle:'medium', timeStyle:'short' });
const ORGANIZATION_EMPTY_DEFAULT_MESSAGE='No organizations yet. Create one to get started.';
const ORGANIZATION_SEARCH_EMPTY_MESSAGE='No organizations match your search.';
const TEACHER_EMPTY_DEFAULT_MESSAGE='No teachers registered yet.';
const TEACHER_SEARCH_EMPTY_MESSAGE='No teachers match your search.';
const TEACHER_ALL_INACTIVE_MESSAGE='All teachers in this view are inactive.';

function normalizeQuestionRecord(question){
    if(!question){
        return null;
    }

    const normalized={ ...question };
    const rawCategory=typeof question.category==='string'?question.category.trim():'';
    normalized.category=rawCategory || DEFAULT_QUESTION_CATEGORY_LABEL;

    const rawType=typeof question.type==='string'?question.type.toLowerCase().trim():'';
    normalized.type=rawType || 'mcq';

    const rawIndexValue=typeof question.correctOptionIndex==='string'
        ? Number.parseInt(question.correctOptionIndex,10)
        : question.correctOptionIndex;
    normalized.correctOptionIndex=Number.isInteger(rawIndexValue)?rawIndexValue:null;

    if(Array.isArray(question.options)){
        normalized.options=question.options.map((option)=>{
            if(option && typeof option==='object' && option.text!==undefined){
                return {
                    ...option,
                    text:typeof option.text==='string'?option.text.trim():String(option.text||'')
                };
            }
            return {
                text:typeof option==='string'?option.trim():String(option||'')
            };
        });
    }else{
        normalized.options=[];
    }

    return normalized;
}

function setImportAvailability(enabled){
    if(!questionImportForm){
        return;
    }

    questionImportForm.classList.toggle('disabled',!enabled);

    if(questionCsvInput){
        questionCsvInput.disabled=!enabled;
    }

    if(questionImportSubmitButton){
        questionImportSubmitButton.disabled=!enabled;
    }

    if(questionImportHelper){
        questionImportHelper.classList.toggle('hidden',enabled);
    }
}

if(codeStarterTextarea){
    codeStarterTextarea.addEventListener('input',()=>{
        renderQuestionAuthoringPreview();
    });
}

function describeExamAudience(exam){
    if(!exam){
        return 'Audience: pending configuration';
    }

    const visibility=exam.visibility||'public';
    const organizationNames=Array.isArray(exam.organizationTargets)
        ? exam.organizationTargets
            .map((organization)=>{
                if(!organization){
                    return '';
                }
                if(typeof organization==='string'){
                    return organization;
                }
                return organization.name || organization.title || '';
            })
            .filter(Boolean)
        : [];
    const invitedEmails=Array.isArray(exam.invitedStudentEmails)? exam.invitedStudentEmails:[];
    const invitedCountValue=Number(exam.invitedStudentEmailsCount);
    const emailCount=invitedEmails.length>0
        ? invitedEmails.length
        : Number.isFinite(invitedCountValue)? invitedCountValue:0;
    const firstInvitedEmail=invitedEmails[0];

    switch(visibility){
    case 'public':
        return 'Audience: all students';
    case 'organizations':
        return organizationNames.length
            ? `Audience: ${organizationNames.join(', ')}`
            : 'Audience: selected organizations';
    case 'custom':
        if(emailCount===1 && firstInvitedEmail){
            return `Audience: invited student ${firstInvitedEmail}`;
        }
        return emailCount?`Audience: ${emailCount} invited students`:'Audience: invited students';
    case 'mixed':{
        const parts=[];
        if(organizationNames.length){
            parts.push(organizationNames.join(', '));
        }
        if(emailCount){
            parts.push(`${emailCount} invited student${emailCount>1?'s':''}`);
        }
        return parts.length? `Audience: ${parts.join(' + ')}` : 'Audience: restricted';
    }
    default:
        return 'Audience: unspecified';
    }
}

function formatDateTime(value){
    if(!value){
        return '—';
    }
    try{
        const date=value instanceof Date?value:new Date(value);
        if(Number.isNaN(date.getTime())){
            return String(value);
        }
        return DATE_TIME_FORMATTER.format(date);
    }catch(error){
        console.warn('Failed to format date',error);
        return String(value);
    }
}

function truncateText(text,maxLength=80){
    if(!text){
        return '';
    }
    if(text.length<=maxLength){
        return text;
    }
    return `${text.slice(0,maxLength-1)}…`;
}

function getExamById(examId){
    if(!examId){
        return null;
    }
    return cachedExams.find((exam)=>exam._id===examId) || null;
}

function setActiveExamListItem(examId){
    if(!myExamsList){
        return;
    }
    Array.from(myExamsList.children).forEach((item)=>{
        if(!(item instanceof HTMLElement)){
            return;
        }
        const isActive=examId && item.dataset.examId===examId;
        item.classList.toggle('active',Boolean(isActive));
    });
}

function setSubmissionsLoading(isLoading){
    if(!submissionsLoading){
        return;
    }
    submissionsLoadingState=isLoading;
    submissionsLoading.classList.toggle('hidden',!isLoading);
    if(refreshSubmissionsButton){
        refreshSubmissionsButton.disabled=isLoading;
    }
}

function answerRequiresManualReview(answer){
    if(!answer){
        return false;
    }

    if(answer.codeAnswer){
        if(typeof answer.codeAnswer.manualReviewRequired==='boolean'){
            return answer.codeAnswer.manualReviewRequired;
        }
        return typeof answer.isCorrect==='undefined';
    }

    if(answer.answerData && typeof answer.answerData==='object'){
        if(typeof answer.answerData.manualReviewRequired==='boolean'){
            return answer.answerData.manualReviewRequired;
        }
    }

    if(typeof answer.isCorrect==='undefined'){
        if(typeof answer.answerText==='string' && answer.answerText.length){
            return true;
        }
        if(typeof answer.selectedOptionIndex!=='undefined'){
            return true;
        }
    }

    return false;
}

function countManualReviewAnswers(submission){
    if(!submission){
        return 0;
    }

    const answers=Array.isArray(submission.answers)?submission.answers:[];

    return answers.reduce((total,answer)=>{
        if(answerRequiresManualReview(answer)){
            return total+1;
        }
        return total;
    },0);
}

function toDateTimeLocalInput(value){
    if(!value){
        return '';
    }
    const date=value instanceof Date?value:new Date(value);
    if(Number.isNaN(date.getTime())){
        return '';
    }
    const offsetMinutes=date.getTimezoneOffset();
    const localTimestamp=date.getTime()-(offsetMinutes*60*1000);
    return new Date(localTimestamp).toISOString().slice(0,16);
}

function normalizeEntityId(value){
    if(!value){
        return null;
    }
    if(typeof value==='string'){
        return value;
    }
    if(typeof value.toString==='function'){
        const asString=value.toString();
        if(asString && asString!=='[object Object]'){
            return asString;
        }
    }
    if(value._id){
        return normalizeEntityId(value._id);
    }
    return null;
}

function resetExamForm(){
    editingExamId=null;
    if(!examForm){
        return;
    }

    examForm.reset();

    if(examSubmitButton){
        examSubmitButton.textContent='Publish exam';
        examSubmitButton.removeAttribute('disabled');
    }
    cancelExamEditButton?.classList.add('hidden');

    if(examVisibilitySelect){
        const defaultValue=examVisibilitySelect.options?.[0]?.value || 'public';
        examVisibilitySelect.value=defaultValue;
    }

    if(examOrganizationsSelect){
        Array.from(examOrganizationsSelect.options).forEach((option)=>{
            option.selected=false;
        });
    }

    if(customStudentEmailsInput){
        customStudentEmailsInput.value='';
    }

    toggleExamAudienceFields();
}

function beginExamEdit(examId){
    const exam=getExamById(examId);
    if(!exam || !examForm){
        setMessage('Exam not found.','error',false);
        return;
    }

    editingExamId=examId;

    if(examSubmitButton){
        examSubmitButton.textContent='Update exam';
    }
    cancelExamEditButton?.classList.remove('hidden');

    if(examTitleInput){
        examTitleInput.value=exam.title || '';
    }
    if(examDescriptionInput){
        examDescriptionInput.value=exam.description || '';
    }
    if(examDurationInput){
        examDurationInput.value=Number.isFinite(Number(exam.durationMinutes))
            ? Number(exam.durationMinutes)
            : '';
    }
    if(examStartsAtInput){
        examStartsAtInput.value=toDateTimeLocalInput(exam.startsAt);
    }
    if(examEndsAtInput){
        examEndsAtInput.value=toDateTimeLocalInput(exam.endsAt);
    }
    if(examVisibilitySelect){
        examVisibilitySelect.value=exam.visibility || 'public';
    }

    if(examOrganizationsSelect){
        const organizationIds=(exam.organizationTargets||[])
            .map((organization)=>normalizeEntityId(organization))
            .filter(Boolean);

        const existingOptionValues=new Set(Array.from(examOrganizationsSelect.options).map((option)=>option.value));
        (exam.organizationTargets||[]).forEach((organization)=>{
            const id=normalizeEntityId(organization);
            if(!id || existingOptionValues.has(id)){
                return;
            }
            const option=document.createElement('option');
            option.value=id;
            if(organization && typeof organization==='object'){
                option.textContent=organization.name || organization.title || `Organization ${examOrganizationsSelect.options.length+1}`;
            }else{
                option.textContent=`Organization ${examOrganizationsSelect.options.length+1}`;
            }
            examOrganizationsSelect.appendChild(option);
            existingOptionValues.add(id);
        });

        Array.from(examOrganizationsSelect.options).forEach((option)=>{
            option.selected=organizationIds.includes(option.value);
        });
    }

    if(customStudentEmailsInput){
        const emails=Array.isArray(exam.invitedStudentEmails)?exam.invitedStudentEmails.join('\n'):'';
        customStudentEmailsInput.value=emails;
    }

    toggleExamAudienceFields();
    renderMyExams();
    setInstructorPage('overview',{ focusElement:examTitleInput || examForm });
    examTitleInput?.focus?.();
    if(examTitleInput){
        const length=examTitleInput.value.length;
        examTitleInput.setSelectionRange(length,length);
    }
}

function getQuestionFromCache(examId,questionId){
    if(!examId || !questionId){
        return null;
    }
    const questions=cachedQuestions.get(examId)||[];
    return questions.find((question)=>question && question._id===questionId) || null;
}

function resetQuestionForm(){
    editingQuestionState=null;

    if(!questionForm){
        return;
    }

    questionForm.reset();

    if(questionSubmitButton){
        questionSubmitButton.textContent='Add question';
        questionSubmitButton.removeAttribute('disabled');
    }
    cancelQuestionEditButton?.classList.add('hidden');

    if(questionCategoryInput){
        questionCategoryInput.value=DEFAULT_QUESTION_CATEGORY_LABEL;
    }

    if(questionTypeSelect){
        const defaultType=questionTypeSelect.options?.[0]?.value || 'mcq';
        questionTypeSelect.value=defaultType;
    }

    optionInputs.forEach((input)=>{
        input.value='';
    });

    if(correctOptionSelect){
        correctOptionSelect.value='0';
    }

    if(expectedAnswerInput){
        expectedAnswerInput.value='';
    }

    resetCodeQuestionFields();
    toggleQuestionTypeFields();
    renderQuestionAuthoringPreview();
}

function beginQuestionEdit(examId,questionId){
    const question=getQuestionFromCache(examId,questionId);
    if(!question){
        setMessage('Question not found.','error',false);
        return;
    }

    editingQuestionState={ examId, questionId };

    if(questionSubmitButton){
        questionSubmitButton.textContent='Update question';
    }
    cancelQuestionEditButton?.classList.remove('hidden');

    if(questionExamSelect && questionExamSelect.value!==examId){
        questionExamSelect.value=examId;
    }

    setInstructorPage('questions',{ focusElement:questionForm || questionExamSelect });
    questionForm?.classList.remove('hidden');

    if(questionTextInput){
        questionTextInput.value=question.text || '';
    }

    if(questionCategoryInput){
        const categoryLabel=(question.category && String(question.category).trim()) || DEFAULT_QUESTION_CATEGORY_LABEL;
        questionCategoryInput.value=categoryLabel;
    }

    const type=(question.type || 'mcq').toLowerCase();
    if(questionTypeSelect){
        questionTypeSelect.value=type;
    }

    toggleQuestionTypeFields();

    if(type==='mcq'){
        optionInputs.forEach((input)=>{
            input.value='';
        });

        const options=Array.isArray(question.options)?question.options:[];
        options.forEach((option,index)=>{
            if(!optionInputs[index]){
                return;
            }
            const text=typeof option==='string'?option:(option?.text || '');
            optionInputs[index].value=text;
        });

        if(correctOptionSelect){
            const correctIndex=Number.isInteger(question.correctOptionIndex)
                ?question.correctOptionIndex
                :0;
            const clampedIndex=Math.max(0,Math.min(correctIndex,optionInputs.length-1));
            correctOptionSelect.value=String(clampedIndex);
        }
    }else if(type==='written'){
        if(expectedAnswerInput){
            expectedAnswerInput.value=question.expectedAnswer || '';
        }
    }else if(type==='code'){
        const codeSettings=question.codeSettings || {};
        const languageValue=codeSettings.languageId?String(codeSettings.languageId):(codeLanguageSelect?.options?.[0]?.value || '');
        if(codeLanguageSelect && languageValue){
            const optionsArray=Array.from(codeLanguageSelect.options);
            const hasLanguageOption=optionsArray.some((option)=>option.value===languageValue);
            if(!hasLanguageOption){
                const option=document.createElement('option');
                option.value=languageValue;
                option.textContent=codeSettings.languageName || `Language ${languageValue}`;
                codeLanguageSelect.appendChild(option);
            }
            codeLanguageSelect.value=languageValue;
        }

        ensureCodeEditorInitialized();
        updateCodeEditorLanguage();

        const starterCode=codeSettings.starterCode || getCodeEditorValue();
        setCodeEditorValue(starterCode);

        if(codeTimeLimitInput){
            const timeLimitValue=Number(codeSettings.timeLimit);
            codeTimeLimitInput.value=Number.isFinite(timeLimitValue) && timeLimitValue>0 ? timeLimitValue : '5';
        }
        if(codeMemoryLimitInput){
            const memoryLimitValue=Number(codeSettings.memoryLimit);
            codeMemoryLimitInput.value=Number.isFinite(memoryLimitValue) && memoryLimitValue>=64000
                ? memoryLimitValue
                : '128000';
        }

        const testCases=Array.isArray(codeSettings.testCases)?codeSettings.testCases:[];
        codeTestcases=testCases.length
            ? testCases.map((testcase)=>createTestcase(testcase))
            : [createTestcase()];
        renderCodeTestcases();
    }

    renderQuestions(examId);
    renderQuestionAuthoringPreview();

    if(questionTextInput){
        const length=questionTextInput.value.length;
        questionTextInput.focus();
        questionTextInput.setSelectionRange(length,length);
    }
}

function resetSubmissionsPanel(message='Select an exam to view submissions.'){ // eslint-disable-line default-param-last
    if(!submissionsPanel){
        return;
    }
    submissionsHeader?.classList.add('hidden');
    if(submissionsExamTitle){
        submissionsExamTitle.textContent='Student submissions';
    }
    if(submissionsSummary){
        submissionsSummary.textContent='';
    }
    submissionsList?.replaceChildren?.();
    if(submissionsList && !submissionsList.replaceChildren){
        submissionsList.innerHTML='';
    }
    if(submissionsEmpty){
        submissionsEmpty.textContent=message;
        submissionsEmpty.classList.remove('hidden');
    }
    submissionsLoading?.classList.add('hidden');
    refreshSubmissionsButton?.classList.add('hidden');
    activeSubmissionsExamId=null;
    setActiveExamListItem(null);
}

function renderSubmissionsSummary(exam,submissions,questionCount){
    if(!submissionsSummary || !submissionsExamTitle){
        return;
    }
    submissionsExamTitle.textContent=exam?.title || 'Student submissions';

    if(!Array.isArray(submissions) || !submissions.length){
        if(questionCount){
            submissionsSummary.textContent=`${questionCount} question${questionCount===1?'':'s'} · No submissions yet.`;
        }else{
            submissionsSummary.textContent='No submissions yet.';
        }
        return;
    }

    const totalScore=submissions.reduce((sum,submission)=>sum+(Number(submission.score)||0),0);
    const average=submissions.length?totalScore/submissions.length:0;
    const formattedAverage=Number.isFinite(average)
        ? (average % 1 === 0 ? average.toString() : average.toFixed(1))
        : '0';
    const questionSummary=questionCount?` out of ${questionCount}`:'';

    const summaryParts=[
        `${submissions.length} submission${submissions.length===1?'':'s'}`,
        `Average score ${formattedAverage}${questionSummary}`
    ];

    const manualReviewTotals=submissions.reduce((acc,submission)=>{
        const count=countManualReviewAnswers(submission);
        if(count>0){
            acc.answers+=count;
            acc.submissions+=1;
        }
        return acc;
    },{ answers:0, submissions:0 });

    if(manualReviewTotals.answers>0){
        const answerLabel=manualReviewTotals.answers===1?'answer':'answers';
        const submissionLabel=manualReviewTotals.submissions===1?'submission':'submissions';
        summaryParts.push(`Manual review needed for ${manualReviewTotals.answers} ${answerLabel} across ${manualReviewTotals.submissions} ${submissionLabel}`);
    }

    submissionsSummary.textContent=summaryParts.join(' · ');
}

async function ensureQuestionMap(examId){
    if(!examId){
        return new Map();
    }

    if(!cachedQuestions.has(examId)){
        try{
            const questions=await request(`${API.questions}/${examId}`);
            const normalizedQuestions=Array.isArray(questions)
                ? questions.map((question)=>normalizeQuestionRecord(question)).filter(Boolean)
                : [];
            cachedQuestions.set(examId,normalizedQuestions);
        }catch(error){
            console.error(error);
            setMessage(error.message,'error',false);
            return new Map();
        }
    }

    const questions=(cachedQuestions.get(examId)||[]).map((question)=>normalizeQuestionRecord(question)).filter(Boolean);
    cachedQuestions.set(examId,questions);
    const map=new Map();
    questions.forEach((question)=>{
        if(question && question._id){
            map.set(String(question._id),question);
        }
    });
    return map;
}

function getAnswerStatusMeta(answer,question){
    const isCodeType=question?.type==='code' || Boolean(answer?.codeAnswer);
    const manualReviewFlag=isCodeType
        ? answerRequiresManualReview(answer)
        : (typeof answer?.isCorrect==='undefined' && (question?.type==='written' || typeof answer?.answerText==='string'));

    if(manualReviewFlag){
        return { label:'Manual review required', variant:'warning' };
    }

    if(answer && answer.isCorrect===true){
        return { label:'Correct', variant:'success' };
    }
    if(answer && answer.isCorrect===false){
        return { label:'Incorrect', variant:'error' };
    }
    if(question?.type==='code' && answer?.codeAnswer?.statusDescription){
        return { label:answer.codeAnswer.statusDescription, variant:'info' };
    }
    return { label:'Pending review', variant:'warning' };
}

function createSubmissionAnswerDetails(answer,index,question,submission,onScoreUpdated){
    const details=document.createElement('details');
    details.className='submission-answer';

    const summary=document.createElement('summary');
    summary.className='submission-answer-summary';

    const questionLabel=document.createElement('span');
    const questionTitle=question?.text?truncateText(question.text,80):`Question ${index+1}`;
    questionLabel.className='submission-answer-title';
    questionLabel.textContent=`Q${index+1}: ${questionTitle}`;
    summary.appendChild(questionLabel);

    const statusMeta=getAnswerStatusMeta(answer,question);
    if(statusMeta){
        const badge=document.createElement('span');
        badge.className=`badge ${statusMeta.variant}`;
        badge.textContent=statusMeta.label;
        summary.appendChild(badge);
    }

    details.appendChild(summary);

    const body=document.createElement('div');
    body.className='submission-answer-body';

    if(question?.text){
        const questionParagraph=document.createElement('p');
        questionParagraph.className='submission-question-text muted';
        questionParagraph.textContent=question.text;
        body.appendChild(questionParagraph);
    }

    const type=question?.type || (answer?.codeAnswer?'code':null);

    if(type==='mcq'){
        const selectedIndex=Number.isInteger(answer?.selectedOptionIndex)?answer.selectedOptionIndex:null;
        const selectedOption=(Number.isInteger(selectedIndex) && question?.options?.[selectedIndex])
            ? question.options[selectedIndex].text
            : null;
        const selectedParagraph=document.createElement('p');
        selectedParagraph.textContent=selectedOption
            ? `Selected option: ${selectedOption}`
            : 'No option selected.';
        body.appendChild(selectedParagraph);

        if(answer?.isCorrect===false && Number.isInteger(question?.correctOptionIndex)){
            const correctOption=question.options?.[question.correctOptionIndex]?.text;
            if(correctOption){
                const correctParagraph=document.createElement('p');
                correctParagraph.className='muted';
                correctParagraph.textContent=`Expected answer: ${correctOption}`;
                body.appendChild(correctParagraph);
            }
        }
    }else if(type==='written'){
        const responsePre=document.createElement('pre');
        responsePre.className='submission-written-answer';
        responsePre.textContent=answer?.answerText?.trim()?answer.answerText:'(no response)';
        body.appendChild(responsePre);

        if(answer?.isCorrect===false && question?.expectedAnswer){
            const expectedPre=document.createElement('pre');
            expectedPre.className='submission-written-answer expected';
            expectedPre.textContent=question.expectedAnswer;
            body.appendChild(expectedPre);
        }

        if(typeof answer?.isCorrect==='undefined'){ // manual grading required
            const reviewNote=document.createElement('p');
            reviewNote.className='muted';
            reviewNote.textContent='Requires manual review.';
            body.appendChild(reviewNote);
        }
    }else if(type==='code'){
        const codeAnswer=answer?.codeAnswer || {};
        const languageLabel=codeAnswer.languageName || (codeAnswer.languageId?`Language ${codeAnswer.languageId}`:'Language');
        const languageParagraph=document.createElement('p');
        languageParagraph.textContent=`Language: ${languageLabel}`;
        body.appendChild(languageParagraph);

        const codePre=document.createElement('pre');
        codePre.className='submission-code-block';
        codePre.textContent=codeAnswer.source || '(no source submitted)';
        body.appendChild(codePre);

        if(Array.isArray(codeAnswer.testResults) && codeAnswer.testResults.length){
            const resultsList=document.createElement('ul');
            resultsList.className='submission-test-results';
            codeAnswer.testResults.forEach((test,indexValue)=>{
                const item=document.createElement('li');
                item.className=test.passed?'pass':'fail';
                const humanIndex=Number.isInteger(test.index)?test.index+1:indexValue+1;
                const statusDescription=test.statusDescription || (test.passed?'Accepted':'Failed');
                item.textContent=`Test ${humanIndex}: ${statusDescription}`;
                resultsList.appendChild(item);
            });
            body.appendChild(resultsList);
        }

        if(codeAnswer.lastRunOutput){
            const outputPre=document.createElement('pre');
            outputPre.className='submission-output-block';
            outputPre.textContent=codeAnswer.lastRunOutput;
            body.appendChild(outputPre);
        }

        if(codeAnswer.lastRunError){
            const errorPre=document.createElement('pre');
            errorPre.className='submission-error-block';
            errorPre.textContent=codeAnswer.lastRunError;
            body.appendChild(errorPre);
        }

        if(codeAnswer.time || codeAnswer.memory){
            const runtime=document.createElement('p');
            runtime.className='muted';
            const parts=[];
            if(codeAnswer.time){
                parts.push(`${codeAnswer.time}s`);
            }
            if(codeAnswer.memory){
                parts.push(`${codeAnswer.memory} KB`);
            }
            runtime.textContent=`Last run: ${parts.join(' · ')}`;
            body.appendChild(runtime);
        }

        if(codeAnswer.manualReviewRequired){
            const noteParagraph=document.createElement('p');
            noteParagraph.className='manual-review-note';
            const noteText=typeof codeAnswer.notes==='string' && codeAnswer.notes.trim()
                ? codeAnswer.notes.trim()
                : 'Automated evaluation was unavailable. Please grade this answer manually.';
            noteParagraph.textContent=noteText;
            body.appendChild(noteParagraph);
        }
    }else{
        const fallbackParagraph=document.createElement('p');
        fallbackParagraph.textContent='Answer data not available for this question type.';
        body.appendChild(fallbackParagraph);
    }

    // Inline per-answer grading controls for instructors/admins
    if(canManageExams){
        const controls=document.createElement('div');
        controls.className='answer-score-controls';

        const markCorrectBtn=document.createElement('button');
        markCorrectBtn.type='button';
        markCorrectBtn.className='primary small';
        markCorrectBtn.textContent='Mark correct';

        const markIncorrectBtn=document.createElement('button');
        markIncorrectBtn.type='button';
        markIncorrectBtn.className='secondary small';
        markIncorrectBtn.textContent='Mark incorrect';

        const clearBtn=document.createElement('button');
        clearBtn.type='button';
        clearBtn.className='link-button small';
        clearBtn.textContent='Clear';

        controls.appendChild(markCorrectBtn);
        controls.appendChild(document.createTextNode(' '));
        controls.appendChild(markIncorrectBtn);
        controls.appendChild(document.createTextNode(' '));
        controls.appendChild(clearBtn);

        // disable buttons based on current state
        if(answer && answer.isCorrect===true){
            markCorrectBtn.disabled=true;
        }else if(answer && answer.isCorrect===false){
            markIncorrectBtn.disabled=true;
        }

        async function setAnswerCorrectness(value){
            try{
                markCorrectBtn.disabled=markIncorrectBtn.disabled=clearBtn.disabled=true;
                const resp = await request(`/api/submissions/${submission._id}/answer/${index}/score`, { method:'POST', body: { isCorrect: value } });
                // update local answer and UI
                if(!submission.answers) submission.answers = [];
                if(!submission.answers[index]) submission.answers[index] = answer || {};
                submission.answers[index].isCorrect = value;
                // update badge in summary
                const newBadge = getAnswerStatusMeta(submission.answers[index], question);
                // find existing badge in summary and update
                const existingBadge = summary.querySelector('.badge');
                if(existingBadge){
                    existingBadge.className = `badge ${newBadge.variant}`;
                    existingBadge.textContent = newBadge.label;
                }
                // notify parent to update overall score display
                if(typeof onScoreUpdated === 'function'){
                    onScoreUpdated(resp.score);
                }
                setMessage('Answer updated','success');
            }catch(err){
                console.error(err);
                setMessage(err.message || 'Failed to update answer score','error');
            }finally{
                markCorrectBtn.disabled=false;
                markIncorrectBtn.disabled=false;
                clearBtn.disabled=false;
            }
        }

        markCorrectBtn.addEventListener('click',()=>setAnswerCorrectness(true));
        markIncorrectBtn.addEventListener('click',()=>setAnswerCorrectness(false));
        clearBtn.addEventListener('click',()=>setAnswerCorrectness(undefined));

        body.appendChild(controls);
    }

    details.appendChild(body);
    return details;
}

    function createSubmissionCard(submission,questionMap,questionCount){
    const li=document.createElement('li');
    li.className='submission-card';

    const summary=document.createElement('div');
    summary.className='submission-summary';

    const manualReviewCount=countManualReviewAnswers(submission);

    const identity=document.createElement('div');
    identity.className='submission-identity';

    const name=document.createElement('strong');
    name.textContent=submission?.student?.name || submission?.student?.email || 'Unknown student';
    identity.appendChild(name);

    if(submission?.student?.email){
        const email=document.createElement('span');
        email.className='muted';
        email.textContent=submission.student.email;
        identity.appendChild(email);
    }

    const submittedAt=document.createElement('span');
    submittedAt.className='submission-time muted';
    submittedAt.textContent=`Submitted ${formatDateTime(submission?.submittedAt)}`;
    identity.appendChild(submittedAt);

    summary.appendChild(identity);

    const scoreBlock=document.createElement('div');
    scoreBlock.className='submission-score';
    const totalQuestions=questionCount || submission?.answers?.length || 0;
    const rawScore=Number(submission?.score)||0;
    const percentage=totalQuestions?Math.round((rawScore/totalQuestions)*100):null;
    const parts=[`Score: ${rawScore}${totalQuestions?` / ${totalQuestions}`:''}`];
    if(Number.isFinite(percentage)){
        parts.push(`${percentage}%`);
    }
    scoreBlock.textContent=parts.join(' · ');

    // Add manual edit button for instructors/admins
    if(canManageExams){
        const editScoreBtn=document.createElement('button');
        editScoreBtn.type='button';
        editScoreBtn.className='link-button edit-score-btn';
        editScoreBtn.textContent='Edit score';
        editScoreBtn.addEventListener('click',async()=>{
            openScoreEditor(submission, scoreBlock, totalQuestions);
        });
        scoreBlock.appendChild(document.createTextNode(' '));
        scoreBlock.appendChild(editScoreBtn);

        // Delete submission button
        const deleteBtn=document.createElement('button');
        deleteBtn.type='button';
        deleteBtn.className='link-button danger delete-submission-btn';
        deleteBtn.textContent='Delete';
        deleteBtn.addEventListener('click',async()=>{
            if(!confirm('Delete this submission? This action cannot be undone.')) return;
            try{
                deleteBtn.disabled=true;
                await request(`/api/submissions/${submission._id}`,{ method:'DELETE' });
                // remove from cached list and UI
                const examId = submission.exam;
                const list = cachedSubmissions.get(examId) || [];
                const remaining = list.filter((s)=>String(s._id) !== String(submission._id));
                cachedSubmissions.set(examId, remaining);
                // remove DOM node
                li.remove();
                setMessage('Submission deleted','success');
                // refresh summary
                const examObj = getExamById(examId);
                renderSubmissionsSummary(examObj, remaining, questionCount);
            }catch(err){
                console.error(err);
                setMessage(err.message || 'Failed to delete submission','error');
                deleteBtn.disabled=false;
            }
        });
        scoreBlock.appendChild(document.createTextNode(' '));
        scoreBlock.appendChild(deleteBtn);
    }

    if(manualReviewCount>0){
        const badge=document.createElement('span');
        badge.className='badge warning manual-review-badge';
        badge.textContent=manualReviewCount===1
            ? 'Manual review needed'
            : `Manual review needed ×${manualReviewCount}`;
        scoreBlock.appendChild(document.createTextNode(' '));
        scoreBlock.appendChild(badge);
        li.classList.add('requires-manual-review');
    }
    summary.appendChild(scoreBlock);

    li.appendChild(summary);

    const activitySummary=submission?.activitySummary || { totalEvents:0, byEventType:{}, lastEventAt:null };
    const totalEvents=Number(activitySummary.totalEvents)||0;
    const byEventType=activitySummary.byEventType && typeof activitySummary.byEventType==='object'
        ? activitySummary.byEventType
        : {};
    const relevantEntries=Object.entries(byEventType)
        .map(([eventType,count])=>[typeof eventType==='string'?eventType.toUpperCase():eventType,count])
        .filter(([eventType,count])=>ANTI_CHEAT_RELEVANT_EVENTS.has(eventType) && Number(count)>0)
        .sort((a,b)=>Number(b[1]) - Number(a[1]));

    const activitySection=document.createElement('div');
    activitySection.className='submission-activity';

    const activityHeader=document.createElement('div');
    activityHeader.className='submission-activity-header';
    const activityTitle=document.createElement('span');
    activityTitle.className='submission-activity-title';
    activityTitle.textContent='Anti-cheat monitoring';
    activityHeader.appendChild(activityTitle);

    const activityCount=document.createElement('span');
    activityCount.className='submission-activity-count';
    activityCount.textContent=totalEvents
        ? `${totalEvents} event${totalEvents===1?'':'s'}`
        : 'No events';
    activityHeader.appendChild(activityCount);

    activitySection.appendChild(activityHeader);

    const tagContainer=document.createElement('div');
    tagContainer.className='submission-activity-tags';

    if(relevantEntries.length){
        relevantEntries.forEach(([eventType,count])=>{
            const label=ANTI_CHEAT_EVENT_LABELS[eventType] || eventType.toLowerCase().replace(/_/g,' ');
            const tag=document.createElement('span');
            tag.className='activity-tag';
            tag.textContent=`${label}: ${count}`;
            tagContainer.appendChild(tag);
        });
    }else{
        const emptyTag=document.createElement('span');
        emptyTag.className='activity-tag muted';
        emptyTag.textContent='No flagged behaviour detected';
        tagContainer.appendChild(emptyTag);
    }

    activitySection.appendChild(tagContainer);

    if(activitySummary.lastEventAt){
        const lastEventNote=document.createElement('span');
        lastEventNote.className='submission-activity-last muted';
        lastEventNote.textContent=`Last event ${formatDateTime(activitySummary.lastEventAt)}`;
        activitySection.appendChild(lastEventNote);
    }

    li.appendChild(activitySection);

    const answersContainer=document.createElement('div');
    answersContainer.className='submission-answers';

    const answers=Array.isArray(submission?.answers)?submission.answers:[];
    if(!answers.length){
        const emptyState=document.createElement('p');
        emptyState.className='muted';
        emptyState.textContent='No answers recorded for this submission.';
        answersContainer.appendChild(emptyState);
    }else{
        answers.forEach((answer,index)=>{
            const questionId=answer?.question?
                (typeof answer.question==='string'?answer.question:String(answer.question._id||answer.question))
                : null;
            const question=questionId?questionMap.get(questionId)||null:null;
            const answerDetails=createSubmissionAnswerDetails(answer,index,question,submission,(newScore)=>{
                // update cached submission score and UI
                submission.score = newScore;
                const rawScore = Number(newScore) || 0;
                const percentage = questionCount ? Math.round((rawScore/questionCount)*100) : null;
                const parts = [`Score: ${rawScore}${questionCount?` / ${questionCount}`:''}`];
                if(Number.isFinite(percentage)) parts.push(`${percentage}%`);
                if(scoreBlock.firstChild) scoreBlock.firstChild.textContent = parts.join(' · ');
            });
            answersContainer.appendChild(answerDetails);
        });
    }

    li.appendChild(answersContainer);
    return li;
}

// Score editor helper
async function openScoreEditor(submission, scoreBlock, totalQuestions){
    if(!submission) return;

    // Prevent multiple editors
    if(scoreBlock.querySelector('.score-editor')) return;

    const currentScore = Number(submission.score) || 0;

    const editor = document.createElement('span');
    editor.className = 'score-editor';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    if(totalQuestions) input.max = String(totalQuestions);
    input.value = String(currentScore);
    input.style.width = '80px';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'primary small';
    saveBtn.textContent = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'secondary small';
    cancelBtn.textContent = 'Cancel';

    editor.appendChild(input);
    editor.appendChild(document.createTextNode(' '));
    editor.appendChild(saveBtn);
    editor.appendChild(document.createTextNode(' '));
    editor.appendChild(cancelBtn);

    scoreBlock.appendChild(document.createTextNode(' '));
    scoreBlock.appendChild(editor);

    cancelBtn.addEventListener('click',()=>{ editor.remove(); });

    saveBtn.addEventListener('click', async ()=>{
        const val = Number(input.value);
        if(!Number.isFinite(val) || val < 0){
            setMessage('Enter a valid non-negative number for score.','error');
            return;
        }
        if(totalQuestions && val > totalQuestions){
            setMessage(`Score cannot exceed total questions (${totalQuestions}).`,'error');
            return;
        }

        try{
            saveBtn.disabled = true;
            const resp = await request(`/api/submissions/${submission._id}/score`,{ method:'POST', body:{ score: val } });
            // Update UI
            submission.score = val;
            const percentage = totalQuestions ? Math.round((val/totalQuestions)*100) : null;
            const parts = [`Score: ${val}${totalQuestions?` / ${totalQuestions}`:''}`];
            if(Number.isFinite(percentage)) parts.push(`${percentage}%`);
            scoreBlock.firstChild.textContent = parts.join(' · ');
            setMessage('Score updated','success');
            editor.remove();
        }catch(error){
            setMessage(error.message || 'Failed to update score','error');
            saveBtn.disabled = false;
        }
    });
}

async function renderSubmissions(examId){
    if(!submissionsPanel){
        return;
    }

    // Apply search filter if present
    const allSubmissions=cachedSubmissions.get(examId)||[];
    const query=(submissionsSearch?.value||'').trim().toLowerCase();
    const submissions = query
        ? allSubmissions.filter((s)=>{
            const name=(s?.student?.name||'').toLowerCase();
            const email=(s?.student?.email||'').toLowerCase();
            return name.includes(query) || email.includes(query);
        })
        : allSubmissions;
    const exam=getExamById(examId);
    const questionMap=await ensureQuestionMap(examId);
    const questionCount=questionMap.size || exam?.questions?.length || 0;

    if(submissionsList){
        submissionsList.replaceChildren?.();
        if(!submissionsList.replaceChildren){
            submissionsList.innerHTML='';
        }
    }

    if(!submissions.length){
        if(submissionsEmpty){
            submissionsEmpty.textContent='No submissions yet. Students will appear here after they submit.';
            submissionsEmpty.classList.remove('hidden');
        }
    }else{
        submissionsEmpty?.classList.add('hidden');
        submissions.forEach((submission)=>{
            const card=createSubmissionCard(submission,questionMap,questionCount);
            submissionsList?.appendChild(card);
        });
    }

    renderSubmissionsSummary(exam,submissions,questionCount);
    submissionsHeader?.classList.remove('hidden');
    refreshSubmissionsButton?.classList.remove('hidden');
    setActiveExamListItem(examId);
}

async function loadExamSubmissions(examId,{ force=false }={}){
    if(!examId || !submissionsPanel){
        return;
    }

    if(submissionsLoadingState && !force){
        return;
    }

    activeSubmissionsExamId=examId;
    submissionsEmpty?.classList.add('hidden');
    submissionsHeader?.classList.add('hidden');
    refreshSubmissionsButton?.classList.add('hidden');
    setSubmissionsLoading(true);

    if(!force && cachedSubmissions.has(examId)){
        await renderSubmissions(examId);
        setSubmissionsLoading(false);
        return;
    }

    try{
        const submissions=await request(API.submissionsForExam(examId));
        cachedSubmissions.set(examId,Array.isArray(submissions)?submissions:[]);
        await renderSubmissions(examId);
    }catch(error){
        console.error(error);
        setMessage(error.message,'error',false);
        if(submissionsEmpty){
            submissionsEmpty.textContent=error.message || 'Failed to load submissions. Please try again.';
            submissionsEmpty.classList.remove('hidden');
        }
        submissionsHeader?.classList.add('hidden');
        refreshSubmissionsButton?.classList.remove('hidden');
        setActiveExamListItem(examId);
    }finally{
        setSubmissionsLoading(false);
    }
}

function setWelcomeMessage(){
    if(!welcomeMessage){
        return;
    }
    const roleLabel=currentUser.role.charAt(0).toUpperCase()+currentUser.role.slice(1);
    welcomeMessage.textContent=`Logged in as ${currentUser.name || 'user'} (${roleLabel})`;
}

function showSection(section){
    if(section){
        section.classList.remove('hidden');
    }
}

function setMessage(text,type='info',autoHide=true){
    if(!messageBox){
        return;
    }
    if(!text){
        messageBox.classList.add('hidden');
        return;
    }
    messageBox.textContent=text;
    messageBox.classList.remove('hidden','info','error','success');
    messageBox.classList.add('alert',type);
    if(autoHide && type==='success'){
        setTimeout(()=>{
            messageBox.classList.add('hidden');
        },2500);
    }
}

function clearQuestionImportIssues(){
    if(!questionImportIssues){
        return;
    }
    questionImportIssues.classList.add('hidden');
    questionImportIssues.innerHTML='';
}

function renderQuestionImportIssues(issues){
    if(!questionImportIssues){
        return;
    }
    questionImportIssues.innerHTML='';

    if(!Array.isArray(issues) || !issues.length){
        questionImportIssues.classList.add('hidden');
        return;
    }

    questionImportIssues.classList.remove('hidden');

    const heading=document.createElement('p');
    heading.className='muted small';
    heading.textContent='Some rows were skipped:';
    questionImportIssues.appendChild(heading);

    const list=document.createElement('ul');
    list.className='import-issues-list';

    issues.slice(0,5).forEach((issue)=>{
        const listItem=document.createElement('li');
        listItem.textContent=issue;
        list.appendChild(listItem);
    });

    questionImportIssues.appendChild(list);

    if(issues.length>5){
        const remainingCount=issues.length-5;
        const more=document.createElement('p');
        more.className='muted small';
        more.textContent=`${remainingCount} more issue${remainingCount===1?'':'s'} not shown.`;
        questionImportIssues.appendChild(more);
    }
}

function setInstructorPage(page,{ focusElement=null, suppressScroll=false }={}){
    if(!page || !instructorPageElements.has(page)){
        return;
    }

    const nextElement=instructorPageElements.get(page);
    const hasChanged=page!==activeInstructorPage;

    if(hasChanged){
        const previousElement=instructorPageElements.get(activeInstructorPage);
        previousElement?.classList.add('hidden');
        previousElement?.setAttribute('aria-hidden','true');

        nextElement?.classList.remove('hidden');
        nextElement?.setAttribute('aria-hidden','false');

        if(page==='questions'){
            ensureCodeEditorInitialized();
        }

        activeInstructorPage=page;
    }

    instructorTabButtons.forEach((button)=>{
        const isActive=button.dataset.instructorPageTarget===page;
        button.classList.toggle('active',isActive);
        button.setAttribute('aria-selected',isActive?'true':'false');
        button.setAttribute('tabindex',isActive?'0':'-1');
    });

    if(suppressScroll){
        return;
    }

    const target=focusElement || nextElement;
    if(target){
        requestAnimationFrame(()=>{
            target.scrollIntoView({ behavior:'smooth', block:'start' });
        });
    }
}

function getSelectedMonacoLanguage(){
    const option=codeLanguageSelect?.selectedOptions?.[0];
    return option?.dataset?.monaco || 'javascript';
}

function defaultCodeTemplate(language){
    switch(language){
    case 'python':
        return 'def solve():\n    # Write your code here\n    pass\n\nif __name__ == "__main__":\n    solve()\n';
    case 'cpp':
        return '#include <bits/stdc++.h>\nusing namespace std;\n\nint main(){\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // Write your code here\n    return 0;\n}\n';
    case 'java':
        return 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        // Write your code here\n    }\n}\n';
    case 'csharp':
        return 'using System;\n\npublic class Program {\n    public static void Main() {\n        // Write your code here\n    }\n}\n';
    case 'typescript':
        return '// Write your solution here\nfunction solve(): void {\n    // ...\n}\n\nsolve();\n';
    case 'go':
        return 'package main\n\nimport "fmt"\n\nfunc main() {\n    // Write your code here\n    fmt.Println("Hello, Judge0!")\n}\n';
    default:
        return '// Write your solution here\n';
    }
}

function getCodeEditorValue(){
    if(codeEditor && typeof codeEditor.getValue==='function'){
        return codeEditor.getValue();
    }
    return codeStarterTextarea?.value || '';
}

function setCodeEditorValue(value){
    if(codeEditor && typeof codeEditor.setValue==='function'){
        codeEditor.setValue(value);
    }
    if(codeStarterTextarea){
        codeStarterTextarea.value=value;
    }
}

async function ensureCodeEditorInitialized(){
    if(!codeStarterEditorContainer){
        if(codeStarterTextarea){
            codeStarterTextarea.classList.remove('hidden');
        }
        return;
    }

    if(!window.MonacoHelper){
        if(codeStarterTextarea){
            codeStarterTextarea.classList.remove('hidden');
            if(!codeStarterTextarea.value){
                const monacoLanguage=getSelectedMonacoLanguage();
                codeStarterTextarea.value=defaultCodeTemplate(monacoLanguage);
            }
        }
        return;
    }
    if(codeEditor){
        return;
    }
    try{
        const monacoLanguage=getSelectedMonacoLanguage();
        let initialValue=getCodeEditorValue();
        if(!initialValue){
            initialValue=defaultCodeTemplate(monacoLanguage);
        }
        codeEditor=await window.MonacoHelper.createEditor(codeStarterEditorContainer,{
            value:initialValue,
            language:monacoLanguage,
            theme:'vs-dark',
            minimap:false,
            fontSize:15
        });
        setCodeEditorValue(initialValue);
        if(codeStarterTextarea){
            codeStarterTextarea.classList.add('hidden');
        }
        if(codeEditor && typeof codeEditor.onDidChangeModelContent==='function'){
            codeEditor.onDidChangeModelContent(()=>{
                const value=codeEditor.getValue();
                if(codeStarterTextarea){
                    codeStarterTextarea.value=value;
                }
                renderQuestionAuthoringPreview();
            });
        }
    }catch(error){
        console.error('Failed to initialize Monaco editor for code questions',error);
    }
}

function updateCodeEditorLanguage(){
    if(!codeEditor || !window.MonacoHelper){
        const monacoLanguage=getSelectedMonacoLanguage();
        setCodeEditorValue(defaultCodeTemplate(monacoLanguage));
        renderQuestionAuthoringPreview();
        return;
    }
    const monacoLanguage=getSelectedMonacoLanguage();
    window.MonacoHelper.updateLanguage(codeEditor,monacoLanguage);
    setCodeEditorValue(defaultCodeTemplate(monacoLanguage));
    renderQuestionAuthoringPreview();
}

function createTestcase(initial={}){
    testcaseCounter+=1;
    return {
        id:`tc-${Date.now()}-${testcaseCounter}`,
        input:initial.input||'',
        expectedOutput:initial.expectedOutput||'',
        isPublic:Boolean(initial.isPublic)
    };
}

function renderCodeTestcases(){
    if(!codeTestcasesContainer){
        return;
    }

    codeTestcasesContainer.innerHTML='';

    if(!codeTestcases.length){
        const empty=document.createElement('p');
        empty.className='muted small';
        empty.textContent='Add at least one test case to evaluate code submissions.';
        codeTestcasesContainer.appendChild(empty);
        return;
    }

    codeTestcases.forEach((testcase,index)=>{
        const item=document.createElement('div');
        item.className='testcase-item';
        item.dataset.caseId=testcase.id;

        const header=document.createElement('div');
        header.className='testcase-header';

        const title=document.createElement('strong');
        title.textContent=`Test case ${index+1}`;
        header.appendChild(title);

        const removeBtn=document.createElement('button');
        removeBtn.type='button';
        removeBtn.className='link-button';
        removeBtn.dataset.action='remove-testcase';
        removeBtn.textContent='Remove';
        if(codeTestcases.length<=1){
            removeBtn.disabled=true;
        }
        header.appendChild(removeBtn);

        item.appendChild(header);

        const inputLabel=document.createElement('label');
        inputLabel.textContent='Input (stdin)';
        item.appendChild(inputLabel);

        const inputTextarea=document.createElement('textarea');
        inputTextarea.dataset.field='input';
        inputTextarea.placeholder='Optional input passed to stdin';
        inputTextarea.value=testcase.input;
        item.appendChild(inputTextarea);

        const outputLabel=document.createElement('label');
        outputLabel.textContent='Expected output *';
        item.appendChild(outputLabel);

        const outputTextarea=document.createElement('textarea');
        outputTextarea.dataset.field='expectedOutput';
        outputTextarea.placeholder='Exact expected output';
        outputTextarea.value=testcase.expectedOutput;
        item.appendChild(outputTextarea);

        const publicToggle=document.createElement('label');
        publicToggle.className='checkbox-inline';
        const checkbox=document.createElement('input');
        checkbox.type='checkbox';
        checkbox.dataset.field='isPublic';
        checkbox.checked=Boolean(testcase.isPublic);
        publicToggle.appendChild(checkbox);
        publicToggle.appendChild(document.createTextNode(' Visible to students as sample')); // eslint-disable-line quotes
        item.appendChild(publicToggle);

        codeTestcasesContainer.appendChild(item);
    });
}

function ensureDefaultCodeTestcase(){
    if(!codeTestcases.length){
        codeTestcases=[createTestcase()];
        renderCodeTestcases();
    }
    renderQuestionAuthoringPreview();
}

function resetCodeQuestionFields(){
    if(codeLanguageSelect){
        codeLanguageSelect.selectedIndex=0;
    }
    if(codeTimeLimitInput){
        codeTimeLimitInput.value='5';
    }
    if(codeMemoryLimitInput){
        codeMemoryLimitInput.value='128000';
    }
    const monacoLanguage=getSelectedMonacoLanguage();
    setCodeEditorValue(defaultCodeTemplate(monacoLanguage));
    if(codeEditor){
        updateCodeEditorLanguage();
    }
    codeTestcases=[createTestcase()];
    renderCodeTestcases();
    renderQuestionAuthoringPreview();
}

function updateTestcaseField(caseId,field,value){
    const target=codeTestcases.find((testcase)=>testcase.id===caseId);
    if(!target){
        return;
    }
    if(field==='isPublic'){
        target.isPublic=Boolean(value);
        return;
    }
    target[field]=value;
}

function removeTestcase(caseId){
    if(codeTestcases.length<=1){
        setMessage('At least one test case is required for code questions.','error');
        return;
    }
    codeTestcases=codeTestcases.filter((testcase)=>testcase.id!==caseId);
    renderCodeTestcases();
    renderQuestionAuthoringPreview();
}

async function request(url,{ method='GET', body }={}){
    const options={
        method,
        headers:{
            Authorization:`Bearer ${token}`,
            Accept:'application/json'
        }
    };

    if(body){
        if(body instanceof FormData){
            options.body=body;
        }else{
            options.headers['Content-Type']='application/json';
            options.body=JSON.stringify(body);
        }
    }

    const response=await fetch(url,options);

    if(response.status===401){
        localStorage.removeItem('token');
        localStorage.removeItem('currentUser');
        window.location.href='/login';
        throw new Error('Session expired. Please sign in again.');
    }

    if(response.status===204){
        return null;
    }

    const data=await response.json().catch(()=>({}));

    if(!response.ok){
        const message=data.message || response.statusText || 'Request failed.';
        throw new Error(message);
    }

    return data;
}

function renderOrganizations(){
    if(!organizationList){
        return;
    }
    const query=(organizationSearchInput?.value || '').trim().toLowerCase();

    const filteredOrganizations=cachedOrganizations.filter((organization)=>{
        if(!query){
            return true;
        }
        const name=(organization.name || '').toLowerCase();
        const description=(organization.description || '').toLowerCase();
        const teacherNames=Array.isArray(organization.teachers)
            ? organization.teachers.map((teacher)=>teacher?.name || '').join(' ').toLowerCase()
            : '';
        return name.includes(query) || description.includes(query) || teacherNames.includes(query);
    });

    organizationList.innerHTML='';

    const hasOrganizations=cachedOrganizations.length>0;
    const hasResults=filteredOrganizations.length>0;

    if(organizationSearchInput){
        organizationSearchInput.disabled=!hasOrganizations;
    }

    if(!hasOrganizations){
        if(organizationEmpty){
            organizationEmpty.textContent=ORGANIZATION_EMPTY_DEFAULT_MESSAGE;
            organizationEmpty.classList.remove('hidden');
        }
        if(organizationSearchInput){
            organizationSearchInput.value='';
        }
        return;
    }

    if(!hasResults){
        if(organizationEmpty){
            organizationEmpty.textContent=query?ORGANIZATION_SEARCH_EMPTY_MESSAGE:ORGANIZATION_EMPTY_DEFAULT_MESSAGE;
            organizationEmpty.classList.remove('hidden');
        }
        return;
    }

    if(organizationEmpty){
        organizationEmpty.textContent=ORGANIZATION_EMPTY_DEFAULT_MESSAGE;
        organizationEmpty.classList.add('hidden');
    }

    filteredOrganizations.forEach((organization)=>{
        const li=document.createElement('li');
        const info=document.createElement('div');
        const title=document.createElement('strong');
        title.textContent=organization.name;
        info.appendChild(title);

        const description=document.createElement('div');
        description.className='muted';
        description.textContent=organization.description || 'No description provided.';
        info.appendChild(description);

        const teacherCount=document.createElement('div');
        teacherCount.className='muted';
        teacherCount.textContent=`Teachers assigned: ${organization.teachers?.length || 0}`;
        info.appendChild(teacherCount);

        if(organization.teachers && organization.teachers.length){
            const teacherWrap=document.createElement('div');
            teacherWrap.className='actions-row';
            organization.teachers.forEach((teacher)=>{
                const chip=document.createElement('div');
                chip.className='teacher-chip';

                const badge=document.createElement('span');
                badge.className='badge';
                badge.textContent=teacher.name;
                chip.appendChild(badge);

                const removeBtn=document.createElement('button');
                removeBtn.type='button';
                removeBtn.className='link-button';
                removeBtn.dataset.action='remove-org-teacher';
                removeBtn.dataset.orgId=organization._id;
                removeBtn.dataset.teacherId=teacher._id;
                removeBtn.textContent='Remove';
                chip.appendChild(removeBtn);

                teacherWrap.appendChild(chip);
            });
            info.appendChild(teacherWrap);
        }

        li.appendChild(info);

        const actions=document.createElement('div');
        actions.className='actions-row';
        const deleteButton=document.createElement('button');
        deleteButton.type='button';
        deleteButton.dataset.action='delete-organization';
        deleteButton.dataset.orgId=organization._id;
        deleteButton.textContent='Delete';
        actions.appendChild(deleteButton);
        li.appendChild(actions);

        organizationList.appendChild(li);
    });
}

function renderTeachers(){
    if(!teacherList){
        return;
    }

    const query=(teacherSearchInput?.value || '').trim().toLowerCase();
    const hasTeachers=cachedTeachers.length>0;

    if(teacherSearchInput){
        teacherSearchInput.disabled=!hasTeachers;
        if(!hasTeachers){
            teacherSearchInput.value='';
        }
    }

    teacherList.innerHTML='';

    if(!hasTeachers){
        if(teacherEmpty){
            teacherEmpty.textContent=TEACHER_EMPTY_DEFAULT_MESSAGE;
            teacherEmpty.classList.remove('hidden');
        }
        return;
    }

    const filteredTeachers=cachedTeachers.filter((teacher)=>{
        if(!query){
            return true;
        }
        const name=(teacher.name || '').toLowerCase();
        const email=(teacher.email || '').toLowerCase();
        const organizationNames=Array.isArray(teacher.organizations)
            ? teacher.organizations.map((organization)=>organization?.name || '').join(' ').toLowerCase()
            : '';
        return name.includes(query) || email.includes(query) || organizationNames.includes(query);
    });

    if(!filteredTeachers.length){
        if(teacherEmpty){
            teacherEmpty.textContent=query?TEACHER_SEARCH_EMPTY_MESSAGE:TEACHER_EMPTY_DEFAULT_MESSAGE;
            teacherEmpty.classList.remove('hidden');
        }
        return;
    }

    if(teacherEmpty){
        teacherEmpty.textContent=TEACHER_EMPTY_DEFAULT_MESSAGE;
        teacherEmpty.classList.add('hidden');
    }

    const activeFiltered=filteredTeachers.filter((teacher)=>teacher.isActive!==false);

    filteredTeachers.forEach((teacher)=>{
        const li=document.createElement('li');
        const info=document.createElement('div');

        const title=document.createElement('strong');
        title.textContent=teacher.name;
        info.appendChild(title);

        const email=document.createElement('div');
        email.className='muted';
        email.textContent=teacher.email;
        info.appendChild(email);

        const organizations=Array.isArray(teacher.organizations)?teacher.organizations:[];
        if(organizations.length){
            const orgs=document.createElement('div');
            orgs.className='muted';
            const primaryOrganizationName=organizations[0]?.name || 'Organization';
            orgs.textContent=`Organization: ${primaryOrganizationName}`;
            info.appendChild(orgs);
        }

        if(teacher.isActive===false){
            const inactive=document.createElement('span');
            inactive.className='badge';
            inactive.textContent='Inactive';
            info.appendChild(inactive);
        }

        li.appendChild(info);

        const actions=document.createElement('div');
        actions.className='actions-row';

        if(teacher.isActive!==false){
            const removeBtn=document.createElement('button');
            removeBtn.type='button';
            removeBtn.dataset.action='remove-teacher';
            removeBtn.dataset.teacherId=teacher._id;
            removeBtn.textContent='Deactivate';
            actions.appendChild(removeBtn);
        }

        li.appendChild(actions);
        teacherList.appendChild(li);
    });

    if(teacherEmpty){
        if(!activeFiltered.length){
            teacherEmpty.textContent=TEACHER_ALL_INACTIVE_MESSAGE;
            teacherEmpty.classList.remove('hidden');
        }else{
            teacherEmpty.textContent=TEACHER_EMPTY_DEFAULT_MESSAGE;
            teacherEmpty.classList.add('hidden');
        }
    }
}

function renderTeacherOptions(){
    if(!assignTeacherSelect){
        return;
    }

    assignTeacherSelect.innerHTML='<option value="">-- Select teacher --</option>';

    cachedTeachers
        .filter((teacher)=>teacher.isActive!==false)
        .forEach((teacher)=>{
            const option=document.createElement('option');
            option.value=teacher._id;
            option.textContent=teacher.name;
            assignTeacherSelect.appendChild(option);
        });
}

function renderOrganizationOptions(){
    const selects=[teacherOrganizationSelect,assignOrganizationSelect];
    selects.forEach((select)=>{
        if(!select){
            return;
        }
        const placeholder=select.dataset.placeholder||select.options?.[0]?.text||'-- Select --';
        select.innerHTML=`<option value="">${placeholder}</option>`;
        cachedOrganizations.forEach((organization)=>{
            const option=document.createElement('option');
            option.value=organization._id;
            option.textContent=organization.name;
            select.appendChild(option);
        });
    });

    renderExamAudienceOptions();
}

function renderExamAudienceOptions(){
    if(!examOrganizationsSelect){
        return;
    }

    const teacherOrganizationIds=new Set(
        (currentUser.organizations||[])
            .map((entry)=>{
                if(!entry){
                    return null;
                }
                if(typeof entry==='string'){
                    return entry;
                }
                if(typeof entry==='object'){
                    const objectId=entry._id || entry.id;
                    if(objectId){
                        return objectId.toString();
                    }
                }
                if(typeof entry.toString==='function'){
                    const value=entry.toString();
                    if(value && value!=='[object Object]'){
                        return value;
                    }
                }
                return null;
            })
            .filter(Boolean)
    );

    const accessibleOrganizations=cachedOrganizations.filter((organization)=>{
        if(isAdmin){
            return true;
        }

        const organizationId=organization._id?.toString?.()||organization._id;
        return teacherOrganizationIds.has(organizationId);
    });

    examOrganizationsSelect.innerHTML='';

    accessibleOrganizations.forEach((organization)=>{
        const option=document.createElement('option');
        option.value=organization._id;
        option.textContent=organization.name;
        examOrganizationsSelect.appendChild(option);
    });

    if(examOrganizationsHint){
        if(accessibleOrganizations.length){
            examOrganizationsHint.textContent='Hold Ctrl (or Cmd on Mac) to select multiple organizations.';
        }else{
            examOrganizationsHint.textContent=isAdmin
                ? 'No organizations exist yet. Create an organization first.'
                : 'No organizations assigned to you yet. Ask an administrator to add you.';
        }
    }

    examOrganizationsSelect.disabled=!accessibleOrganizations.length;

    if(examVisibilitySelect && !accessibleOrganizations.length && (examVisibilitySelect.value==='organizations' || examVisibilitySelect.value==='mixed')){
        examVisibilitySelect.value='custom';
        toggleExamAudienceFields();
    }
}

function renderMyExams(){
    if(!myExamsList){
        return;
    }

    myExamsList.innerHTML='';

    if(!cachedExams.length){
        myExamsEmpty?.classList.remove('hidden');
        return;
    }

    myExamsEmpty?.classList.add('hidden');

    cachedExams.forEach((exam)=>{
        const li=document.createElement('li');
        li.dataset.examId=exam._id;
        if(exam._id===activeSubmissionsExamId){
            li.classList.add('active');
        }
        if(editingExamId===exam._id){
            li.classList.add('editing');
        }
        const info=document.createElement('div');
        const title=document.createElement('strong');
        title.textContent=exam.title;
        info.appendChild(title);

        if(exam.description){
            const description=document.createElement('div');
            description.className='muted';
            description.textContent=exam.description;
            info.appendChild(description);
        }

        const meta=document.createElement('div');
        meta.className='muted';
        meta.textContent=`Duration: ${exam.durationMinutes} minutes`;
        info.appendChild(meta);

        const audience=document.createElement('div');
        audience.className='muted';
        audience.textContent=describeExamAudience(exam);
        info.appendChild(audience);

        if(editingExamId===exam._id){
            const editingBadge=document.createElement('span');
            editingBadge.className='badge editing-badge';
            editingBadge.textContent='Editing';
            info.appendChild(editingBadge);
        }

        li.appendChild(info);
        const actions=document.createElement('div');
        actions.className='actions-row';

        const manageQuestionsButton=document.createElement('button');
        manageQuestionsButton.type='button';
        manageQuestionsButton.dataset.action='manage-questions';
        manageQuestionsButton.dataset.examId=exam._id;
        manageQuestionsButton.textContent='Manage questions';
        actions.appendChild(manageQuestionsButton);

        const editExamButton=document.createElement('button');
        editExamButton.type='button';
        editExamButton.className='secondary';
        editExamButton.dataset.action='edit-exam';
        editExamButton.dataset.examId=exam._id;
        editExamButton.textContent='Edit details';
    editExamButton.disabled=editingExamId===exam._id;
        actions.appendChild(editExamButton);

        const viewSubmissionsButton=document.createElement('button');
        viewSubmissionsButton.type='button';
        viewSubmissionsButton.className='secondary';
        viewSubmissionsButton.dataset.action='view-submissions';
        viewSubmissionsButton.dataset.examId=exam._id;
        viewSubmissionsButton.textContent='View submissions';
        actions.appendChild(viewSubmissionsButton);

        const deleteExamButton=document.createElement('button');
        deleteExamButton.type='button';
        deleteExamButton.className='link-button';
        deleteExamButton.dataset.action='delete-exam';
        deleteExamButton.dataset.examId=exam._id;
        deleteExamButton.textContent='Delete exam';
        actions.appendChild(deleteExamButton);

        li.appendChild(actions);
        myExamsList.appendChild(li);
    });

    renderQuestionExamOptions();
}

function renderQuestionExamOptions(){
    if(!questionExamSelect){
        return;
    }

    const placeholder=questionExamSelect.dataset.placeholder||'-- Select exam --';
    const previousValue=questionExamSelect.value;

    questionExamSelect.innerHTML=`<option value="">${placeholder}</option>`;

    const manageableExams=cachedExams.filter((exam)=>{
        if(isAdmin){
            return true;
        }
        const createdBy=exam.createdBy && exam.createdBy._id?exam.createdBy._id:exam.createdBy;
        return createdBy===currentUser._id;
    });

    manageableExams.forEach((exam)=>{
        const option=document.createElement('option');
        option.value=exam._id;
        option.textContent=exam.title;
        questionExamSelect.appendChild(option);
    });

    if(previousValue && manageableExams.some((exam)=>exam._id===previousValue)){
        questionExamSelect.value=previousValue;
        questionForm?.classList.remove('hidden');
        clearQuestionImportIssues();
        setImportAvailability(true);
        renderQuestions(previousValue);
    }else{
        questionExamSelect.value='';
        questionForm?.classList.add('hidden');
        clearQuestionImportIssues();
        setImportAvailability(false);
        questionImportForm?.reset?.();
        if(questionCsvInput){
            questionCsvInput.value='';
        }
        questionEmpty?.classList.remove('hidden');
        if(questionEmpty){
            questionEmpty.textContent=manageableExams.length?
                'Select an exam to manage questions.' :
                'Create an exam first to start adding questions.';
        }
        questionList.innerHTML='';
    }
}

function renderQuestions(examId){
    if(!questionList){
        return;
    }

    const questions=cachedQuestions.get(examId)||[];
    questionList.innerHTML='';

    if(!questions.length){
        questionEmpty?.classList.remove('hidden');
        if(questionEmpty){
            questionEmpty.textContent='No questions yet. Add one using the form above.';
        }
        return;
    }

    questionEmpty?.classList.add('hidden');

    questions.forEach((question,index)=>{
        const li=document.createElement('li');
        li.dataset.questionId=question._id;
        const isEditingQuestion=editingQuestionState?.questionId===question._id;
        if(isEditingQuestion){
            li.classList.add('editing');
        }

        const wrapper=document.createElement('div');
        wrapper.className='question-list-item';

        const titleRow=document.createElement('div');
        titleRow.className='question-meta';

        const title=document.createElement('div');
        title.innerHTML=`<strong>Q${index+1}.</strong> ${question.text}`;
        const typeBadge=document.createElement('span');
        typeBadge.className='badge question-type';
        let typeLabel='Multiple choice';
        if(question.type==='written'){
            typeLabel='Written answer';
        }else if(question.type==='code'){
            typeLabel='Code challenge';
        }
        typeBadge.textContent=typeLabel;
        title.appendChild(typeBadge);

        const categoryLabel=(question.category && String(question.category).trim()) || DEFAULT_QUESTION_CATEGORY_LABEL;
        if(categoryLabel){
            const categoryBadge=document.createElement('span');
            categoryBadge.className='badge question-category';
            categoryBadge.textContent=categoryLabel;
            title.appendChild(categoryBadge);
        }
        if(isEditingQuestion){
            const editingBadge=document.createElement('span');
            editingBadge.className='badge editing-badge';
            editingBadge.textContent='Editing';
            title.appendChild(editingBadge);
        }
        titleRow.appendChild(title);

        const actionGroup=document.createElement('div');
        actionGroup.className='actions-row';

        const editBtn=document.createElement('button');
        editBtn.type='button';
        editBtn.className='secondary';
        editBtn.dataset.action='edit-question';
        editBtn.dataset.questionId=question._id;
        editBtn.dataset.examId=examId;
        editBtn.textContent='Edit';
    editBtn.disabled=isEditingQuestion;
        actionGroup.appendChild(editBtn);

        const deleteBtn=document.createElement('button');
        deleteBtn.type='button';
        deleteBtn.className='link-button';
        deleteBtn.dataset.action='delete-question';
        deleteBtn.dataset.questionId=question._id;
        deleteBtn.dataset.examId=examId;
        deleteBtn.textContent='Delete';
        actionGroup.appendChild(deleteBtn);

        titleRow.appendChild(actionGroup);

        wrapper.appendChild(titleRow);

        if(question.type==='written'){
            const expected=document.createElement('div');
            expected.className='muted';
            expected.textContent=question.expectedAnswer
                ? `Expected answer: ${question.expectedAnswer}`
                : 'Manual grading: review written responses.';
            wrapper.appendChild(expected);
        }else if(question.type==='code'){
            const codeSettings=question.codeSettings||{};
            const languageLabel=codeSettings.languageName || (codeSettings.languageId?`Language ID ${codeSettings.languageId}`:'Language');
            const testCaseCount=Array.isArray(codeSettings.testCases)?codeSettings.testCases.length:0;
            const publicCount=Array.isArray(codeSettings.testCases)
                ?codeSettings.testCases.filter((testcase)=>testcase.isPublic).length
                :0;

            const meta=document.createElement('div');
            meta.className='muted';
            meta.textContent=`Language: ${languageLabel} · Test cases: ${testCaseCount}${publicCount?` (${publicCount} shown to students)`:''}`;
            wrapper.appendChild(meta);

            if(codeSettings.starterCode){
                const preview=document.createElement('pre');
                preview.className='code-preview';
                const lines=codeSettings.starterCode.split('\n').slice(0,6);
                if(codeSettings.starterCode.split('\n').length>6){
                    lines.push('…');
                }
                preview.textContent=lines.join('\n');
                wrapper.appendChild(preview);
            }
        }else if(Array.isArray(question.options)){
            const optionsList=document.createElement('ol');
            optionsList.style.marginLeft='20px';
            optionsList.style.color='#455a64';
            question.options.forEach((option,optionIndex)=>{
                const optionItem=document.createElement('li');
                const isCorrect=optionIndex===question.correctOptionIndex;
                optionItem.textContent=option.text||option;
                if(isCorrect){
                    optionItem.style.fontWeight='600';
                    optionItem.style.color='#0d47a1';
                    optionItem.appendChild(document.createTextNode(' (correct)'));
                }
                optionsList.appendChild(optionItem);
            });
            wrapper.appendChild(optionsList);
        }

        li.appendChild(wrapper);
        questionList.appendChild(li);
    });
}

async function fetchOrganizations(){
    try{
        const organizations=await request(API.organizations);
        cachedOrganizations=organizations;
        renderOrganizations();
        renderOrganizationOptions();
    }catch(error){
        console.error(error);
        setMessage(error.message,'error',false);
    }
}

async function fetchTeachers(){
    if(!isAdmin){
        return;
    }
    try{
        const teachers=await request(API.teachers);
        cachedTeachers=teachers;
        renderTeachers();
        renderTeacherOptions();
    }catch(error){
        console.error(error);
        setMessage(error.message,'error',false);
    }
}

async function fetchMyExams(){
    if(!canManageExams){
        return;
    }
    try{
        const exams=await request(API.exams);
        cachedExams=exams.filter((exam)=>{
            if(!exam.createdBy){
                return false;
            }
            if(isAdmin){
                return true;
            }
            if(typeof exam.createdBy==='string'){
                return exam.createdBy===currentUser._id;
            }
            return exam.createdBy._id===currentUser._id;
        });
        renderMyExams();
    }catch(error){
        console.error(error);
        setMessage(error.message,'error',false);
    }
}

async function fetchQuestions(examId){
    if(!examId){
        return;
    }
    try{
        const questions=await request(`${API.questions}/${examId}`);
        const normalizedQuestions=Array.isArray(questions)
            ? questions.map((question)=>normalizeQuestionRecord(question)).filter(Boolean)
            : [];
        cachedQuestions.set(examId,normalizedQuestions);
        renderQuestions(examId);
    }catch(error){
        console.error(error);
        setMessage(error.message,'error',false);
    }
}

function toggleExamAudienceFields(){
    if(!examVisibilitySelect){
        return;
    }

    const visibility=examVisibilitySelect.value;
    const showOrganizations=visibility==='organizations' || visibility==='mixed';
    const showStudents=visibility==='custom' || visibility==='mixed';

    examOrganizationsField?.classList[showOrganizations?'remove':'add']('hidden');
    examStudentsField?.classList[showStudents?'remove':'add']('hidden');
}

function toggleQuestionTypeFields(){
    const type=questionTypeSelect?.value || 'mcq';
    const isWritten=type==='written';
    const isCode=type==='code';
    const isMcq=!isWritten && !isCode;

    mcqFields?.classList[isMcq?'remove':'add']('hidden');
    expectedAnswerField?.classList[isWritten?'remove':'add']('hidden');
    codeFields?.classList[isCode?'remove':'add']('hidden');

    optionInputs.forEach((input)=>{
        const index=Number(input.dataset.optionIndex);
        input.required=isMcq && index<2;
        input.disabled=!isMcq;
    });

    if(correctOptionSelect){
        correctOptionSelect.disabled=!isMcq;
        correctOptionSelect.required=isMcq;
    }

    if(isCode){
        ensureCodeEditorInitialized();
        ensureDefaultCodeTestcase();
        if(window.MonacoHelper){
            updateCodeEditorLanguage();
        }
    }

    renderQuestionAuthoringPreview();
}

function collectDraftQuestion(){
    const text=(questionTextInput?.value || '').trim();
    if(!text){
        return null;
    }

    const type=questionTypeSelect?.value || 'mcq';
    const category=(questionCategoryInput?.value || '').trim() || DEFAULT_QUESTION_CATEGORY_LABEL;
    const draft={
        text,
        type,
        category
    };

    if(type==='written'){
        draft.expectedAnswer=(expectedAnswerInput?.value || '').trim();
        return draft;
    }

    if(type==='code'){
        const selectedOption=codeLanguageSelect?.selectedOptions?.[0] || null;
        const languageId=codeLanguageSelect?.value || '';
        const starterCode=getCodeEditorValue();
        const timeLimit=Number(codeTimeLimitInput?.value);
        const memoryLimit=Number(codeMemoryLimitInput?.value);
        const sanitizedTestcases=codeTestcases.map((testcase)=>({
            input:testcase.input || '',
            expectedOutput:testcase.expectedOutput || '',
            isPublic:Boolean(testcase.isPublic)
        }));
        const publicSamples=sanitizedTestcases.filter((testcase)=>testcase.isPublic && testcase.expectedOutput.trim());
        const validTestcases=sanitizedTestcases.filter((testcase)=>testcase.expectedOutput.trim());

        draft.code={
            languageId,
            languageName:selectedOption?.textContent?.trim() || '',
            starterCode,
            timeLimit:Number.isFinite(timeLimit)?timeLimit:NaN,
            memoryLimit:Number.isFinite(memoryLimit)?memoryLimit:NaN,
            totalTestcases:validTestcases.length,
            publicSamples
        };
        return draft;
    }

    const correctIndex=Number(correctOptionSelect?.value || '0');
    const options=optionInputs.map((input,index)=>({
        text:(input.value || '').trim(),
        isCorrect:index===correctIndex
    })).filter((option)=>option.text);

    draft.options=options;
    draft.correctIndex=options.findIndex((option)=>option.isCorrect);

    return draft;
}

function renderQuestionAuthoringPreview(){
    if(!questionPreview || !questionPreviewContent){
        return;
    }

    const draft=collectDraftQuestion();
    questionPreviewContent.innerHTML='';

    if(!draft){
        questionPreview?.classList.add('hidden');
        return;
    }

    questionPreview.classList.remove('hidden');

    const card=document.createElement('div');
    card.className='question-card preview-card';

    const header=document.createElement('div');
    header.className='question-header';

    const counter=document.createElement('span');
    counter.className='question-counter';
    counter.textContent='Preview question';
    header.appendChild(counter);

    const text=document.createElement('p');
    text.className='question-text';
    text.textContent=draft.text;
    header.appendChild(text);

    const badge=document.createElement('span');
    badge.className='badge question-type-badge';
    let badgeLabel='Multiple choice';
    if(draft.type==='written'){
        badgeLabel='Written answer';
    }else if(draft.type==='code'){
        badgeLabel='Code challenge';
    }
    badge.textContent=badgeLabel;
    header.appendChild(badge);

    const categoryBadge=document.createElement('span');
    categoryBadge.className='badge question-category';
    categoryBadge.textContent=draft.category || DEFAULT_QUESTION_CATEGORY_LABEL;
    header.appendChild(categoryBadge);

    card.appendChild(header);

    if(draft.type==='written'){
        const textarea=document.createElement('textarea');
        textarea.className='option-textarea';
        textarea.disabled=true;
        textarea.placeholder='Student response area';
        card.appendChild(textarea);

        const helper=document.createElement('p');
        helper.className='answer-summary';
        helper.textContent=draft.expectedAnswer
            ?`Reference answer: ${draft.expectedAnswer}`
            :'Responses will be graded manually unless you provide an expected answer.';
        card.appendChild(helper);
    }else if(draft.type==='code'){
        const { code }=draft;
        const meta=document.createElement('div');
        meta.className='code-meta';
        const limitParts=[];
        if(Number.isFinite(code.timeLimit)){
            limitParts.push(`${code.timeLimit}s CPU limit`);
        }
        if(Number.isFinite(code.memoryLimit)){
            limitParts.push(`${code.memoryLimit} KB memory limit`);
        }
        const limitText=limitParts.length?` · ${limitParts.join(' · ')}`:'';
        meta.textContent=`Language: ${code.languageName || 'Select a language'}${limitText}`;
        card.appendChild(meta);

        const label=document.createElement('p');
        label.className='muted small';
        label.textContent='Starter code (students cannot modify this template).';
        card.appendChild(label);

        const pre=document.createElement('pre');
        pre.className='code-preview-block';
        pre.textContent=code.starterCode || '// Starter code will appear here';
        card.appendChild(pre);

        const testcaseInfo=document.createElement('p');
        testcaseInfo.className='muted small';
        if(code.totalTestcases>0){
            const publicCount=code.publicSamples.length;
            const privateCount=code.totalTestcases-publicCount;
            const parts=[];
            if(publicCount>0){
                parts.push(`${publicCount} sample${publicCount>1?'s':''} shown to students`);
            }
            if(privateCount>0){
                parts.push(`${privateCount} hidden test${privateCount>1?'s':''}`);
            }
            testcaseInfo.textContent=`Test coverage: ${parts.join(' · ') || 'No testcases configured yet.'}`;
        }else{
            testcaseInfo.textContent='Add at least one testcase to evaluate submissions.';
        }
        card.appendChild(testcaseInfo);

        if(code.publicSamples.length){
            const samples=document.createElement('div');
            samples.className='muted small';
            samples.textContent='Sample cases:';
            const list=document.createElement('ul');
            list.className='sample-list';
            code.publicSamples.forEach((sample,index)=>{
                const item=document.createElement('li');
                const title=document.createElement('strong');
                title.textContent=`Example ${index+1}`;
                item.appendChild(title);

                const inputLine=document.createElement('div');
                inputLine.appendChild(document.createTextNode('Input: '));
                if(sample.input){
                    const codeEl=document.createElement('code');
                    codeEl.textContent=sample.input;
                    inputLine.appendChild(codeEl);
                }else{
                    const empty=document.createElement('em');
                    empty.textContent='empty';
                    inputLine.appendChild(empty);
                }
                item.appendChild(inputLine);

                const outputLine=document.createElement('div');
                outputLine.appendChild(document.createTextNode('Expected: '));
                const outputCode=document.createElement('code');
                outputCode.textContent=sample.expectedOutput;
                outputLine.appendChild(outputCode);
                item.appendChild(outputLine);

                list.appendChild(item);
            });
            samples.appendChild(list);
            card.appendChild(samples);
        }
    }else{
        const optionsWrapper=document.createElement('div');
        optionsWrapper.className='option-list';

        if(!draft.options.length){
            const empty=document.createElement('p');
            empty.className='muted small';
            empty.textContent='Add at least two answer options to complete this question.';
            card.appendChild(empty);
        }else{
            draft.options.forEach((option)=>{
                const label=document.createElement('label');
                label.className='option-item';

                const input=document.createElement('input');
                input.type='radio';
                input.disabled=true;
                input.checked=option.isCorrect;

                const span=document.createElement('span');
                span.textContent=option.text;
                if(option.isCorrect){
                    span.style.fontWeight='600';
                }

                label.appendChild(input);
                label.appendChild(span);
                optionsWrapper.appendChild(label);
            });

            card.appendChild(optionsWrapper);

            const helper=document.createElement('p');
            helper.className='answer-summary';
            if(draft.options.length<2){
                helper.textContent='Provide at least two options.';
            }else if(draft.correctIndex<0){
                helper.textContent='Select which option is correct.';
            }else{
                helper.textContent='In the exam, students can select one option and submit.';
            }
            card.appendChild(helper);
        }
    }

    questionPreviewContent.appendChild(card);
}

function parseStudentEmails(value){
    const unique=new Set();
    value
        .split(/[\,\s;]+/)
        .map((email)=>email.trim().toLowerCase())
        .filter(Boolean)
        .forEach((email)=>unique.add(email));
    return Array.from(unique);
}

organizationList?.addEventListener('click',async (event)=>{
    const button=event.target.closest('button');
    if(!button){
        return;
    }

    const { action, orgId, teacherId }=button.dataset;

    if(action==='delete-organization' && orgId){
        if(!confirm('Delete this organization? This will unassign linked teachers.')){
            return;
        }
        try{
            await request(`${API.organizations}/${orgId}`,{ method:'DELETE' });
            cachedOrganizations=cachedOrganizations.filter((org)=>org._id!==orgId);
            renderOrganizations();
            renderOrganizationOptions();
            setMessage('Organization removed.','success');
            await fetchTeachers();
        }catch(error){
            console.error(error);
            setMessage(error.message,'error',false);
        }
    }

    if(action==='remove-org-teacher' && orgId && teacherId){
        try{
            await request(API.assignTeacher(orgId,teacherId),{ method:'DELETE' });
            cachedOrganizations=cachedOrganizations.map((org)=>{
                if(org._id===orgId){
                    return {
                        ...org,
                        teachers:org.teachers.filter((teacher)=>teacher._id!==teacherId)
                    };
                }
                return org;
            });
            renderOrganizations();
            setMessage('Teacher removed from organization.','success');
            await fetchTeachers();
        }catch(error){
            console.error(error);
            setMessage(error.message,'error',false);
        }
    }
});

teacherList?.addEventListener('click',async (event)=>{
    const button=event.target.closest('button');
    if(!button){
        return;
    }

    const { action, teacherId }=button.dataset;
    if(action==='remove-teacher' && teacherId){
        if(!confirm('Deactivate this teacher account?')){
            return;
        }
        try{
            await request(`${API.teachers}/${teacherId}`,{ method:'DELETE' });
            cachedTeachers=cachedTeachers.map((teacher)=>{
                if(teacher._id===teacherId){
                    return {
                        ...teacher,
                        isActive:false,
                        organizations:[]
                    };
                }
                return teacher;
            });
            renderTeachers();
            await fetchOrganizations();
            setMessage('Teacher deactivated.','success');
        }catch(error){
            console.error(error);
            setMessage(error.message,'error',false);
        }
    }
});

instructorNav?.addEventListener('click',(event)=>{
    const button=event.target.closest('[data-instructor-page-target]');
    if(!button){
        return;
    }
    const page=button.dataset.instructorPageTarget;
    if(page){
        setInstructorPage(page);
    }
});

myExamsList?.addEventListener('click',async (event)=>{
    const button=event.target.closest('button');
    if(!button){
        return;
    }

    const { action, examId }=button.dataset;
    if(action==='edit-exam' && examId){
        beginExamEdit(examId);
        return;
    }

    if(action==='view-submissions' && examId){
        setInstructorPage('submissions',{ focusElement:submissionsPanel });
        await loadExamSubmissions(examId);
        return;
    }

    if(action==='manage-questions' && examId){
        setInstructorPage('questions',{ focusElement:questionForm || questionExamSelect });
        if(questionExamSelect){
            if(questionExamSelect.value!==examId){
                questionExamSelect.value=examId;
                questionExamSelect.dispatchEvent(new Event('change',{ bubbles:true }));
            }else{
                questionForm?.classList.remove('hidden');
                toggleQuestionTypeFields();
                if(!cachedQuestions.has(examId)){
                    fetchQuestions(examId);
                }else{
                    renderQuestions(examId);
                }
            }
        }
        return;
    }

    if(action==='delete-exam' && examId){
        if(!confirm('Delete this exam? Questions and student access will be removed.')){
            return;
        }
        try{
            await request(`${API.exams}/${examId}`,{ method:'DELETE' });
            cachedExams=cachedExams.filter((exam)=>exam._id!==examId);
            cachedQuestions.delete(examId);
            cachedSubmissions.delete(examId);
            const wasEditingExam=editingExamId===examId;
            const wasEditingQuestion=editingQuestionState?.examId===examId;
            if(wasEditingExam){
                resetExamForm();
            }
            if(wasEditingQuestion){
                resetQuestionForm();
            }
            if(activeSubmissionsExamId===examId){
                resetSubmissionsPanel('Select an exam to view submissions.');
            }
            renderMyExams();
            renderQuestionExamOptions();
            setMessage('Exam deleted successfully.','success');
        }catch(error){
            console.error(error);
            setMessage(error.message,'error',false);
        }
    }
});

refreshSubmissionsButton?.addEventListener('click',async ()=>{
    if(activeSubmissionsExamId){
        await loadExamSubmissions(activeSubmissionsExamId,{ force:true });
    }
});

organizationForm?.addEventListener('submit',async (event)=>{
    event.preventDefault();
    const formData=new FormData(organizationForm);
    const payload={
        name:formData.get('name').trim(),
        description:formData.get('description').trim()
    };

    try{
        const organization=await request(API.organizations,{ method:'POST', body:payload });
        organizationForm.reset();
        cachedOrganizations=[...cachedOrganizations,organization];
        renderOrganizations();
        renderOrganizationOptions();
        setMessage('Organization created successfully.','success');
    }catch(error){
        console.error(error);
        setMessage(error.message,'error',false);
    }
});

organizationSearchInput?.addEventListener('input',()=>{
    renderOrganizations();
});

teacherSearchInput?.addEventListener('input',()=>{
    renderTeachers();
});

teacherForm?.addEventListener('submit',async (event)=>{
    event.preventDefault();
    const formData=new FormData(teacherForm);
    const payload={
        name:formData.get('name').trim(),
        email:formData.get('email').trim().toLowerCase(),
        password:formData.get('password'),
        organizationId:formData.get('organizationId')||undefined
    };

    try{
        const teacher=await request(API.teachers,{ method:'POST', body:payload });
        teacherForm.reset();
        cachedTeachers=[...cachedTeachers,teacher];
        renderTeachers();
        renderTeacherOptions();
        setMessage('Teacher account created.','success');
        await fetchOrganizations();
    }catch(error){
        console.error(error);
        setMessage(error.message,'error',false);
    }
});

assignTeacherForm?.addEventListener('submit',async (event)=>{
    event.preventDefault();
    const formData=new FormData(assignTeacherForm);
    const teacherId=formData.get('teacherId');
    const organizationId=formData.get('organizationId');

    if(!teacherId || !organizationId){
        setMessage('Select both a teacher and an organization.','error');
        return;
    }

    try{
        const organization=await request(API.assignTeacher(organizationId,teacherId),{ method:'POST' });
        assignTeacherForm.reset();
        cachedOrganizations=cachedOrganizations.map((org)=>org._id===organization._id?organization:org);
        renderOrganizations();
        setMessage('Teacher assigned to organization.','success');
        await fetchTeachers();
    }catch(error){
        console.error(error);
        setMessage(error.message,'error',false);
    }
});

examVisibilitySelect?.addEventListener('change',()=>{
    toggleExamAudienceFields();
});

cancelExamEditButton?.addEventListener('click',()=>{
    const wasEditing=Boolean(editingExamId);
    resetExamForm();
    if(wasEditing){
        renderMyExams();
        renderQuestionExamOptions();
        setMessage('Exam edit cancelled.','info');
    }
});

examForm?.addEventListener('submit',async (event)=>{
    event.preventDefault();
    if(!examForm){
        return;
    }

    const formData=new FormData(examForm);
    const title=(formData.get('title')||'').toString().trim();
    if(!title){
        setMessage('Exam title is required.','error');
        return;
    }

    const description=(formData.get('description')||'').toString().trim();
    const durationValue=Number(formData.get('durationMinutes'));
    if(!Number.isInteger(durationValue) || durationValue<=0){
        setMessage('Enter the exam duration in minutes.','error');
        return;
    }

    const payload={
        title,
        description,
        durationMinutes:durationValue
    };

    const startsAtRaw=formData.get('startsAt');
    const endsAtRaw=formData.get('endsAt');
    let startsAtIso=null;
    let endsAtIso=null;

    if(startsAtRaw){
        const startsAtDate=new Date(startsAtRaw);
        if(!Number.isNaN(startsAtDate.getTime())){
            startsAtIso=startsAtDate.toISOString();
            payload.startsAt=startsAtIso;
        }
    }

    if(endsAtRaw){
        const endsAtDate=new Date(endsAtRaw);
        if(!Number.isNaN(endsAtDate.getTime())){
            endsAtIso=endsAtDate.toISOString();
            payload.endsAt=endsAtIso;
        }
    }

    if(startsAtIso && endsAtIso && new Date(endsAtIso)<=new Date(startsAtIso)){
        setMessage('End time must be after the start time.','error');
        return;
    }

    const visibility=examVisibilitySelect?.value || 'public';
    payload.visibility=visibility;

    if(visibility==='organizations' || visibility==='mixed'){
        const organizationIds=examOrganizationsSelect
            ? Array.from(examOrganizationsSelect.selectedOptions).map((option)=>option.value).filter(Boolean)
            : [];

        if(!organizationIds.length){
            setMessage('Select at least one organization for this exam.','error');
            return;
        }

        payload.organizationIds=organizationIds;
    }

    if(visibility==='custom' || visibility==='mixed'){
        const emails=parseStudentEmails(customStudentEmailsInput?.value || '');

        if(!emails.length){
            setMessage('Add at least one student email for this exam.','error');
            return;
        }

        payload.invitedStudentEmails=emails;
    }

    const submitButton=examSubmitButton || examForm.querySelector('button[type="submit"]');
    submitButton?.setAttribute('disabled','disabled');

    try{
        const isEditing=Boolean(editingExamId);
        const endpoint=isEditing?`${API.exams}/${editingExamId}`:API.exams;
        const method=isEditing?'PATCH':'POST';
        const exam=await request(endpoint,{ method, body:payload });

        if(isEditing){
            cachedExams=cachedExams.map((existing)=>existing._id===editingExamId?exam:existing);
        }else{
            cachedExams=[...cachedExams,exam];
            cachedQuestions.delete(exam._id);
        }

        resetExamForm();
        renderMyExams();
        renderQuestionExamOptions();
        setMessage(isEditing?'Exam updated successfully.':'Exam created successfully.','success');
    }catch(error){
        console.error(error);
        setMessage(error.message,'error',false);
    }finally{
        submitButton?.removeAttribute('disabled');
    }
});

questionExamSelect?.addEventListener('change',(event)=>{
    const examId=event.target.value;
    if(!examId){
        resetQuestionForm();
        questionForm?.classList.add('hidden');
        clearQuestionImportIssues();
        setImportAvailability(false);
        questionImportForm?.reset?.();
        if(questionCsvInput){
            questionCsvInput.value='';
        }
        if(questionCategoryInput){
            questionCategoryInput.value=DEFAULT_QUESTION_CATEGORY_LABEL;
        }
        if(questionList){
            questionList.innerHTML='';
        }
        if(questionEmpty){
            questionEmpty.classList.remove('hidden');
            questionEmpty.textContent='Select an exam to manage questions.';
        }
        renderQuestionAuthoringPreview();
        return;
    }

    if(editingQuestionState && editingQuestionState.examId!==examId){
        resetQuestionForm();
    }

    questionForm?.classList.remove('hidden');
    clearQuestionImportIssues();
    setImportAvailability(true);
    if(questionCategoryInput){
        questionCategoryInput.value=DEFAULT_QUESTION_CATEGORY_LABEL;
    }
    toggleQuestionTypeFields();
    if(!cachedQuestions.has(examId)){
        fetchQuestions(examId);
    }else{
        renderQuestions(examId);
    }
    renderQuestionAuthoringPreview();
});

questionTypeSelect?.addEventListener('change',()=>{
    toggleQuestionTypeFields();
});

questionTextInput?.addEventListener('input',()=>{
    renderQuestionAuthoringPreview();
});

questionCategoryInput?.addEventListener('input',()=>{
    renderQuestionAuthoringPreview();
});

expectedAnswerInput?.addEventListener('input',()=>{
    renderQuestionAuthoringPreview();
});

optionInputs.forEach((input)=>{
    input.addEventListener('input',()=>{
        renderQuestionAuthoringPreview();
    });
});

correctOptionSelect?.addEventListener('change',()=>{
    renderQuestionAuthoringPreview();
});

codeLanguageSelect?.addEventListener('change',()=>{
    updateCodeEditorLanguage();
    renderQuestionAuthoringPreview();
});

codeTimeLimitInput?.addEventListener('input',()=>{
    renderQuestionAuthoringPreview();
});

codeMemoryLimitInput?.addEventListener('input',()=>{
    renderQuestionAuthoringPreview();
});

addTestcaseButton?.addEventListener('click',()=>{
    codeTestcases=[...codeTestcases,createTestcase()];
    renderCodeTestcases();
    renderQuestionAuthoringPreview();
});

codeTestcasesContainer?.addEventListener('input',(event)=>{
    const target=event.target;
    if(!(target instanceof HTMLTextAreaElement)){
        return;
    }
    const container=target.closest('.testcase-item');
    if(!container){
        return;
    }
    const field=target.dataset.field;
    if(!field){
        return;
    }
    updateTestcaseField(container.dataset.caseId,field,target.value);
    renderQuestionAuthoringPreview();
});

codeTestcasesContainer?.addEventListener('change',(event)=>{
    const target=event.target;
    if(!(target instanceof HTMLInputElement) || target.type!=='checkbox'){
        return;
    }
    const container=target.closest('.testcase-item');
    if(!container){
        return;
    }
    updateTestcaseField(container.dataset.caseId,'isPublic',target.checked);
    renderQuestionAuthoringPreview();
});

codeTestcasesContainer?.addEventListener('click',(event)=>{
    const button=event.target.closest('button[data-action="remove-testcase"]');
    if(!button){
        return;
    }
    const container=button.closest('.testcase-item');
    if(!container){
        return;
    }
    removeTestcase(container.dataset.caseId);
    renderQuestionAuthoringPreview();
});

cancelQuestionEditButton?.addEventListener('click',()=>{
    const previousExamId=editingQuestionState?.examId;
    const wasEditing=Boolean(editingQuestionState);
    resetQuestionForm();
    if(previousExamId){
        renderQuestions(previousExamId);
    }
    if(wasEditing){
        setMessage('Question edit cancelled.','info');
    }
});

questionForm?.addEventListener('submit',async (event)=>{
    event.preventDefault();
    const examId=questionExamSelect?.value;
    if(!examId){
        setMessage('Select an exam before adding questions.','error');
        return;
    }

    const isEditing=Boolean(editingQuestionState?.questionId);
    if(isEditing && editingQuestionState.examId!==examId){
        setMessage('Finish editing the current question before switching exams.','error');
        return;
    }

    const submitButton=questionSubmitButton || questionForm?.querySelector('button[type="submit"]');

    const text=questionTextInput.value.trim();
    if(!text){
        setMessage('Question text is required.','error');
        return;
    }

    const questionType=questionTypeSelect?.value || 'mcq';
    const payload={
        text,
        type:questionType
    };

    const categoryValue=(questionCategoryInput?.value || '').trim();
    if(categoryValue){
        payload.category=categoryValue;
    }

    if(questionType==='written'){
        payload.expectedAnswer=expectedAnswerInput?.value.trim() || '';
    }else if(questionType==='code'){
        const languageId=Number(codeLanguageSelect?.value);
        if(!Number.isInteger(languageId) || languageId<=0){
            setMessage('Select a programming language for the code question.','error');
            return;
        }

        const codeSettings=(()=>{
            const selectedOption=codeLanguageSelect?.selectedOptions?.[0];
            const timeLimitValue=Number(codeTimeLimitInput?.value);
            const memoryLimitValue=Number(codeMemoryLimitInput?.value);

            const sanitizedTestcases=codeTestcases
                .map((testcase)=>({
                    input:testcase.input||'',
                    expectedOutput:testcase.expectedOutput,
                    isPublic:Boolean(testcase.isPublic)
                }))
                .filter((testcase)=>typeof testcase.expectedOutput==='string' && testcase.expectedOutput.trim());

            if(!sanitizedTestcases.length){
                setMessage('Provide at least one test case with an expected output.','error');
                return null;
            }

            const starterCode=getCodeEditorValue();

            return {
                languageId,
                languageName:selectedOption?.textContent || '',
                starterCode,
                timeLimit:Number.isFinite(timeLimitValue)&&timeLimitValue>0?Math.min(timeLimitValue,20):5,
                memoryLimit:Number.isFinite(memoryLimitValue)&&memoryLimitValue>=64000?Math.min(memoryLimitValue,512000):128000,
                testCases:sanitizedTestcases
            };
        })();

        if(!codeSettings){
            return;
        }

        payload.codeSettings=codeSettings;
    }else{
        const selectedCorrectIndex=Number(correctOptionSelect.value);
        const options=[];
        let correctOptionIndex=-1;

        optionInputs.forEach((input,index)=>{
            if(input.disabled){
                return;
            }
            const value=input.value.trim();
            if(!value){
                if(index===selectedCorrectIndex){
                    correctOptionIndex=-2;
                }
                return;
            }
            if(index===selectedCorrectIndex){
                correctOptionIndex=options.length;
            }
            options.push(value);
        });

        if(correctOptionIndex===-2){
            setMessage('The correct answer option cannot be empty.','error');
            return;
        }

        if(options.length<2){
            setMessage('Provide at least two answer options.','error');
            return;
        }

        if(correctOptionIndex<0){
            setMessage('Select which option is correct.','error');
            return;
        }

        payload.options=options;
        payload.correctOptionIndex=correctOptionIndex;
    }

    submitButton?.setAttribute('disabled','disabled');

    try{
        const endpoint=isEditing
            ? `${API.questions}/${examId}/${editingQuestionState.questionId}`
            : `${API.questions}/${examId}`;
        const method=isEditing?'PATCH':'POST';
        const question=await request(endpoint,{ method, body:payload });

        const normalizedQuestion=normalizeQuestionRecord(question);
        if(normalizedQuestion){
            const existing=cachedQuestions.get(examId)||[];
            if(isEditing){
                const updated=existing.map((current)=>{
                    if(current._id===normalizedQuestion._id){
                        return normalizedQuestion;
                    }
                    return current;
                });
                const wasReplaced=updated.some((item)=>item._id===normalizedQuestion._id);
                cachedQuestions.set(examId,wasReplaced?updated:[...existing,normalizedQuestion]);
            }else{
                cachedQuestions.set(examId,[...existing,normalizedQuestion]);
            }
        }

        resetQuestionForm();
        renderQuestions(examId);
        setMessage(isEditing?'Question updated successfully.':'Question added successfully.','success');
    }catch(error){
        console.error(error);
        setMessage(error.message,'error',false);
    }finally{
        submitButton?.removeAttribute('disabled');
    }
});

questionImportForm?.addEventListener('submit',async (event)=>{
    event.preventDefault();
    const examId=questionExamSelect?.value;
    if(!examId){
        setMessage('Select an exam before importing questions.','error');
        return;
    }

    const file=questionCsvInput?.files?.[0] || null;
    if(!file){
        setMessage('Choose a CSV file to upload.','error');
        return;
    }

    if(file.size>CSV_MAX_FILE_SIZE){
        setMessage('CSV file must be 1 MB or smaller.','error');
        return;
    }

    const formData=new FormData();
    formData.append('file',file);

    try{
        setMessage('Importing questions from CSV…','info',false);
        questionImportSubmitButton?.setAttribute('disabled','disabled');
        clearQuestionImportIssues();

        const payload=await request(`${API.questions}/${examId}/import`,{
            method:'POST',
            body:formData
        });

        questionImportForm.reset?.();
        if(questionCsvInput){
            questionCsvInput.value='';
        }

        const importedQuestions=Array.isArray(payload?.questions)
            ? payload.questions.map((question)=>normalizeQuestionRecord(question)).filter(Boolean)
            : [];
        if(importedQuestions.length){
            const existing=cachedQuestions.get(examId)||[];
            const merged=new Map(existing.map((question)=>[String(question._id),question]));
            importedQuestions.forEach((question)=>{
                if(question && question._id){
                    merged.set(String(question._id),question);
                }
            });
            cachedQuestions.set(examId,Array.from(merged.values()));
            renderQuestions(examId);
        }else{
            await fetchQuestions(examId);
        }

        if(Array.isArray(payload?.issues) && payload.issues.length){
            console.warn('CSV import skipped rows:',payload.issues);
        }

        const skippedCount=Number(payload?.skipped)||0;
        const hasSkipped=skippedCount>0;
        renderQuestionImportIssues(payload?.issues||[]);
        setMessage(
            payload?.message || `Imported ${importedQuestions.length} questions from CSV.`,
            hasSkipped?'info':'success',
            false
        );
    }catch(error){
        console.error(error);
        setMessage(error.message,'error',false);
        clearQuestionImportIssues();
    }finally{
        questionImportSubmitButton?.removeAttribute('disabled');
    }
});

questionList?.addEventListener('click',async (event)=>{
    const button=event.target.closest('button');
    if(!button){
        return;
    }

    const { action, examId, questionId }=button.dataset;
    if(action==='edit-question' && examId && questionId){
        beginQuestionEdit(examId,questionId);
        return;
    }

    if(action==='delete-question' && examId && questionId){
        if(!confirm('Delete this question from the exam?')){
            return;
        }
        try{
            await request(`${API.questions}/${examId}/${questionId}`,{ method:'DELETE' });
            const updated=(cachedQuestions.get(examId)||[]).filter((question)=>question._id!==questionId);
            cachedQuestions.set(examId,updated);
            if(editingQuestionState?.questionId===questionId){
                resetQuestionForm();
            }
            renderQuestions(examId);
            setMessage('Question removed.','success');
        }catch(error){
            console.error(error);
            setMessage(error.message,'error',false);
        }
    }
});

function initialize(){
    setWelcomeMessage();
    toggleExamAudienceFields();
    renderExamAudienceOptions();
    toggleQuestionTypeFields();
    setImportAvailability(Boolean(questionExamSelect?.value));
    resetSubmissionsPanel();

    if(isAdmin){
        showSection(adminSection);
        fetchOrganizations();
        fetchTeachers();
    }

    if(canManageExams){
        showSection(instructorSection);
        setInstructorPage(activeInstructorPage,{ suppressScroll:true });
        if(!isAdmin){
            fetchOrganizations();
        }
        fetchMyExams();
    }

    // Wire search input for submissions
    if(submissionsSearch){
        let searchTimer=null;
        submissionsSearch.addEventListener('input',()=>{
            clearTimeout(searchTimer);
            searchTimer=setTimeout(()=>{
                if(activeSubmissionsExamId){
                    renderSubmissions(activeSubmissionsExamId);
                }
            },250);
        });
    }

    // Wire global delta apply
    if(applyGlobalDeltaBtn && globalDeltaInput){
        applyGlobalDeltaBtn.addEventListener('click', async ()=>{
            if(!activeSubmissionsExamId){
                setMessage('Select an exam first.','error');
                return;
            }
            const raw = Number(globalDeltaInput.value);
            if(!Number.isFinite(raw) || raw===0){
                setMessage('Enter a non-zero numeric delta. Use negative values to subtract.','error');
                return;
            }
            if(!confirm(`Apply ${raw>0?'+':''}${raw} marks to all submissions for this exam?`)) return;
            try{
                applyGlobalDeltaBtn.disabled=true;
                const resp = await request(`/api/submissions/exam/${activeSubmissionsExamId}/adjust`, { method:'POST', body:{ delta: raw } });
                // Update cached submissions in-place
                const list = cachedSubmissions.get(activeSubmissionsExamId) || [];
                const updated = list.map((s)=>{
                    const questionCount = Array.isArray(s.answers)?s.answers.length:0;
                    let newScore = (Number(s.score)||0) + raw;
                    if(newScore<0) newScore = 0;
                    if(questionCount && newScore>questionCount) newScore = questionCount;
                    return { ...s, score: newScore };
                });
                cachedSubmissions.set(activeSubmissionsExamId, updated);
                await renderSubmissions(activeSubmissionsExamId);
                setMessage(`Adjusted ${resp.updated||0} of ${resp.total||updated.length} submissions by ${resp.delta}.`,'success');
            }catch(err){
                console.error(err);
                setMessage(err.message || 'Failed to apply global delta','error');
            }finally{
                applyGlobalDeltaBtn.disabled=false;
            }
        });
    }
}

initialize();
renderQuestionAuthoringPreview();
