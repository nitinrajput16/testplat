const asyncHandler=require('../utils/asyncHandler');
const { runJudge0Submission }=require('../utils/judge0Client');

const runCode=asyncHandler(async (req,res)=>{
    const body=req.body||{};
    const sourceCode=typeof body.source==='string'
        ? body.source
        : (typeof body.source_code==='string'?body.source_code:'');

    const rawLanguageId=typeof body.languageId!=='undefined'
        ? body.languageId
        : body.language_id;
    const languageId=Number(rawLanguageId);

    if(!sourceCode || !sourceCode.trim()){
        return res.status(400).json({ message:'Source code is required.' });
    }

    if(!Number.isInteger(languageId) || languageId<=0){
        return res.status(400).json({ message:'Select a valid programming language.' });
    }

    const stdin=typeof body.stdin==='string'?body.stdin:'';
    const expectedOutput=typeof body.expectedOutput==='string'
        ? body.expectedOutput
        : (typeof body.expected_output==='string'?body.expected_output:'');

    const cpuTimeLimitRaw=Number(body.cpuTimeLimit ?? body.cpu_time_limit);
    const memoryLimitRaw=Number(body.memoryLimit ?? body.memory_limit);

    const cpuTimeLimit=Number.isFinite(cpuTimeLimitRaw)&&cpuTimeLimitRaw>0
        ? Math.min(cpuTimeLimitRaw,20)
        : 5;
    const memoryLimit=Number.isFinite(memoryLimitRaw)&&memoryLimitRaw>=64000
        ? Math.min(memoryLimitRaw,512000)
        : 128000;

    try{
        const result=await runJudge0Submission({
            sourceCode,
            languageId,
            stdin,
            expectedOutput,
            cpuTimeLimit,
            memoryLimit
        });
        res.json(result);
    }catch(error){
        const upstreamStatus=Number.isFinite(error.status)?error.status:null;
        let status=upstreamStatus||502;
        let message=error.message||'Judge0 request failed.';

        if(upstreamStatus===401||upstreamStatus===403){
            status=502;
            message='Code execution service rejected the request. Contact your administrator to review Judge0 credentials.';
        }

        res.status(status).json({
            message,
            details:error.details||null,
            upstreamStatus
        });
    }
});

module.exports={
    runCode
};
