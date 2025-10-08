const Question=require('../models/Question');

const normalizeText=(text='')=>text
    .toLowerCase()
    .replace(/\s+/g,' ')
    .replace(/[“”]/g,'"')
    .trim();

const CORRECTION_MAP=new Map([
    ['which of the following is not a sql command?',4],
    ['what does oop stand for?',1],
    ['which device is used to connect a computer to a network?',2],
    ['which of the following is a preemptive cpu scheduling algorithm?',3],
    ['which of the following is not a programming language?',1],
    ['which type of inheritance is not supported in java?',2],
    ['which port is used by https?',3],
    ['which concept allows hiding internal details in oop?',3],
    ['which data structure uses fifo principle?',2],
    ['which sql clause is used to sort the result set?',2],
    ['which os manages memory',3],
    ['which of these is a relational database?',2],
    ['which of the following is a dynamic data structure?',4],
    ['which layer of osi model deals with physical transmission?',4],
    ['which sorting algorithm repeatedly swaps adjacent elements?',3],
    ['which of these is used for email transfer?',1],
    ['which principle allows objects to take many forms?',2],
    ['which memory is non-volatile?',3],
    ['which keyword is used to define a class in c++?',2],
    ['which data structure is used in recursion?',1],
    ['which normal form removes partial dependency',2],
    ['which command is used to remove all rows from a table but keep its structure',3],
    ['which sql function is used to count rows',1],
    ['which of the following is not a type of database',4],
    ['which keyword is used to create an object in java',2],
    ['which of the following supports operator overloading',2],
    ['which concept is also known as data hiding',2],
    ['which of the following is an example of polymorphism',1],
    ['which protocol is connectionless',2],
        ['which device operates at the data link layer',4],
    ['which address is used to identify a device in a network',2],
    ['which layer is responsible for end to end delivery',3],
    ['which algorithm is non preemptive',4],
    ['which memory is directly accessible by cpu',1],
    ['which of the following is not a type of os',4],
    ['which technique allows multiple processes to share cpu time',3],
    ['which of the following is not a compiled language',4],
    ['which searching algorithm works only on sorted arrays',1],
    ['which data structure is used in bfs',2],
    ['which sorting algorithm uses divide and conquer',1]
].map(([text,index])=>[normalizeText(text),index]));

async function repairQuestionCorrectOptions({ examIds }={}){
    const query={};
    if(Array.isArray(examIds) && examIds.length){
        query.exam={ $in:examIds };
    }

    const questions=await Question.find(query);

    let updatedCount=0;
    const unmapped=new Map();
    const invalidTargets=[];

    for(const question of questions){
        const normalized=normalizeText(question.text||'');
        if(!normalized){
            continue;
        }

        if(!CORRECTION_MAP.has(normalized)){
            if(!unmapped.has(normalized)){
                unmapped.set(normalized,question.text);
            }
            continue;
        }

        const targetIndex=CORRECTION_MAP.get(normalized);
        const zeroBasedIndex=targetIndex-1;
        const optionCount=Array.isArray(question.options)? question.options.length:0;

        if(zeroBasedIndex<0 || zeroBasedIndex>=optionCount){
            invalidTargets.push({
                text:question.text,
                options:(question.options||[]).map((option)=>option?.text||option),
                expectedIndex:targetIndex
            });
            continue;
        }

        if(question.correctOptionIndex!==zeroBasedIndex){
            question.correctOptionIndex=zeroBasedIndex;
            await question.save();
            updatedCount+=1;
        }
    }

    return {
        updatedCount,
        unmapped:Array.from(unmapped.values()),
        invalidTargets
    };
}

module.exports={
    repairQuestionCorrectOptions
};
