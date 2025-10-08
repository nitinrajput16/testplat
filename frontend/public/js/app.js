const prevButton=document.getElementById('prevButton');
const nextButton=document.getElementById('nextButton');
const submitButton=document.getElementById('submitButton');
const exitButton=document.getElementById('exitButton');
const contentDiv=document.getElementById('content');
const progress=document.getElementById('progress');
const questionCounter=document.getElementById('questionCounter');
const answerCounter=document.getElementById('answerCounter');
const examTitle=document.getElementById('examTitle');
const examMeta=document.getElementById('examMeta');
const examDescription=document.getElementById('examDescription');
const examStatus=document.getElementById('examStatus');
const examTimer=document.getElementById('examTimer');
const timerElapsed=document.getElementById('timerElapsed');
const timerTotal=document.getElementById('timerTotal');
const tabWarningModal=document.getElementById('tabWarningModal');
const tabWarningMessage=document.getElementById('tabWarningMessage');
const tabWarningDismiss=document.getElementById('tabWarningDismiss');
const categoryBar=document.getElementById('categoryBar');
const categoryChipsContainer=document.getElementById('categoryChips');
const categoryActiveLabel=document.getElementById('categoryActiveLabel');
const categoryProgressLabel=document.getElementById('categoryProgressLabel');
const yearSpan=document.getElementById('year');

const exitButtonDefaults=exitButton
    ? {
        text:exitButton.textContent,
        className:exitButton.className
    }
    : null;

if(yearSpan){
    yearSpan.textContent=new Date().getFullYear();
}

const urlParams=new URLSearchParams(window.location.search);
const examId=urlParams.get('examId');

const token=localStorage.getItem('token');
let currentUser=null;
try{
    currentUser=JSON.parse(localStorage.getItem('currentUser')||'{}');
}catch(error){
    console.error('Unable to parse current user for exam runner',error);
}

const PROGRESS_STORAGE_KEY=examId?`exam-${examId}-progress`:null;
const META_STORAGE_KEY='activeExamMeta';

const state={
    exam:null,
    examSessionId:null,
    examSessionData:null,
    questions:[],
    responses:new Map(),
    currentQuestionIndex:0,
    hasSubmitted:false,
    isSubmitting:false,
    submissionResult:null,
    categories:[],
    activeCategory:null,
    questionsByCategory:new Map(),
    categoryPositions:new Map(),
    questionCategoryMap:new Map(),
    timer:{
        intervalId:null,
        startedAt:null,
        totalMs:0
    },
    tabWarning:{
        active:false,
        lastShownAt:0,
        message:'Switching tabs has been detected. Stay focused on the exam window to avoid penalties.'
    }
};

const timerElements={
    container:examTimer,
    elapsed:timerElapsed,
    total:timerTotal
};

const JUDGE0_MONACO_MAP={
    63:'javascript',
    71:'python',
    54:'cpp',
    62:'java',
    50:'c',
    73:'rust',
    78:'kotlin',
    51:'csharp',
    68:'php',
    74:'typescript',
    80:'r',
    82:'sql',
    72:'ruby'
};

const JUDGE0_LANGUAGES=[
    { id:63, label:'JavaScript (Node)', monaco:'javascript' },
    { id:71, label:'Python (3.11)', monaco:'python' },
    { id:54, label:'C++ (GCC 13)', monaco:'cpp' },
    { id:62, label:'Java (JDK 17)', monaco:'java' },
    { id:50, label:'C (GCC 13)', monaco:'c' },
    { id:73, label:'Rust', monaco:'rust' },
    { id:78, label:'Kotlin', monaco:'kotlin' },
    { id:51, label:'C#', monaco:'csharp' },
    { id:68, label:'PHP', monaco:'php' },
    { id:74, label:'TypeScript', monaco:'typescript' },
    { id:80, label:'R', monaco:'r' },
    { id:82, label:'SQL', monaco:'sql' },
    { id:72, label:'Ruby', monaco:'ruby' }
];

let activeCodeEditor=null;
let activeCodeQuestionId=null;

const antiCheatMonitor=(()=>{
    const EVENT_TYPES={
        TAB_HIDDEN:'TAB_HIDDEN',
        TAB_VISIBLE:'TAB_VISIBLE',
        WINDOW_BLUR:'WINDOW_BLUR',
        WINDOW_FOCUS:'WINDOW_FOCUS',
        CONTEXT_MENU:'CONTEXT_MENU',
        COPY:'COPY',
        CUT:'CUT',
        PASTE:'PASTE'
    };
    const MAX_QUEUE_SIZE=50;
    let socket=null;
    let socketHandlers=null;
    let isEnabled=false;
    let listeners=[];
    let queue=[];
    let reconnectTimer=null;
    let reconnectDelay=5000;
    const MAX_RECONNECT_DELAY=30000;
    let context={ examId:null, sessionId:null };
    let shouldWarnOnFocus=false;

    function addListener(target,type,handler,options){
        if(!target||typeof target.addEventListener!=='function'){
            return;
        }
        target.addEventListener(type,handler,options);
        listeners.push({ target,type,handler,options });
    }

    function removeListeners(){
        listeners.forEach(({ target,type,handler,options })=>{
            if(target && typeof target.removeEventListener==='function'){
                target.removeEventListener(type,handler,options);
            }
        });
        listeners=[];
    }

    function clearReconnectTimer(){
        if(reconnectTimer){
            window.clearTimeout(reconnectTimer);
            reconnectTimer=null;
        }
    }

    function scheduleReconnect(){
        if(!isEnabled || reconnectTimer){
            return;
        }
        reconnectTimer=window.setTimeout(()=>{
            reconnectTimer=null;
            reconnectDelay=Math.min(reconnectDelay*2,MAX_RECONNECT_DELAY);
            connect();
        },reconnectDelay);
    }

    function teardownSocket(){
        if(socket){
            if(socketHandlers){
                socket.removeEventListener('open',socketHandlers.handleOpen);
                socket.removeEventListener('close',socketHandlers.handleClose);
                socket.removeEventListener('error',socketHandlers.handleError);
                socket.removeEventListener('message',socketHandlers.handleMessage);
            }
            try{
                if(socket.readyState===WebSocket.OPEN || socket.readyState===WebSocket.CONNECTING){
                    socket.close(1000,'anti-cheat-stop');
                }
            }catch(_error){
                /* noop */
            }
        }
        socket=null;
        socketHandlers=null;
    }

    function enqueue(payload){
        if(queue.length>=MAX_QUEUE_SIZE){
            queue.shift();
        }
        queue.push(payload);
    }

    function flushQueue(){
        if(!socket || socket.readyState!==WebSocket.OPEN){
            return;
        }
        while(queue.length){
            const payload=queue.shift();
            try{
                socket.send(JSON.stringify(payload));
            }catch(error){
                console.warn('Failed to transmit anti-cheat payload',error);
                break;
            }
        }
    }

    function transmit(payload){
        if(!socket || socket.readyState!==WebSocket.OPEN){
            enqueue(payload);
            return;
        }
        try{
            socket.send(JSON.stringify(payload));
        }catch(error){
            enqueue(payload);
        }
    }

    function buildPayload(eventType,details){
        const baseDetails=typeof details==='object' && details!==null ? details : {};
        const activeElement=document.activeElement;
        const payload={
            type:'event',
            eventType,
            examId:context.examId,
            sessionId:context.sessionId,
            timestamp:new Date().toISOString(),
            details:{
                ...baseDetails,
                location:window.location.pathname,
                visibility:document.visibilityState,
                activeElement:activeElement?activeElement.tagName:undefined
            }
        };
        return payload;
    }

    function report(eventType,details){
        if(!isEnabled || !eventType || !context.sessionId){
            return;
        }
        const payload=buildPayload(eventType,details);
        if(window.console && typeof window.console.debug==='function'){
            console.debug('[anti-cheat]',eventType,payload.details);
        }
        transmit(payload);
    }

    function handleVisibilityChange(){
        if(document.hidden){
            shouldWarnOnFocus=true;
            report(EVENT_TYPES.TAB_HIDDEN,{});
        }else{
            report(EVENT_TYPES.TAB_VISIBLE,{});
            if(shouldWarnOnFocus){
                triggerTabSwitchWarning();
                shouldWarnOnFocus=false;
            }
        }
    }

    function handleWindowBlur(){
        if(document.visibilityState==='hidden'){
            shouldWarnOnFocus=true;
        }
        report(EVENT_TYPES.WINDOW_BLUR,{});
    }

    function handleWindowFocus(){
        report(EVENT_TYPES.WINDOW_FOCUS,{});
        if(shouldWarnOnFocus && document.visibilityState==='visible'){
            triggerTabSwitchWarning();
            shouldWarnOnFocus=false;
        }
    }

    function handleContextMenu(event){
        if(event instanceof Event){
            event.preventDefault();
        }
        const target=(event && event.target && event.target.tagName) || undefined;
        report(EVENT_TYPES.CONTEXT_MENU,{
            target,
            coordinates:(event && typeof event.clientX==='number')
                ?{ x:event.clientX, y:event.clientY }
                :undefined
        });
    }

    function handleCopy(event){
        const selection=window.getSelection?.();
        const selectionLength=selection?selection.toString().length:undefined;
        const target=(event && event.target && event.target.tagName) || undefined;
        report(EVENT_TYPES.COPY,{
            target,
            selectionLength
        });
    }

    function handleCut(event){
        const selection=window.getSelection?.();
        const selectionLength=selection?selection.toString().length:undefined;
        const target=(event && event.target && event.target.tagName) || undefined;
        report(EVENT_TYPES.CUT,{
            target,
            selectionLength
        });
    }

    function handlePaste(event){
        const types=(event && event.clipboardData && event.clipboardData.types)
            ?Array.from(event.clipboardData.types)
            :undefined;
        const target=(event && event.target && event.target.tagName) || undefined;
        report(EVENT_TYPES.PASTE,{
            target,
            clipboardTypes:types
        });
    }

    function triggerTabSwitchWarning(){
        const message='Tab switch detected. Please remain on the exam tab.';
        showTabWarning(message);
    }

    function attachListeners(){
        removeListeners();
        addListener(document,'visibilitychange',handleVisibilityChange,false);
        addListener(window,'blur',handleWindowBlur,true);
        addListener(window,'focus',handleWindowFocus,true);
        addListener(document,'contextmenu',handleContextMenu,true);
        addListener(document,'copy',handleCopy,true);
        addListener(document,'cut',handleCut,true);
        addListener(document,'paste',handlePaste,true);
    }

    function connect(){
        teardownSocket();
        clearReconnectTimer();

        if(!isEnabled || !context.examId || !context.sessionId){
            return;
        }

        if(typeof WebSocket==='undefined'){
            console.warn('WebSocket is not supported in this environment. Anti-cheat monitoring disabled.');
            return;
        }

        const protocol=window.location.protocol==='https:'?'wss':'ws';
    const endpoint=`${protocol}://${window.location.host}/ws/anti-cheat?token=${encodeURIComponent(token)}&examId=${encodeURIComponent(context.examId)}&sessionId=${encodeURIComponent(context.sessionId)}`;

        try{
            socket=new WebSocket(endpoint);
        }catch(error){
            console.error('Failed to initialise anti-cheat channel',error);
            scheduleReconnect();
            return;
        }

        socketHandlers={
            handleOpen:()=>{
                if(window.console && typeof window.console.info==='function'){
                    console.info('[anti-cheat] channel connected');
                }
                reconnectDelay=5000;
                flushQueue();
            },
            handleClose:(event)=>{
                if(window.console && typeof window.console.info==='function'){
                    console.info('[anti-cheat] channel closed',event?.code,event?.reason);
                }
                teardownSocket();
                if(isEnabled){
                    scheduleReconnect();
                }
            },
            handleError:(error)=>{
                console.warn('[anti-cheat] channel error',error);
            },
            handleMessage:()=>{
                // Reserved for future acknowledgement handling.
            }
        };

        socket.addEventListener('open',socketHandlers.handleOpen);
        socket.addEventListener('close',socketHandlers.handleClose);
        socket.addEventListener('error',socketHandlers.handleError);
        socket.addEventListener('message',socketHandlers.handleMessage);
    }

    function start(startContext){
        if(!token){
            return;
        }
        const incomingExamId=startContext && startContext.examId
            ? String(startContext.examId)
            : null;
        const incomingSessionId=startContext && startContext.sessionId
            ? String(startContext.sessionId)
            : null;

        if(isEnabled){
            let shouldReconnect=false;
            if(incomingExamId && incomingExamId!==context.examId){
                context.examId=incomingExamId;
                shouldReconnect=true;
            }
            if(incomingSessionId && incomingSessionId!==context.sessionId){
                context.sessionId=incomingSessionId;
                shouldReconnect=true;
            }
            if(shouldReconnect){
                reconnectDelay=5000;
                connect();
            }
            return;
        }

        if(!incomingExamId || !incomingSessionId){
            return;
        }

        context={ examId:incomingExamId, sessionId:incomingSessionId };
        reconnectDelay=5000;
        queue=[];
        isEnabled=true;
        attachListeners();
        connect();
        handleVisibilityChange();
    }

    function stop(){
        if(!isEnabled){
            return;
        }
        isEnabled=false;
        removeListeners();
        clearReconnectTimer();
        queue=[];
        context={ examId:null, sessionId:null };
        shouldWarnOnFocus=false;
        teardownSocket();
    }

    return {
        start,
        stop,
        report
    };
})();

function setStatus(message='',type='info'){
    if(!examStatus){
        return;
    }

    if(!message){
        examStatus.classList.add('hidden');
        examStatus.textContent='';
        return;
    }

    examStatus.textContent=message;
    examStatus.classList.remove('hidden','info','error','success');
    examStatus.classList.add('alert',type);
}

function resetExitButton(){
    if(!exitButtonDefaults || !exitButton){
        return;
    }
    exitButton.className=exitButtonDefaults.className;
    exitButton.textContent=exitButtonDefaults.text;
    exitButton.disabled=false;
}

function formatDuration(ms){
    if(!Number.isFinite(ms)){
        return '00:00';
    }
    const totalSeconds=Math.max(0,Math.floor(ms/1000));
    const hours=Math.floor(totalSeconds/3600);
    const minutes=Math.floor((totalSeconds%3600)/60);
    const seconds=totalSeconds%60;

    const paddedMinutes=String(minutes).padStart(2,'0');
    const paddedSeconds=String(seconds).padStart(2,'0');

    if(hours>0){
        const paddedHours=String(hours).padStart(2,'0');
        return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
    }

    return `${paddedMinutes}:${paddedSeconds}`;
}

function updateExamTimer(){
    if(!state.timer.startedAt || !timerElements.container){
        return;
    }

    const nowMs=Date.now();
    const elapsedMs=Math.max(0,nowMs-state.timer.startedAt.getTime());

    if(timerElements.elapsed){
        timerElements.elapsed.textContent=formatDuration(elapsedMs);
    }

    if(state.timer.totalMs>0 && elapsedMs>state.timer.totalMs){
        timerElements.container.classList.add('overtime');
    }
}

function startExamTimer(startedAt,totalMs){
    stopExamTimer();

    if(!timerElements.container){
        return;
    }

    const startDate=startedAt instanceof Date?startedAt:new Date(startedAt);
    if(Number.isNaN(startDate.getTime())){
        return;
    }

    const durationMs=Number(totalMs);
    if(!Number.isFinite(durationMs) || durationMs<=0){
        return;
    }

    state.timer.startedAt=startDate;
    state.timer.totalMs=durationMs;

    if(timerElements.total){
        timerElements.total.textContent=formatDuration(durationMs);
    }

    timerElements.container.classList.remove('hidden','overtime');
    updateExamTimer();
    state.timer.intervalId=window.setInterval(updateExamTimer,1000);
}

function stopExamTimer(options={}){
    if(state.timer.intervalId){
        window.clearInterval(state.timer.intervalId);
    }

    state.timer.intervalId=null;
    state.timer.startedAt=null;
    state.timer.totalMs=0;

    if(options.hide && timerElements.container){
        timerElements.container.classList.add('hidden');
    }
}

function showTabWarning(message){
    if(!tabWarningModal){
        return;
    }

    const now=Date.now();
    if(state.tabWarning.active){
        return;
    }

    if(now-state.tabWarning.lastShownAt<1000){
        return;
    }

    const warningMessage=message || state.tabWarning.message;
    if(tabWarningMessage){
        tabWarningMessage.textContent=warningMessage;
    }

    tabWarningModal.classList.remove('hidden');
    tabWarningModal.setAttribute('aria-hidden','false');
    if(tabWarningDismiss){
        tabWarningDismiss.focus({ preventScroll:true });
    }

    state.tabWarning.active=true;
    state.tabWarning.lastShownAt=now;
    setStatus(warningMessage,'warning');
}

function hideTabWarning(){
    if(!tabWarningModal){
        return;
    }
    tabWarningModal.classList.add('hidden');
    tabWarningModal.setAttribute('aria-hidden','true');
    state.tabWarning.active=false;
}

function normalizeCategory(value){
    const trimmed=typeof value==='string'?value.trim():'';
    return trimmed || 'General';
}

function getActiveCategory(){
    if(state.activeCategory && state.questionsByCategory.has(state.activeCategory)){
        return state.activeCategory;
    }
    const first=state.categories[0] || null;
    state.activeCategory=first;
    return first;
}

function getActiveCategoryQuestions(){
    const category=getActiveCategory();
    if(!category){
        return [];
    }
    return state.questionsByCategory.get(category) || [];
}

function getQuestionCategoryValue(question){
    if(!question){
        return 'General';
    }
    const questionId=question._id;
    if(questionId && state.questionCategoryMap.has(String(questionId))){
        return state.questionCategoryMap.get(String(questionId));
    }
    return normalizeCategory(question.category);
}

function countAnsweredInCategory(category){
    if(!category){
        return 0;
    }
    let count=0;
    state.responses.forEach((_value,questionId)=>{
        if(state.questionCategoryMap.get(String(questionId))===category){
            count+=1;
        }
    });
    return count;
}

function prepareCategoryStructures(){
    const categories=[];
    const questionsByCategory=new Map();
    const questionCategoryMap=new Map();

    state.questions.forEach((question)=>{
        const category=normalizeCategory(question?.category);
        if(question && typeof question==='object'){
            question.category=category;
        }

        const questionId=question?._id;
        if(questionId){
            questionCategoryMap.set(String(questionId),category);
        }

        if(!questionsByCategory.has(category)){
            questionsByCategory.set(category,[]);
            categories.push(category);
        }
        questionsByCategory.get(category).push(question);
    });

    state.categories=categories;
    state.questionsByCategory=questionsByCategory;
    state.questionCategoryMap=questionCategoryMap;
    state.categoryPositions=new Map(categories.map((category)=>[category,0]));
    state.activeCategory=categories[0] || null;
    state.currentQuestionIndex=0;

    if(!categories.length){
        state.activeCategory=null;
        state.categoryPositions=new Map();
    }
}

function updateCategorySummary(){
    if(!categoryActiveLabel && !categoryProgressLabel){
        return;
    }

    if(state.hasSubmitted){
        if(categoryActiveLabel){
            categoryActiveLabel.textContent='Exam submitted';
        }
        if(categoryProgressLabel){
            categoryProgressLabel.textContent='Your responses have been recorded.';
        }
        return;
    }

    const activeCategory=getActiveCategory();
    const categoryQuestions=getActiveCategoryQuestions();
    const total=categoryQuestions.length;
    const current=total?state.currentQuestionIndex+1:0;
    const answered=countAnsweredInCategory(activeCategory);

    if(categoryActiveLabel){
        categoryActiveLabel.textContent=activeCategory
            ? `Category: ${activeCategory}`
            : 'Category: —';
    }

    if(categoryProgressLabel){
        if(!total){
            categoryProgressLabel.textContent='No questions available in this category.';
            return;
        }
        const completion=Math.round((answered/total)*100);
        categoryProgressLabel.textContent=`Answered ${answered} of ${total} · Viewing ${current} of ${total} (${completion}% complete)`;
    }
}

function renderCategoryChips(){
    if(!categoryBar){
        return;
    }

    if(state.hasSubmitted){
        categoryBar.classList.add('hidden');
        if(categoryChipsContainer){
            categoryChipsContainer.innerHTML='';
        }
        updateCategorySummary();
        return;
    }

    if(!state.categories.length){
        categoryBar.classList.add('hidden');
        if(categoryChipsContainer){
            categoryChipsContainer.innerHTML='';
        }
        updateCategorySummary();
        return;
    }

    categoryBar.classList.remove('hidden');

    if(categoryChipsContainer){
        categoryChipsContainer.innerHTML='';

        state.categories.forEach((category)=>{
            const total=state.questionsByCategory.get(category)?.length || 0;
            const answered=countAnsweredInCategory(category);
            const button=document.createElement('button');
            button.type='button';
            button.className='category-chip';
            button.dataset.category=category;
            button.setAttribute('role','tab');
            button.setAttribute('aria-label',`${category}: ${answered} of ${total} answered`);
            const isActive=category===getActiveCategory();
            button.setAttribute('aria-selected',isActive?'true':'false');
            button.setAttribute('aria-pressed',isActive?'true':'false');
            if(isActive){
                button.classList.add('active');
            }
            button.innerHTML=`<span class="category-chip-label">${category}</span><span class="category-chip-count">${answered}/${total}</span>`;
            if(state.categories.length===1){
                button.disabled=true;
                button.setAttribute('aria-disabled','true');
            }else{
                button.removeAttribute('aria-disabled');
                button.addEventListener('click',()=>{
                    if(category!==state.activeCategory){
                        switchCategory(category);
                    }
                });
            }
            categoryChipsContainer.appendChild(button);
        });
    }

    updateCategorySummary();
}

function switchCategory(category){
    if(!category || !state.questionsByCategory.has(category)){
        return;
    }

    const previousCategory=getActiveCategory();
    if(previousCategory){
        state.categoryPositions.set(previousCategory,state.currentQuestionIndex);
    }

    state.activeCategory=category;

    const storedIndex=Number(state.categoryPositions.get(category));
    const categoryQuestions=getActiveCategoryQuestions();
    const safeIndex=Math.min(
        Math.max(Number.isInteger(storedIndex)?storedIndex:0,0),
        Math.max(categoryQuestions.length-1,0)
    );

    state.currentQuestionIndex=safeIndex;
    state.categoryPositions.set(category,safeIndex);

    persistProgress();
    renderQuestion();
    updateNavigationState();
    updateProgress();
    updateCounters();
    renderCategoryChips();
}

function disposeActiveCodeEditor(){
    if(activeCodeEditor){
        if(window.MonacoHelper && typeof window.MonacoHelper.disposeEditor==='function'){
            window.MonacoHelper.disposeEditor(activeCodeEditor);
        }else if(typeof activeCodeEditor.dispose==='function'){
            activeCodeEditor.dispose();
        }

        activeCodeEditor=null;
        activeCodeQuestionId=null;
    }
}

function resolveMonacoLanguage(languageId){
    if(!languageId){
        return 'javascript';
    }
    const mapped=JUDGE0_MONACO_MAP[Number(languageId)];
    return mapped || 'javascript';
}

function getJudge0LanguageOption(languageId){
    if(typeof languageId==='undefined' || languageId===null){
        return null;
    }
    const numericId=Number(languageId);
    if(!Number.isFinite(numericId)){
        return null;
    }
    return JUDGE0_LANGUAGES.find((language)=>Number(language.id)===numericId) || null;
}

function defaultStarterTemplateForLanguage(languageId){
    const monacoLang=resolveMonacoLanguage(languageId);
    switch(monacoLang){
    case 'python':
        return 'def solve():\n    # Write your code here\n    pass\n\nif __name__ == "__main__":\n    solve()\n';
    case 'cpp':
        return '#include <bits/stdc++.h>\nusing namespace std;\n\nint main(){\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // Write your code here\n    return 0;\n}\n';
    case 'java':
        return 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        // Write your code here\n    }\n}\n';
    case 'c':
        return '#include <stdio.h>\n\nint main(void) {\n    // Write your code here\n    return 0;\n}\n';
    case 'csharp':
        return 'using System;\n\npublic class Program {\n    public static void Main() {\n        // Write your code here\n    }\n}\n';
    case 'typescript':
        return '// Write your solution here\nfunction solve(): void {\n    // ...\n}\n\nsolve();\n';
    case 'rust':
        return 'fn main() {\n    // Write your code here\n}\n';
    case 'kotlin':
        return 'fun main() {\n    // Write your code here\n}\n';
    case 'php':
        return '<?php\n// Write your code here\n';
    case 'r':
        return '# Write your R code here\n';
    case 'sql':
        return '-- Write your SQL query here\n';
    case 'ruby':
        return '# Write your Ruby solution here\n';
    case 'javascript':
    default:
        return 'function solve(){\n    // Write your code here\n}\n\nsolve();\n';
    }
}

function getCodeResponseEntry(questionId){
    const existing=state.responses.get(String(questionId));
    if(existing && typeof existing==='object' && Object.prototype.hasOwnProperty.call(existing,'code')){
        return { ...existing };
    }
    return null;
}

function persistCodeResponse(questionId,partial){
    const id=String(questionId);
    const current=getCodeResponseEntry(id) || {};
    const normalizedLanguageId=(()=>{
        if(typeof partial.languageId==='undefined' || partial.languageId===null){
            const existing=current.languageId;
            return Number.isInteger(existing) && existing>0
                ? existing
                : (Number.isInteger(Number(existing)) && Number(existing)>0 ? Number(existing) : '');
        }
        const numeric=Number(partial.languageId);
        return Number.isInteger(numeric) && numeric>0 ? numeric : '';
    })();

    const currentVariants=(current.variants && typeof current.variants==='object')
        ? { ...current.variants }
        : {};
    const languageKey=normalizedLanguageId==='' ? '' : String(normalizedLanguageId);
    const previousVariant=languageKey ? currentVariants[languageKey] || {} : {};

    const updated={
        ...current,
        code:typeof partial.code==='string'?partial.code:(current.code ?? ''),
        solution:typeof partial.solution==='string'?partial.solution:(current.solution ?? ''),
        languageId:normalizedLanguageId,
        languageName:typeof partial.languageName==='string'?partial.languageName:(current.languageName ?? ''),
        lastRunInput:Object.prototype.hasOwnProperty.call(partial,'lastRunInput')
            ? (partial.lastRunInput ?? '')
            : (current.lastRunInput ?? ''),
        lastRunOutput:Object.prototype.hasOwnProperty.call(partial,'lastRunOutput')
            ? (partial.lastRunOutput ?? '')
            : (current.lastRunOutput ?? ''),
        lastRunError:Object.prototype.hasOwnProperty.call(partial,'lastRunError')
            ? (partial.lastRunError ?? '')
            : (current.lastRunError ?? ''),
        lastRunStatus:Object.prototype.hasOwnProperty.call(partial,'lastRunStatus')
            ? (partial.lastRunStatus ?? '')
            : (current.lastRunStatus ?? ''),
        lastRunTime:Object.prototype.hasOwnProperty.call(partial,'lastRunTime')
            ? (partial.lastRunTime ?? '')
            : (current.lastRunTime ?? ''),
        lastRunMemory:Object.prototype.hasOwnProperty.call(partial,'lastRunMemory')
            ? (partial.lastRunMemory ?? '')
            : (current.lastRunMemory ?? ''),
        variants:currentVariants
    };

    if(languageKey){
        currentVariants[languageKey]={
            ...previousVariant,
            code:typeof partial.code==='string'?partial.code:(previousVariant.code ?? current.code ?? ''),
            solution:typeof partial.solution==='string'?partial.solution:(previousVariant.solution ?? current.solution ?? ''),
            lastRunInput:Object.prototype.hasOwnProperty.call(partial,'lastRunInput')
                ? (partial.lastRunInput ?? '')
                : (previousVariant.lastRunInput ?? current.lastRunInput ?? ''),
            lastRunOutput:Object.prototype.hasOwnProperty.call(partial,'lastRunOutput')
                ? (partial.lastRunOutput ?? '')
                : (previousVariant.lastRunOutput ?? current.lastRunOutput ?? ''),
            lastRunError:Object.prototype.hasOwnProperty.call(partial,'lastRunError')
                ? (partial.lastRunError ?? '')
                : (previousVariant.lastRunError ?? current.lastRunError ?? ''),
            lastRunStatus:Object.prototype.hasOwnProperty.call(partial,'lastRunStatus')
                ? (partial.lastRunStatus ?? '')
                : (previousVariant.lastRunStatus ?? current.lastRunStatus ?? ''),
            lastRunTime:Object.prototype.hasOwnProperty.call(partial,'lastRunTime')
                ? (partial.lastRunTime ?? '')
                : (previousVariant.lastRunTime ?? current.lastRunTime ?? ''),
            lastRunMemory:Object.prototype.hasOwnProperty.call(partial,'lastRunMemory')
                ? (partial.lastRunMemory ?? '')
                : (previousVariant.lastRunMemory ?? current.lastRunMemory ?? ''),
            languageId:normalizedLanguageId,
            languageName:typeof partial.languageName==='string'
                ? partial.languageName
                : (previousVariant.languageName ?? current.languageName ?? '')
        };
    }

    handleAnswerChange(questionId,updated);
}

function combineStarterAndSolution(starter='',solution=''){
    const starterText=typeof starter==='string'?starter:'';
    const solutionText=typeof solution==='string'?solution:'';

    if(starterText && solutionText){
        const needsNewline=!solutionText.startsWith('\n');
        return needsNewline
            ? `${starterText}\n${solutionText}`
            : `${starterText}${solutionText}`;
    }

    return starterText || solutionText || '';
}

function extractSolutionFromCombined(fullCode='',starter=''){
    const fullText=typeof fullCode==='string'?fullCode:'';
    const starterText=typeof starter==='string'?starter:'';

    if(!fullText){
        return '';
    }

    if(!starterText){
        return fullText;
    }

    if(!isStarterIntact(starterText,fullText)){
        return '';
    }

    let starterIndex=0;
    let buffer='';
    for(let i=0;i<fullText.length;i+=1){
        const char=fullText[i];
        if(starterIndex<starterText.length && char===starterText[starterIndex]){
            starterIndex+=1;
        }else{
            buffer+=char;
        }
    }

    return buffer;
}

function isStarterIntact(starter='',candidate=''){
    const base=typeof starter==='string'?starter:'';
    const target=typeof candidate==='string'?candidate:'';

    if(!base){
        return true;
    }

    let pointer=0;
    for(let i=0;i<target.length && pointer<base.length;i+=1){
        if(target[i]===base[pointer]){
            pointer+=1;
        }
    }

    return pointer===base.length;
}

function formatDateTime(value){
    if(!value){
        return null;
    }

    const date=new Date(value);
    if(Number.isNaN(date.getTime())){
        return null;
    }

    return date.toLocaleString();
}

function describeExamSchedule(exam){
    if(!exam){
        return '';
    }

    const parts=[];
    const duration=Number(exam.durationMinutes);
    if(Number.isFinite(duration)&&duration>0){
        parts.push(`Duration: ${duration} minute${duration===1?'':'s'}`);
    }

    const start=formatDateTime(exam.startsAt);
    const end=formatDateTime(exam.endsAt);

    if(start&&end){
        parts.push(`Opens ${start}`);
        parts.push(`Closes ${end}`);
    }else if(start){
        parts.push(`Opens ${start}`);
    }else if(end){
        parts.push(`Closes ${end}`);
    }

    return parts.join(' · ');
}

function updateHeader(exam){
    if(!examTitle||!examMeta){
        return;
    }

    examTitle.textContent=exam?.title || 'Exam';
    examMeta.textContent=describeExamSchedule(exam);

    if(!examDescription){
        return;
    }

    if(exam?.description){
        examDescription.textContent=exam.description;
        examDescription.classList.remove('hidden');
    }else{
        examDescription.textContent='';
        examDescription.classList.add('hidden');
    }
}

function loadStoredMeta(){
    if(!examId){
        return;
    }
    let storedMeta=null;
    try{
        storedMeta=JSON.parse(sessionStorage.getItem(META_STORAGE_KEY)||'{}');
    }catch(error){
        console.warn('Unable to read stored exam meta',error);
    }

    if(storedMeta&&storedMeta.examId===examId){
        if(examTitle){
            examTitle.textContent=storedMeta.title||'Exam';
        }
        if(examMeta){
            examMeta.textContent=storedMeta.schedule||'Preparing your exam…';
        }
        if(examDescription){
            if(storedMeta.description){
                examDescription.textContent=storedMeta.description;
                examDescription.classList.remove('hidden');
            }else{
                examDescription.textContent='';
                examDescription.classList.add('hidden');
            }
        }
    }else{
        sessionStorage.removeItem(META_STORAGE_KEY);
    }
}

function clearContent(message){
    if(!contentDiv){
        return;
    }
    contentDiv.innerHTML='';
    const paragraph=document.createElement('p');
    paragraph.className='muted';
    paragraph.textContent=message;
    contentDiv.appendChild(paragraph);
}

function setLoading(isLoading){
    if(isLoading){
        setStatus('Loading exam…','info');
        if(prevButton)prevButton.disabled=true;
        if(nextButton)nextButton.disabled=true;
        if(submitButton)submitButton.disabled=true;
    }else{
        updateNavigationState();
        updateSubmitState();
    }
}

async function ensureExamSession(){
    if(!examId || !token){
        return null;
    }

    if(state.examSessionData && state.examSessionId){
        return state.examSessionData;
    }

    let response;
    try{
        response=await fetch(`/api/exams/${examId}/session`,{
            method:'POST',
            headers:{
                Authorization:`Bearer ${token}`
            }
        });
    }catch(networkError){
        throw new Error('Unable to reach the server. Check your connection and try again.');
    }

    if(response.status===401){
        localStorage.removeItem('token');
        localStorage.removeItem('currentUser');
        window.location.href='/login';
        return null;
    }

    const data=await response.json().catch(()=>null);

    if(!response.ok){
        const message=data?.message || 'Unable to start an exam session.';
        if(response.status===409){
            state.hasSubmitted=true;
            try{
                if(PROGRESS_STORAGE_KEY){
                    sessionStorage.removeItem(PROGRESS_STORAGE_KEY);
                }
                sessionStorage.removeItem(META_STORAGE_KEY);
            }catch(storageError){
                console.warn('Unable to adjust stored exam state',storageError);
            }
        }
        state.examSessionId=null;
        throw new Error(message);
    }

    const session=data?.session || {};
    const sessionId=session.id || session._id || data?.sessionId || null;
    if(!sessionId){
        throw new Error('The server did not provide a session identifier.');
    }

    state.examSessionId=sessionId;
    state.examSessionData={
        id:sessionId,
        status:session.status||null,
        startedAt:session.startedAt||session.createdAt||null,
        endedAt:session.endedAt||null,
        createdAt:session.createdAt||null,
        updatedAt:session.updatedAt||null
    };

    return state.examSessionData;
}

function updateNavigationState(){
    if(!prevButton||!nextButton){
        return;
    }

    const categoryQuestions=getActiveCategoryQuestions();

    if(!categoryQuestions.length||state.hasSubmitted){
        prevButton.disabled=true;
        nextButton.disabled=true;
        return;
    }

    if(state.isSubmitting){
        prevButton.disabled=true;
        nextButton.disabled=true;
        return;
    }

    prevButton.disabled=state.currentQuestionIndex<=0;
    nextButton.disabled=state.currentQuestionIndex>=categoryQuestions.length-1;
}

function updateSubmitState(){
    if(!submitButton){
        return;
    }

    if(!state.questions.length||state.hasSubmitted){
        submitButton.disabled=true;
        return;
    }

    submitButton.disabled=state.isSubmitting || state.responses.size!==state.questions.length;
}

function updateProgress(){
    if(!progress){
        return;
    }

    if(state.hasSubmitted){
        progress.style.width='100%';
        if(typeof progress.setAttribute==='function'){
            const total=state.questions.length || 0;
            progress.setAttribute('aria-valuemin','0');
            progress.setAttribute('aria-valuemax',String(total));
            progress.setAttribute('aria-valuenow',String(total));
            progress.setAttribute('aria-valuetext','Exam submitted');
        }
        return;
    }

    const categoryQuestions=getActiveCategoryQuestions();
    const activeCategory=getActiveCategory();

    if(!categoryQuestions.length){
        progress.style.width='0%';
        if(typeof progress.setAttribute==='function'){
            progress.setAttribute('aria-valuemin','0');
            progress.setAttribute('aria-valuemax','0');
            progress.setAttribute('aria-valuenow','0');
            progress.removeAttribute('aria-valuetext');
        }
        return;
    }

    const answered=countAnsweredInCategory(activeCategory);
    const currentPosition=Math.min(
        Math.max(state.currentQuestionIndex+1,0),
        categoryQuestions.length
    );
    const displayedCount=currentPosition || 0;
    const percentage=categoryQuestions.length
        ? (displayedCount/categoryQuestions.length)*100
        : 0;
    const clampedPercentage=Math.min(Math.max(percentage,0),100);
    progress.style.width=`${clampedPercentage}%`;

    if(typeof progress.setAttribute==='function'){
        progress.setAttribute('aria-valuemin','0');
        progress.setAttribute('aria-valuemax',String(categoryQuestions.length));
        progress.setAttribute('aria-valuenow',String(displayedCount));
        const ariaText=displayedCount>0
            ? `Viewing question ${displayedCount} of ${categoryQuestions.length}. ${answered} answered.`
            : `No question selected. ${answered} answered of ${categoryQuestions.length}.`;
        progress.setAttribute('aria-valuetext',ariaText);
    }
}

function updateCounters(){
    if(state.hasSubmitted){
        if(questionCounter){
            questionCounter.textContent='Exam submitted';
        }
        if(answerCounter){
            const total=state.questions.length;
            if(total>0){
                const answered=Math.min(state.responses.size,total);
                answerCounter.textContent=`Answered ${answered} of ${total}`;
            }else{
                answerCounter.textContent='Submission recorded';
            }
        }
        updateCategorySummary();
        return;
    }

    const categoryQuestions=getActiveCategoryQuestions();
    const totalInCategory=categoryQuestions.length;
    const current=totalInCategory?state.currentQuestionIndex+1:0;
    const activeCategory=getActiveCategory();

    if(questionCounter){
        if(activeCategory && state.categories.length>1){
            questionCounter.textContent=`${activeCategory}: Question ${current} of ${totalInCategory}`;
        }else{
            questionCounter.textContent=`Question ${current} of ${totalInCategory}`;
        }
    }

    if(answerCounter){
        const overallTotal=state.questions.length;
        const answeredInCategory=countAnsweredInCategory(activeCategory);
        if(state.categories.length>1){
            const categoryProgressText=totalInCategory
                ? `${answeredInCategory}/${totalInCategory}`
                : `${answeredInCategory}`;
            const categoryLabel=totalInCategory
                ? `Category answered: ${categoryProgressText}`
                : `Category answered: ${answeredInCategory}`;
            answerCounter.textContent=`${categoryLabel} · Overall: ${state.responses.size}/${overallTotal}`;
        }else{
            answerCounter.textContent=overallTotal
                ?`Answered: ${state.responses.size}/${overallTotal}`
                :'0 answered';
        }
    }

    updateCategorySummary();
}

function persistProgress(){
    if(!PROGRESS_STORAGE_KEY||state.hasSubmitted){
        return;
    }

    const payload={
        examId,
        activeCategory:getActiveCategory(),
        currentQuestionIndex:state.currentQuestionIndex,
        categoryPositions:Array.from(state.categoryPositions.entries()).map(([category,index])=>[
            category,
            Number.isInteger(Number(index))?Number(index):0
        ]),
        responses:Array.from(state.responses.entries()),
        updatedAt:new Date().toISOString()
    };

    try{
        sessionStorage.setItem(PROGRESS_STORAGE_KEY,JSON.stringify(payload));
    }catch(error){
        console.warn('Unable to persist exam progress',error);
    }
}

async function executeCodeRun({ source, languageId, stdin }){
    const authToken=token||localStorage.getItem('token');

    if(!authToken){
        throw new Error('Sign in to run code.');
    }

    const response=await fetch('/api/code/run',{
        method:'POST',
        headers:{
            Authorization:`Bearer ${authToken}`,
            'Content-Type':'application/json'
        },
        body:JSON.stringify({
            source,
            languageId,
            stdin
        })
    });

    const data=await response.json().catch(()=>({}));

    if(response.status===401){
        const message=(data && data.message)||'';
        const normalizedMessage=typeof message==='string'?message.toLowerCase():'';
        const isAuthIssue=normalizedMessage.includes('authenticat') || normalizedMessage.includes('sign in');

        if(isAuthIssue){
            localStorage.removeItem('token');
            localStorage.removeItem('currentUser');
            window.location.href='/login';
            throw new Error(message || 'Authentication required');
        }

        const error=new Error(message || 'Code execution service rejected the request.');
        error.details=data.details || null;
        throw error;
    }

    if(!response.ok){
        const error=new Error(data.message || 'Failed to run code.');
        error.details=data.details || null;
        throw error;
    }

    return data;
}

function restoreProgress(){
    if(!PROGRESS_STORAGE_KEY){
        return;
    }

    let storedProgress=null;
    try{
        storedProgress=JSON.parse(sessionStorage.getItem(PROGRESS_STORAGE_KEY)||'{}');
    }catch(error){
        console.warn('Unable to restore exam progress',error);
    }

    if(!storedProgress||storedProgress.examId!==examId){
        return;
    }

    if(Array.isArray(storedProgress.responses)){
        state.responses=new Map(storedProgress.responses.map(([questionId,value])=>[String(questionId), value]));
    }

    let storedPositionsMap=null;
    if(Array.isArray(storedProgress.categoryPositions)){
        storedPositionsMap=new Map(
            storedProgress.categoryPositions.map(([category,index])=>[
                category,
                Number.isInteger(Number(index))?Number(index):0
            ])
        );
    }

    if(storedPositionsMap){
        const updatedPositions=new Map();
        state.categories.forEach((category)=>{
            const length=(state.questionsByCategory.get(category)?.length || 0)-1;
            const storedIndex=storedPositionsMap.has(category)
                ? storedPositionsMap.get(category)
                : 0;
            const safeIndex=Math.min(
                Math.max(Number(storedIndex)||0,0),
                Math.max(length,0)
            );
            updatedPositions.set(category,safeIndex);
        });
        state.categoryPositions=updatedPositions;
    }else{
        state.categoryPositions=new Map(state.categories.map((category)=>[category,0]));
    }

    if(typeof storedProgress.activeCategory==='string'
        && state.questionsByCategory.has(storedProgress.activeCategory)){
        state.activeCategory=storedProgress.activeCategory;
    }

    const activeCategory=getActiveCategory();
    const categoryQuestions=getActiveCategoryQuestions();
    let desiredIndex=0;

    if(Number.isInteger(storedProgress.currentQuestionIndex)){
        desiredIndex=storedProgress.currentQuestionIndex;
    }else if(activeCategory && state.categoryPositions.has(activeCategory)){
        desiredIndex=state.categoryPositions.get(activeCategory);
    }

    desiredIndex=Math.min(
        Math.max(Number(desiredIndex)||0,0),
        Math.max(categoryQuestions.length-1,0)
    );

    state.currentQuestionIndex=desiredIndex;
    if(activeCategory){
        state.categoryPositions.set(activeCategory,desiredIndex);
    }
}

function handleAnswerChange(questionId,value){
    const id=String(questionId);

    if(value && typeof value==='object' && Object.prototype.hasOwnProperty.call(value,'code')){
        const codeValue=typeof value.code==='string'?value.code:'';
        const solutionValue=typeof value.solution==='string'?value.solution:'';
        const answered=solutionValue.trim().length>0
            || (!Object.prototype.hasOwnProperty.call(value,'solution') && codeValue.trim().length>0);

        if(answered){
            const normalizedLanguageId=Number.isInteger(Number(value.languageId)) && Number(value.languageId)>0
                ? Number(value.languageId)
                : (value.languageId ?? '');
            const nextValue={ ...value, code:codeValue, solution:solutionValue };
            if(Number.isInteger(normalizedLanguageId) && normalizedLanguageId>0){
                nextValue.languageId=normalizedLanguageId;
            }else if(normalizedLanguageId===''){
                nextValue.languageId='';
            }
            state.responses.set(id,nextValue);
        }else{
            state.responses.delete(id);
        }
    }else if(typeof value==='string'){
        if(value.trim()){
            state.responses.set(id,value);
        }else{
            state.responses.delete(id);
        }
    }else if(value===null || typeof value==='undefined'){
        state.responses.delete(id);
    }else{
        state.responses.set(id,value);
    }

    updateCounters();
    updateSubmitState();
    persistProgress();
    renderCategoryChips();
}

function answerRequiresManualReviewFlag(answer,question){
    if(!answer){
        return false;
    }

    if(answer.codeAnswer){
        if(typeof answer.codeAnswer.manualReviewRequired==='boolean'){
            return answer.codeAnswer.manualReviewRequired;
        }
        return typeof answer.isCorrect==='undefined';
    }

    const questionType=(question?.type || '').toLowerCase();
    if(questionType==='written'){
        return typeof answer.isCorrect==='undefined';
    }

    return false;
}

function renderExamCompletionView(){
    if(!contentDiv){
        return;
    }

    disposeActiveCodeEditor();
    contentDiv.innerHTML='';

    const summary=state.submissionResult || {};
    const totalQuestions=Number.isFinite(summary.totalQuestions)
        ? summary.totalQuestions
        : state.questions.length;

    const card=document.createElement('div');
    card.className='submission-complete-card';

    const heading=document.createElement('h2');
    heading.textContent='Exam submitted';
    card.appendChild(heading);

    const submittedAtText=summary.submittedAt?formatDateTime(summary.submittedAt):null;
    const lead=document.createElement('p');
    lead.className='submission-complete-lead';
    lead.textContent=submittedAtText
        ? `Submitted on ${submittedAtText}.`
        : 'Your submission has been recorded.';
    card.appendChild(lead);

    const summaryList=document.createElement('ul');
    summaryList.className='submission-complete-summary';

    if(Number.isFinite(summary.score)){
        const scoreItem=document.createElement('li');
        const totalLabel=Number.isFinite(totalQuestions) && totalQuestions>0
            ? ` / ${totalQuestions}`
            : '';
        scoreItem.innerHTML=`<strong>Score:</strong> ${summary.score}${totalLabel}`;
        summaryList.appendChild(scoreItem);
    }else if(Number.isFinite(totalQuestions) && totalQuestions>0){
        const answeredItem=document.createElement('li');
        const answeredCount=Math.min(state.responses.size,totalQuestions);
        answeredItem.innerHTML=`<strong>Responses recorded:</strong> ${answeredCount} of ${totalQuestions}`;
        summaryList.appendChild(answeredItem);
    }

    if(Number.isFinite(summary.manualReviewCount) && summary.manualReviewCount>0){
        const manualItem=document.createElement('li');
        const answerLabel=summary.manualReviewCount===1?'answer':'answers';
        manualItem.innerHTML=`<strong>Manual review:</strong> ${summary.manualReviewCount} ${answerLabel} awaiting instructor grading.`;
        summaryList.appendChild(manualItem);
    }else if(summary.requiresManualReview){
        const manualItem=document.createElement('li');
        manualItem.innerHTML='<strong>Manual review:</strong> Some answers will be reviewed by your instructor.';
        summaryList.appendChild(manualItem);
    }

    if(summaryList.children.length){
        card.appendChild(summaryList);
    }

    if(summary.message){
        const message=document.createElement('p');
        message.className='submission-complete-message';
        message.textContent=summary.message;
        card.appendChild(message);
    }

    const footnote=document.createElement('p');
    footnote.className='submission-complete-footnote muted';
    footnote.textContent='You can safely close this page or return to your dashboard to continue.';
    card.appendChild(footnote);

    contentDiv.appendChild(card);

    if(exitButton){
        exitButton.classList.remove('secondary');
        exitButton.textContent='Return to dashboard';
        exitButton.disabled=false;
    }

    if(questionCounter){
        questionCounter.textContent='Exam submitted';
    }

    if(answerCounter){
        if(Number.isFinite(totalQuestions) && totalQuestions>0){
            const answeredCount=Math.min(state.responses.size,totalQuestions);
            answerCounter.textContent=`Answered ${answeredCount} of ${totalQuestions}`;
        }else{
            answerCounter.textContent='Submission recorded';
        }
    }

    if(categoryBar){
        categoryBar.classList.add('hidden');
    }
}

function renderQuestion(){
    if(!contentDiv){
        return;
    }

    disposeActiveCodeEditor();

    if(state.hasSubmitted){
        renderExamCompletionView();
        return;
    }

    contentDiv.innerHTML='';

    if(!state.questions.length){
        clearContent('This exam is not ready yet. Please contact your instructor.');
        return;
    }

    const categoryQuestions=getActiveCategoryQuestions();
    const activeCategory=getActiveCategory();

    if(!categoryQuestions.length){
        const message=activeCategory
            ?`No questions are available in the "${activeCategory}" category yet.`
            :'No questions available in this category yet.';
        clearContent(message);
        updateCategorySummary();
        return;
    }

    if(state.currentQuestionIndex>=categoryQuestions.length){
        state.currentQuestionIndex=Math.max(categoryQuestions.length-1,0);
    }

    const question=categoryQuestions[state.currentQuestionIndex];
    if(!question){
        clearContent('Unable to load this question.');
        return;
    }

    if(activeCategory){
        state.categoryPositions.set(activeCategory,state.currentQuestionIndex);
    }

    const wrapper=document.createElement('div');
    wrapper.className='question-card';

    const header=document.createElement('div');
    header.className='question-header';

    const counter=document.createElement('span');
    counter.className='question-counter';
    counter.textContent=`Question ${state.currentQuestionIndex+1} of ${categoryQuestions.length}`;

    const text=document.createElement('p');
    text.className='question-text';
    text.textContent=question.text;

    header.appendChild(counter);
    header.appendChild(text);
    wrapper.appendChild(header);

    const questionType=(question.type||'mcq').toLowerCase();

    const typeBadge=document.createElement('span');
    typeBadge.className='badge question-type-badge';
    let typeLabel='Multiple choice';
    if(questionType==='written'){
        typeLabel='Written answer';
    }else if(questionType==='code'){
        typeLabel='Code challenge';
    }
    typeBadge.textContent=typeLabel;
    header.appendChild(typeBadge);

    const categoryBadge=document.createElement('span');
    categoryBadge.className='badge question-category';
    categoryBadge.textContent=getQuestionCategoryValue(question);
    header.appendChild(categoryBadge);

    if(questionType==='written'){
        const storedValue=state.responses.get(String(question._id));
        const textarea=document.createElement('textarea');
        textarea.className='option-textarea';
        textarea.id=`question-${question._id}-written`;
        textarea.placeholder='Type your answer here…';
        textarea.value=typeof storedValue==='string'? storedValue:'';
        textarea.addEventListener('input',(event)=>{
            handleAnswerChange(question._id,event.target.value);
        });
        wrapper.appendChild(textarea);

        const helper=document.createElement('p');
        helper.className='answer-summary';
        helper.textContent=question.requiresManualGrading
            ?'Your instructor will review this response manually.'
            :'Your response will be checked against the expected answer.';
        wrapper.appendChild(helper);
    }else if(questionType==='code'){
        const settings=question.codeSettings || {};
        const storedEntry=getCodeResponseEntry(question._id) || {};
        const baseLanguageId=Number(settings.languageId) || 63;

        const languageOptions=[...JUDGE0_LANGUAGES];
        const ensureLanguageOption=(id,label)=>{
            const numeric=Number(id);
            if(!Number.isInteger(numeric) || numeric<=0){
                return;
            }
            if(!languageOptions.some((option)=>Number(option.id)===numeric)){
                languageOptions.push({
                    id:numeric,
                    label:label || `Language ${numeric}`,
                    monaco:resolveMonacoLanguage(numeric)
                });
            }
        };
        ensureLanguageOption(baseLanguageId,settings.languageName);
        if(storedEntry.languageId){
            ensureLanguageOption(storedEntry.languageId,storedEntry.languageName);
        }

        const findLanguageOption=(id)=>{
            if(id===undefined || id===null){
                return null;
            }
            const numeric=Number(id);
            if(!Number.isFinite(numeric)){
                return null;
            }
            return languageOptions.find((option)=>Number(option.id)===numeric) || null;
        };

        const languageVariants=new Map();
        if(storedEntry.variants && typeof storedEntry.variants==='object'){
            Object.entries(storedEntry.variants).forEach(([key,value])=>{
                languageVariants.set(key,{ ...value });
            });
        }

        const refreshVariantsFromState=(entry)=>{
            const latest=entry || getCodeResponseEntry(question._id) || {};
            languageVariants.clear();
            if(latest.variants && typeof latest.variants==='object'){
                Object.entries(latest.variants).forEach(([key,value])=>{
                    languageVariants.set(key,{ ...value });
                });
            }
        };
        refreshVariantsFromState(storedEntry);

        const defaultLanguageOption=findLanguageOption(baseLanguageId) || languageOptions[0];
        let activeLanguageOption=findLanguageOption(storedEntry.languageId) || defaultLanguageOption;
        let activeLanguageId=Number(activeLanguageOption?.id) || baseLanguageId;
        let activeLanguageName=activeLanguageOption?.label || settings.languageName || 'Programming language';
        let activeMonacoLanguage=activeLanguageOption?.monaco || resolveMonacoLanguage(activeLanguageId);

        const baseStarter=typeof settings.starterCode==='string'?settings.starterCode:'';
        const defaultSampleInput=(settings.publicTestCases && settings.publicTestCases[0]?.input) || '';
        const defaultSampleOutput=(settings.publicTestCases && settings.publicTestCases[0]?.expectedOutput) || '';

        const limitParts=[];
        if(settings.timeLimit){
            limitParts.push(`${settings.timeLimit}s`);
        }
        if(settings.memoryLimit){
            limitParts.push(`${settings.memoryLimit} KB`);
        }
        const limitText=limitParts.length?` · Limits: ${limitParts.join(', ')}`:'';

        const meta=document.createElement('div');
        meta.className='code-meta';
        wrapper.appendChild(meta);

        const computeStarter=(languageId)=>Number(languageId)===Number(baseLanguageId)
            ? baseStarter
            : defaultStarterTemplateForLanguage(languageId);

        const getVariant=(languageId)=>languageVariants.get(String(languageId)) || null;

        let currentStarter=computeStarter(activeLanguageId) || '';
        let starterLocked=Boolean(currentStarter);
        let starterLength=currentStarter.length;

        const initialVariant=getVariant(activeLanguageId)
            || (Number(storedEntry.languageId)===activeLanguageId ? storedEntry : null);

        let combinedInitialCode='';
        if(initialVariant && typeof initialVariant.code==='string'
            && (!starterLocked || isStarterIntact(currentStarter,initialVariant.code))){
            combinedInitialCode=initialVariant.code;
        }else if(starterLocked){
            combinedInitialCode=currentStarter || '';
        }else if(initialVariant && typeof initialVariant.code==='string'){
            combinedInitialCode=initialVariant.code;
        }else if(storedEntry.code){
            combinedInitialCode=storedEntry.code;
        }else if(storedEntry.solution){
            combinedInitialCode=storedEntry.solution;
        }
        if(!combinedInitialCode){
            combinedInitialCode=currentStarter || defaultStarterTemplateForLanguage(activeLanguageId) || '';
        }

    let lastKnownCombined=combinedInitialCode;

        const configBar=document.createElement('div');
        configBar.className='code-config-bar';

        const languageField=document.createElement('div');
        languageField.className='code-language-field';

        const languageLabel=document.createElement('label');
        languageLabel.setAttribute('for',`code-language-${question._id}`);
        languageLabel.textContent='Language';
        languageField.appendChild(languageLabel);

        const languageSelect=document.createElement('select');
        languageSelect.id=`code-language-${question._id}`;
        languageSelect.className='code-language-select';
        languageOptions.forEach((option)=>{
            const opt=document.createElement('option');
            opt.value=String(option.id);
            opt.textContent=option.label;
            languageSelect.appendChild(opt);
        });
        languageSelect.value=String(activeLanguageId);
        languageField.appendChild(languageSelect);
        configBar.appendChild(languageField);
        wrapper.appendChild(configBar);

        const editorShell=document.createElement('div');
        editorShell.className='code-editor-shell';

        const editorLabel=document.createElement('label');
        editorShell.appendChild(editorLabel);

        const editorContainer=document.createElement('div');
        editorContainer.className='code-editor';
        editorContainer.id=`code-solution-editor-${question._id}`;
        editorShell.appendChild(editorContainer);

        const helperNote=document.createElement('p');
        helperNote.className='answer-summary';
        editorShell.appendChild(helperNote);

        wrapper.appendChild(editorShell);

        const runSection=document.createElement('div');
        runSection.className='code-runner';

        const inputLabel=document.createElement('label');
        inputLabel.textContent='Custom input (stdin)';
        runSection.appendChild(inputLabel);

        const inputTextarea=document.createElement('textarea');
        inputTextarea.className='code-run-input';
        inputTextarea.placeholder='Optional input passed to the program';
        runSection.appendChild(inputTextarea);

        const expectedOutputLabel=document.createElement('label');
        expectedOutputLabel.textContent='Expected output (from selected sample)';
        runSection.appendChild(expectedOutputLabel);

        const expectedOutputPreview=document.createElement('pre');
        expectedOutputPreview.className='code-expected-output';
        expectedOutputPreview.textContent=defaultSampleOutput;
        runSection.appendChild(expectedOutputPreview);

        if(Array.isArray(settings.publicTestCases) && settings.publicTestCases.length){
            const sampleBar=document.createElement('div');
            sampleBar.className='code-samples';
            const sampleLabel=document.createElement('span');
            sampleLabel.textContent='Samples:';
            sampleBar.appendChild(sampleLabel);

            settings.publicTestCases.forEach((testCase,index)=>{
                const button=document.createElement('button');
                button.type='button';
                button.className='chip';
                button.textContent=`Example ${index+1}`;
                button.addEventListener('click',()=>{
                    inputTextarea.value=testCase.input || '';
                    expectedOutputPreview.textContent=testCase.expectedOutput || '';
                    persistCodeOnly({ lastRunInput:inputTextarea.value });
                });
                sampleBar.appendChild(button);
            });

            runSection.insertBefore(sampleBar,inputLabel);
        }

        const runControls=document.createElement('div');
        runControls.className='code-run-controls';

        const runButton=document.createElement('button');
        runButton.type='button';
        runButton.className='primary';
        runButton.textContent='Run code';
        runControls.appendChild(runButton);

        const runStatus=document.createElement('span');
        runStatus.className='code-run-status muted';
        runControls.appendChild(runStatus);

        runSection.appendChild(runControls);

        const outputLabel=document.createElement('label');
        outputLabel.textContent='Program output';
        runSection.appendChild(outputLabel);

        const outputPre=document.createElement('pre');
        outputPre.className='code-output';
        runSection.appendChild(outputPre);

        const errorPre=document.createElement('pre');
        errorPre.className='code-output error';
        errorPre.classList.add('hidden');
        runSection.appendChild(errorPre);

        wrapper.appendChild(runSection);

        let fallbackTextarea=null;
        let ignoreModelChange=false;

        const updateMetaLabel=()=>{
            meta.textContent=`Language: ${activeLanguageName}${limitText}`;
        };

        const updateHelperText=()=>{
            if(starterLocked){
                editorLabel.textContent='Code editor (starter code is locked)';
                helperNote.textContent='The starter template cannot be removed. Add your code anywhere—including between starter lines.';
            }else{
                editorLabel.textContent='Code editor';
                helperNote.textContent='Write your solution in the editor below.';
            }
        };

        function persistCodeOnly(extra={}){
            const payload={
                code:lastKnownCombined,
                solution:extractSolutionFromCombined(lastKnownCombined,currentStarter),
                languageId:activeLanguageId,
                languageName:activeLanguageName
            };
            Object.entries(extra).forEach(([key,value])=>{
                if(typeof value!=='undefined'){
                    payload[key]=value;
                }
            });
            persistCodeResponse(question._id,payload);
            refreshVariantsFromState();
        }

        function applyLanguageChange(newLanguageId,{ initial=false }={}){
            const numericId=Number.isInteger(Number(newLanguageId)) && Number(newLanguageId)>0
                ? Number(newLanguageId)
                : baseLanguageId;
            const option=findLanguageOption(numericId) || defaultLanguageOption;
            activeLanguageOption=option;
            activeLanguageId=Number(option?.id) || baseLanguageId;
            activeLanguageName=option?.label || settings.languageName || 'Programming language';
            activeMonacoLanguage=option?.monaco || resolveMonacoLanguage(activeLanguageId);
            languageSelect.value=String(activeLanguageId);

            currentStarter=computeStarter(activeLanguageId) || '';
            starterLocked=Boolean(currentStarter);
            starterLength=currentStarter.length;

            refreshVariantsFromState();
            const variant=getVariant(activeLanguageId)
                || (Number(storedEntry.languageId)===activeLanguageId ? storedEntry : null);

            let nextCombined='';
            if(variant && typeof variant.code==='string'
                && (!starterLocked || isStarterIntact(currentStarter,variant.code))){
                nextCombined=variant.code;
            }else if(starterLocked){
                nextCombined=currentStarter || '';
            }else if(variant && typeof variant.code==='string'){
                nextCombined=variant.code;
            }else{
                nextCombined=defaultStarterTemplateForLanguage(activeLanguageId) || '';
            }
            if(!nextCombined){
                nextCombined=currentStarter || '';
            }

            lastKnownCombined=nextCombined;

            if(activeCodeEditor && activeCodeQuestionId===String(question._id)){
                if(window.MonacoHelper && typeof window.MonacoHelper.updateLanguage==='function'){
                    window.MonacoHelper.updateLanguage(activeCodeEditor,activeMonacoLanguage);
                }
                ignoreModelChange=true;
                activeCodeEditor.setValue(lastKnownCombined);
                ignoreModelChange=false;
                const model=activeCodeEditor.getModel();
                if(model){
                    const caretOffset=starterLocked
                        ? Math.min(starterLength,lastKnownCombined.length)
                        : lastKnownCombined.length;
                    const caretPosition=model.getPositionAt(caretOffset);
                    activeCodeEditor.setPosition(caretPosition);
                    activeCodeEditor.revealPositionInCenterIfOutsideViewport(caretPosition);
                }
            }else if(fallbackTextarea){
                fallbackTextarea.value=lastKnownCombined;
                fallbackTextarea.placeholder=starterLocked
                    ?'Starter code is locked. Add your code anywhere without removing the template.'
                    :'Type your solution here…';
                const caret=starterLocked
                    ? Math.min(starterLength,lastKnownCombined.length)
                    : lastKnownCombined.length;
                fallbackTextarea.setSelectionRange(caret,caret);
            }

            const runData=(variant && typeof variant==='object') ? variant : {};
            inputTextarea.value=typeof runData.lastRunInput==='string'
                ? runData.lastRunInput
                : (defaultSampleInput || '');
            runStatus.textContent=runData.lastRunStatus || '';
            outputPre.textContent=runData.lastRunOutput || '';
            if(runData.lastRunError){
                errorPre.textContent=runData.lastRunError;
                errorPre.classList.remove('hidden');
            }else{
                errorPre.textContent='';
                errorPre.classList.add('hidden');
            }
            if(!inputTextarea.value && defaultSampleInput){
                inputTextarea.value=defaultSampleInput;
            }

            updateHelperText();
            updateMetaLabel();

            if(!initial){
                persistCodeOnly({
                    lastRunInput:inputTextarea.value,
                    lastRunOutput:runData.lastRunOutput ?? '',
                    lastRunError:runData.lastRunError ?? '',
                    lastRunStatus:runData.lastRunStatus ?? '',
                    lastRunTime:runData.lastRunTime ?? '',
                    lastRunMemory:runData.lastRunMemory ?? ''
                });
            }
        }

        updateMetaLabel();
        updateHelperText();
        applyLanguageChange(activeLanguageId,{ initial:true });

        languageSelect.addEventListener('change',()=>{
            applyLanguageChange(languageSelect.value);
        });

        inputTextarea.addEventListener('input',()=>{
            persistCodeOnly({ lastRunInput:inputTextarea.value });
        });

        (async ()=>{
            if(!window.MonacoHelper){
                fallbackTextarea=document.createElement('textarea');
                fallbackTextarea.className='code-fallback-textarea';
                fallbackTextarea.value=lastKnownCombined;
                fallbackTextarea.placeholder=starterLocked
                    ?'Starter code is locked. Add your code anywhere without removing the template.'
                    :'Type your solution here…';
                const caret=starterLocked
                    ? Math.min(starterLength,lastKnownCombined.length)
                    : lastKnownCombined.length;
                fallbackTextarea.setSelectionRange(caret,caret);
                fallbackTextarea.addEventListener('input',(event)=>{
                    const value=event.target.value;
                    if(starterLocked && !isStarterIntact(currentStarter,value)){
                        event.target.value=lastKnownCombined;
                        const clamp=starterLocked
                            ? Math.min(starterLength,lastKnownCombined.length)
                            : lastKnownCombined.length;
                        event.target.setSelectionRange(clamp,clamp);
                        return;
                    }
                    lastKnownCombined=value;
                    persistCodeOnly();
                });
                editorContainer.replaceWith(fallbackTextarea);
                return;
            }

            try{
                const editor=await window.MonacoHelper.createEditor(editorContainer,{
                    value:lastKnownCombined,
                    language:activeMonacoLanguage,
                    theme:'vs-dark',
                    minimap:false,
                    fontSize:15
                });
                activeCodeEditor=editor;
                activeCodeQuestionId=String(question._id);

                editor.onDidChangeModelContent(()=>{
                    if(ignoreModelChange){
                        return;
                    }

                    const modelValue=editor.getValue();
                    if(starterLocked && !isStarterIntact(currentStarter,modelValue)){
                        const model=editor.getModel();
                        if(model){
                            ignoreModelChange=true;
                            editor.pushUndoStop();
                            editor.executeEdits('restoreStarter',[{
                                range:model.getFullModelRange(),
                                text:lastKnownCombined
                            }]);
                            editor.pushUndoStop();
                            const caretOffset=starterLocked
                                ? Math.min(starterLength,lastKnownCombined.length)
                                : lastKnownCombined.length;
                            const caretPosition=model.getPositionAt(caretOffset);
                            editor.setPosition(caretPosition);
                            editor.revealPositionInCenterIfOutsideViewport(caretPosition);
                            ignoreModelChange=false;
                        }
                        return;
                    }

                    lastKnownCombined=modelValue;
                    persistCodeOnly();
                });
            }catch(error){
                console.error('Failed to initialise Monaco editor',error);
                fallbackTextarea=document.createElement('textarea');
                fallbackTextarea.className='code-fallback-textarea';
                fallbackTextarea.value=lastKnownCombined;
                fallbackTextarea.placeholder=starterLocked
                    ?'Starter code is locked. Add your code anywhere without removing the template.'
                    :'Type your solution here…';
                const caret=starterLocked
                    ? Math.min(starterLength,lastKnownCombined.length)
                    : lastKnownCombined.length;
                fallbackTextarea.setSelectionRange(caret,caret);
                fallbackTextarea.addEventListener('input',(event)=>{
                    const value=event.target.value;
                    if(starterLocked && !isStarterIntact(currentStarter,value)){
                        event.target.value=lastKnownCombined;
                        const clamp=starterLocked
                            ? Math.min(starterLength,lastKnownCombined.length)
                            : lastKnownCombined.length;
                        event.target.setSelectionRange(clamp,clamp);
                        return;
                    }
                    lastKnownCombined=value;
                    persistCodeOnly();
                });
                editorContainer.replaceWith(fallbackTextarea);
            }
        })();

        runButton.addEventListener('click',async ()=>{
            let combinedValue=lastKnownCombined;

            if(activeCodeEditor && activeCodeQuestionId===String(question._id)){
                combinedValue=activeCodeEditor.getValue();
                if(starterLocked && !isStarterIntact(currentStarter,combinedValue)){
                    combinedValue=lastKnownCombined;
                    const model=activeCodeEditor.getModel();
                    if(model){
                        activeCodeEditor.pushUndoStop();
                        activeCodeEditor.executeEdits('restoreStarter',[{
                            range:model.getFullModelRange(),
                            text:lastKnownCombined
                        }]);
                        activeCodeEditor.pushUndoStop();
                        const caretOffset=starterLocked
                            ? Math.min(starterLength,lastKnownCombined.length)
                            : lastKnownCombined.length;
                        const caretPosition=model.getPositionAt(caretOffset);
                        activeCodeEditor.setPosition(caretPosition);
                        activeCodeEditor.revealPositionInCenterIfOutsideViewport(caretPosition);
                    }
                }else{
                    lastKnownCombined=combinedValue;
                }
            }else if(fallbackTextarea){
                combinedValue=fallbackTextarea.value;
                if(starterLocked && !isStarterIntact(currentStarter,combinedValue)){
                    fallbackTextarea.value=lastKnownCombined;
                    const caret=starterLocked
                        ? Math.min(starterLength,lastKnownCombined.length)
                        : lastKnownCombined.length;
                    fallbackTextarea.setSelectionRange(caret,caret);
                    combinedValue=lastKnownCombined;
                }else{
                    lastKnownCombined=combinedValue;
                }
            }

            runButton.disabled=true;
            runStatus.textContent='Running…';
            errorPre.classList.add('hidden');

            try{
                const result=await executeCodeRun({
                    source:combinedValue,
                    languageId:Number(activeLanguageId),
                    stdin:inputTextarea.value
                });

                const stdout=result.stdout || '';
                const stderr=result.stderr || result.compile_output || '';
                outputPre.textContent=stdout || '(no output)';
                if(stderr){
                    errorPre.textContent=stderr;
                    errorPre.classList.remove('hidden');
                }else{
                    errorPre.textContent='';
                    errorPre.classList.add('hidden');
                }
                runStatus.textContent=result.status?.description || 'Execution finished';

                persistCodeOnly({
                    lastRunInput:inputTextarea.value,
                    lastRunOutput:stdout,
                    lastRunError:stderr,
                    lastRunStatus:result.status?.description || '',
                    lastRunTime:result.time || '',
                    lastRunMemory:result.memory || ''
                });
            }catch(error){
                runStatus.textContent=error.message || 'Execution failed';
                if(error.details){
                    errorPre.textContent=typeof error.details==='string'
                        ? error.details
                        : JSON.stringify(error.details,null,2);
                    errorPre.classList.remove('hidden');
                }else{
                    errorPre.textContent='';
                    errorPre.classList.add('hidden');
                }
            }finally{
                runButton.disabled=false;
                updateSubmitState();
                updateCounters();
            }
        });
    }else{
        const storedValue=state.responses.get(String(question._id));
        const optionsList=document.createElement('div');
        optionsList.className='option-list';

        const numericSelection=typeof storedValue==='number'
            ? storedValue
            : Number(storedValue);

        (question.options||[]).forEach((option,optionIndex)=>{
            const optionText=typeof option==='string'?option:option?.text;
            if(!optionText){
                return;
            }

            const label=document.createElement('label');
            label.className='option-item';

            const input=document.createElement('input');
            input.type='radio';
            input.name=`question-${question._id}`;
            input.value=String(optionIndex);
            input.checked=!Number.isNaN(numericSelection) && numericSelection===optionIndex;
            input.addEventListener('change',()=>{
                handleAnswerChange(question._id,optionIndex);
            });

            const span=document.createElement('span');
            span.textContent=optionText;

            label.appendChild(input);
            label.appendChild(span);
            optionsList.appendChild(label);
        });

        wrapper.appendChild(optionsList);

        const helper=document.createElement('p');
        helper.className='answer-summary';
        helper.textContent='Select one option to record your answer.';
        wrapper.appendChild(helper);
    }

    contentDiv.appendChild(wrapper);
}

function changeQuestion(offset){
    if(!state.questions.length||state.hasSubmitted){
        return;
    }

    const categoryQuestions=getActiveCategoryQuestions();
    if(!categoryQuestions.length){
        return;
    }

    const nextIndex=state.currentQuestionIndex+offset;
    if(nextIndex<0||nextIndex>=categoryQuestions.length){
        return;
    }

    state.currentQuestionIndex=nextIndex;
    const activeCategory=getActiveCategory();
    if(activeCategory){
        state.categoryPositions.set(activeCategory,state.currentQuestionIndex);
    }
    persistProgress();
    renderQuestion();
    updateNavigationState();
    updateProgress();
    updateCounters();
}

async function submitExam(){
    if(!examId||!token||!state.questions.length||state.hasSubmitted||state.isSubmitting){
        return;
    }

    if(!state.examSessionId){
        setStatus('Your exam session could not be verified. Please refresh the page before submitting.','error');
        return;
    }

    if(state.responses.size!==state.questions.length){
        setStatus('Please answer every question before submitting.','error');
        return;
    }

    setStatus('Submitting your answers…','info');
    state.isSubmitting=true;
    updateNavigationState();
    updateSubmitState();

    const responsesPayload=[];
    let invalidPayload=false;

    state.questions.forEach((question)=>{
        const questionType=(question.type||'mcq').toLowerCase();
        const storedValue=state.responses.get(String(question._id));

        if(questionType==='written'){
            const answerText=typeof storedValue==='string'? storedValue.trim():'';
            if(!answerText){
                invalidPayload=true;
                return;
            }
            responsesPayload.push({
                questionId:question._id,
                answerText
            });
            return;
        }

        if(questionType==='code'){
            const codeEntry=getCodeResponseEntry(question._id) || (storedValue && typeof storedValue==='object'?storedValue:null);
            const sourceCode=codeEntry && typeof codeEntry.code==='string'?codeEntry.code:'';
            if(!sourceCode.trim()){
                invalidPayload=true;
                return;
            }

            const preferredLanguageId=Number(codeEntry?.languageId);
            const fallbackLanguageId=Number(question.codeSettings?.languageId);
            const languageId=Number.isInteger(preferredLanguageId) && preferredLanguageId>0
                ? preferredLanguageId
                : (Number.isInteger(fallbackLanguageId) && fallbackLanguageId>0 ? fallbackLanguageId : NaN);

            if(!Number.isInteger(languageId) || languageId<=0){
                invalidPayload=true;
                return;
            }

            const languageLabel=typeof codeEntry?.languageName==='string' && codeEntry.languageName.trim()
                ? codeEntry.languageName.trim()
                : (typeof question.codeSettings?.languageName==='string' ? question.codeSettings.languageName : '');

            responsesPayload.push({
                questionId:question._id,
                code:sourceCode,
                languageId,
                languageName:languageLabel,
                stdin:codeEntry?.lastRunInput || ''
            });
            return;
        }

        const selectedIndex=Number(storedValue);
        if(Number.isNaN(selectedIndex)){
            invalidPayload=true;
            return;
        }

        responsesPayload.push({
            questionId:question._id,
            selectedOptionIndex:selectedIndex
        });
    });

    if(invalidPayload || responsesPayload.length!==state.questions.length){
        state.isSubmitting=false;
        setStatus('Please answer every question before submitting.','error');
        updateNavigationState();
        updateSubmitState();
        return;
    }

    try{
        const response=await fetch('/api/submissions',{
            method:'POST',
            headers:{
                Authorization:`Bearer ${token}`,
                'Content-Type':'application/json'
            },
            body:JSON.stringify({
                examId,
                sessionId:state.examSessionId||undefined,
                responses:responsesPayload
            })
        });

        if(response.status===401){
            localStorage.removeItem('token');
            localStorage.removeItem('currentUser');
            window.location.href='/login';
            return;
        }

        const data=await response.json().catch(()=>({}));

        if(!response.ok){
            const message=data?.message||'Failed to submit your answers.';
            throw new Error(message);
        }

        const totalQuestions=state.questions.length;
        const questionLookup=new Map(
            state.questions.map((question)=>[String(question._id),question])
        );
        const manualReviewCount=Array.isArray(data.answers)
            ? data.answers.reduce((count,answer)=>{
                const rawQuestion=answer?.question;
                const questionId=rawQuestion && typeof rawQuestion==='object' && rawQuestion._id
                    ? rawQuestion._id
                    : rawQuestion;
                const question=questionLookup.get(String(questionId)) || null;
                return answerRequiresManualReviewFlag(answer,question)
                    ? count+1
                    : count;
            },0)
            : 0;

        state.hasSubmitted=true;
        state.examSessionData=null;
        state.examSessionId=null;
        if(PROGRESS_STORAGE_KEY){
            sessionStorage.removeItem(PROGRESS_STORAGE_KEY);
        }
        sessionStorage.removeItem(META_STORAGE_KEY);
        state.submissionResult={
            score:Number.isFinite(data.score)?data.score:null,
            totalQuestions,
            submittedAt:data.submittedAt||data.createdAt||data.updatedAt||new Date().toISOString(),
            manualReviewCount,
            requiresManualReview:manualReviewCount>0
        };
        antiCheatMonitor.stop();
        stopExamTimer({ hide:true });

        const scoreText=Number.isFinite(data.score)
            ?`Score: ${data.score} / ${totalQuestions}`
            :'Submission recorded.';

        setStatus(`Submission successful. ${scoreText}`,'success');
        renderExamCompletionView();
        renderCategoryChips();
        updateNavigationState();
        updateSubmitState();
        updateProgress();
        updateCounters();
        if(submitButton){
            submitButton.textContent='Submitted';
            submitButton.disabled=true;
        }
        if(prevButton)prevButton.disabled=true;
        if(nextButton)nextButton.disabled=true;
    }catch(error){
        console.error('Submission error',error);
        state.isSubmitting=false;
        const message=error.message||'Failed to submit your answers.';
        const alreadySubmitted=message.toLowerCase().includes('already submitted');

        if(alreadySubmitted){
            state.hasSubmitted=true;
            state.examSessionData=null;
            state.examSessionId=null;
            if(PROGRESS_STORAGE_KEY){
                sessionStorage.removeItem(PROGRESS_STORAGE_KEY);
            }
            sessionStorage.removeItem(META_STORAGE_KEY);
            if(!state.submissionResult){
                state.submissionResult={
                    score:null,
                    totalQuestions:state.questions.length,
                    submittedAt:new Date().toISOString(),
                    manualReviewCount:0,
                    requiresManualReview:false,
                    message:'Your earlier submission is already on file.'
                };
            }
            antiCheatMonitor.stop();
            stopExamTimer({ hide:true });
            renderExamCompletionView();
            renderCategoryChips();
            updateNavigationState();
            updateSubmitState();
            updateProgress();
            updateCounters();
            if(submitButton){
                submitButton.textContent='Already submitted';
                submitButton.disabled=true;
            }
            if(prevButton)prevButton.disabled=true;
            if(nextButton)nextButton.disabled=true;
            setStatus('You already submitted this exam.','info');
            return;
        }

        setStatus(message,'error');
        updateNavigationState();
        updateSubmitState();
        return;
    }

    state.isSubmitting=false;
}

function enforceAccessGuards(){
    if(!examId){
        setStatus('No exam selected. Return to your dashboard and choose an exam.','error');
        clearContent('Use your dashboard to pick an exam before starting.');
        if(prevButton)prevButton.disabled=true;
        if(nextButton)nextButton.disabled=true;
        if(submitButton)submitButton.disabled=true;
        if(exitButton){
            exitButton.classList.remove('secondary');
            exitButton.textContent='Back to dashboard';
        }
        state.examSessionData=null;
        state.examSessionId=null;
        stopExamTimer({ hide:true });
        return false;
    }

    if(!token){
        setStatus('Sign in to your account to attempt exams.','error');
        clearContent('You need to be signed in as a student to start this exam.');
        if(submitButton)submitButton.disabled=true;
        setTimeout(()=>{
            window.location.href='/login';
        },1400);
        state.examSessionData=null;
        state.examSessionId=null;
        stopExamTimer({ hide:true });
        return false;
    }

    if(currentUser?.role&&currentUser.role!=='student'){
        setStatus('Only students can attempt exams.','error');
        clearContent('Switch to a student account to begin.');
        if(submitButton)submitButton.disabled=true;
        setTimeout(()=>{
            window.location.href='/dashboard';
        },1600);
        state.examSessionData=null;
        state.examSessionId=null;
        stopExamTimer({ hide:true });
        return false;
    }

    return true;
}

async function loadExam(){
    if(!enforceAccessGuards()){
        return;
    }

    resetExitButton();
    loadStoredMeta();
    setLoading(true);

    try{
        const response=await fetch(`/api/exams/${examId}`,{
            headers:{
                Authorization:`Bearer ${token}`
            }
        });

        if(response.status===401){
            localStorage.removeItem('token');
            localStorage.removeItem('currentUser');
            window.location.href='/login';
            return;
        }

        const data=await response.json().catch(()=>null);

        if(!response.ok){
            const message=data?.message||'Unable to load the selected exam.';
            throw new Error(message);
        }

        state.exam=data;
        state.questions=Array.isArray(data.questions)?data.questions:[];
        state.responses=new Map();
        state.hasSubmitted=false;
        state.isSubmitting=false;
    state.submissionResult=null;

        const sessionInfo=await ensureExamSession();
        if(!sessionInfo || !sessionInfo.id){
            clearContent('We were unable to initialise your exam session. Please refresh or contact support.');
            if(!state.hasSubmitted){
                setStatus('Unable to start your exam session. Please refresh and try again.','error');
            }else{
                setStatus('You have already submitted this exam.','info');
            }
            state.examSessionData=null;
            state.examSessionId=null;
            stopExamTimer({ hide:true });
            updateNavigationState();
            updateSubmitState();
            updateProgress();
            updateCounters();
            return;
        }

        const durationMinutes=Number(data?.durationMinutes);
        const totalDurationMs=Number.isFinite(durationMinutes) && durationMinutes>0
            ? durationMinutes*60000
            : 0;
        const sessionStart= sessionInfo.startedAt
            ? new Date(sessionInfo.startedAt)
            : new Date();

        if(totalDurationMs>0){
            startExamTimer(sessionStart,totalDurationMs);
        }else{
            stopExamTimer({ hide:true });
        }

        antiCheatMonitor.start({ examId:data?._id || examId, sessionId:sessionInfo.id });
        prepareCategoryStructures();
        updateHeader(data);

        if(!state.questions.length){
            stopExamTimer();
            clearContent('This exam has not been populated with questions yet.');
            setStatus('This exam is not ready yet. Please contact your instructor.','error');
            updateNavigationState();
            updateSubmitState();
            updateProgress();
            updateCounters();
            renderCategoryChips();
            return;
        }

        restoreProgress();
        renderCategoryChips();
        renderQuestion();
        updateNavigationState();
        updateSubmitState();
        updateProgress();
        updateCounters();
        setStatus('Answer every question, then submit to record your attempt.','info');
    }catch(error){
        console.error('Failed to load exam',error);
        const message=error.message||'Unable to load this exam.';
        if(message.toLowerCase().includes('already submitted')){
            state.hasSubmitted=true;
            if(PROGRESS_STORAGE_KEY){
                sessionStorage.removeItem(PROGRESS_STORAGE_KEY);
            }
            sessionStorage.removeItem(META_STORAGE_KEY);
        }
        state.examSessionData=null;
        state.examSessionId=null;
        antiCheatMonitor.stop();
        stopExamTimer({ hide:true });
        clearContent(message);
        setStatus(message,'error');
        if(submitButton)submitButton.disabled=true;
        if(prevButton)prevButton.disabled=true;
        if(nextButton)nextButton.disabled=true;
    }
}

if(prevButton){
    prevButton.addEventListener('click',()=>{
        changeQuestion(-1);
    });
}

if(nextButton){
    nextButton.addEventListener('click',()=>{
        changeQuestion(1);
    });
}

if(submitButton){
    submitButton.addEventListener('click',(event)=>{
        event.preventDefault();
        submitExam();
    });
}

if(tabWarningDismiss){
    tabWarningDismiss.addEventListener('click',()=>{
        hideTabWarning();
    });
}

if(tabWarningModal){
    tabWarningModal.addEventListener('click',(event)=>{
        if(event.target===tabWarningModal){
            hideTabWarning();
        }
    });
}

window.addEventListener('keydown',(event)=>{
    if(event.key==='Escape' && state.tabWarning.active){
        hideTabWarning();
    }
});

if(exitButton){
    exitButton.addEventListener('click',(event)=>{
        event.preventDefault();
        antiCheatMonitor.stop();
        stopExamTimer({ hide:true });
        state.examSessionData=null;
        state.examSessionId=null;
        window.location.href='/dashboard-student';
    });
}

window.addEventListener('beforeunload',(event)=>{
    if(state.hasSubmitted||state.responses.size===0){
        return;
    }
    event.preventDefault();
    event.returnValue='';
});

window.addEventListener('unload',()=>{
    antiCheatMonitor.stop();
    stopExamTimer({ hide:true });
    hideTabWarning();
    state.examSessionData=null;
    state.examSessionId=null;
});

loadExam();
