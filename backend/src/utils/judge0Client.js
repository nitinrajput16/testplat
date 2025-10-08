const fetch=require('node-fetch');

const DEFAULT_HOST='judge0-ce.p.rapidapi.com';

function resolveConfig(){
    const explicitBase=(process.env.JUDGE0_BASE_URL || process.env.JUDGE0_API_URL || '').trim();
    const explicitHost=(process.env.JUDGE0_API_HOST || process.env.JUDGE0_HOST || '').trim();

    let baseUrl=explicitBase ? explicitBase.replace(/\/$/,'') : '';
    let host=explicitHost;

    if(!host && baseUrl){
        try{
            host=new URL(baseUrl).host;
        }catch(_error){
            host=baseUrl.replace(/^https?:\/\//,'').split('/')[0];
        }
    }

    if(!baseUrl){
        const resolvedHost=host || DEFAULT_HOST;
        baseUrl=`https://${resolvedHost}`;
    }

    if(!host){
        try{
            host=new URL(baseUrl).host;
        }catch(_error){
            host=DEFAULT_HOST;
        }
    }

    return {
        baseUrl:baseUrl.replace(/\/$/,''),
        host
    };
}

function buildHeaders(){
    const headers={ 'Content-Type':'application/json' };
    const apiKey=(process.env.JUDGE0_API_KEY || process.env.RAPIDAPI_KEY || '').trim();
    const overrideHost=(process.env.JUDGE0_RAPIDAPI_HOST || process.env.RAPIDAPI_HOST || '').trim();
    const { host }=resolveConfig();

    if(apiKey){
        headers['X-RapidAPI-Key']=apiKey;
        if(overrideHost){
            headers['X-RapidAPI-Host']=overrideHost;
        }else if(host){
            headers['X-RapidAPI-Host']=host;
        }
    }

    return headers;
}

function getBaseUrl(){
    return resolveConfig().baseUrl;
}

function isJudge0Configured(){
    const { baseUrl, host }=resolveConfig();
    if(!baseUrl){
        return false;
    }

    const apiKey=(process.env.JUDGE0_API_KEY || process.env.RAPIDAPI_KEY || '').trim();
    const isRapidApiHost=typeof host==='string' && host.includes('rapidapi.com');

    if(isRapidApiHost && !apiKey){
        return false;
    }

    return true;
}

const SUBMISSION_ENDPOINT='submissions?base64_encoded=true&wait=true';

function encode(value){
    if(typeof value!=='string' || value.length===0){
        return value||'';
    }
    return Buffer.from(value,'utf8').toString('base64');
}

function isProbablyBase64(value){
    if(typeof value!=='string'){
        return false;
    }

    const sanitized=value.replace(/\s+/g,'');
    if(!sanitized || sanitized.length%4!==0){
        return false;
    }

    if(/[^A-Za-z0-9+/=]/.test(sanitized)){
        return false;
    }

    return true;
}

function decode(value){
    if(typeof value!=='string' || value.length===0){
        return value||'';
    }

    if(!isProbablyBase64(value)){
        return value;
    }

    try{
        const buffer=Buffer.from(value,'base64');

        const reencoded=buffer.toString('base64').replace(/=+$/,'');
        const normalized=value.replace(/\s+/g,'').replace(/=+$/,'');

        if(reencoded!==normalized){
            return value;
        }

        return buffer.toString('utf8');
    }catch(error){
        return value;
    }
}

function decodePayload(data){
    if(!data || typeof data!=='object'){
        return data;
    }

    const decoded={ ...data };

    ['stdout','stderr','compile_output','message','stdin','source_code','expected_output']
        .forEach((field)=>{
            if(typeof decoded[field]==='string'){
                decoded[field]=decode(decoded[field]);
            }
        });

    return decoded;
}

async function runJudge0Submission({
    sourceCode,
    languageId,
    stdin='',
    expectedOutput='',
    cpuTimeLimit=5,
    memoryLimit=128000
}){
    if(!sourceCode || !languageId){
        const error=new Error('Judge0 submission requires source code and language id.');
        error.status=400;
        throw error;
    }

    const baseUrl=getBaseUrl();
    const url=`${baseUrl}/${SUBMISSION_ENDPOINT}`;

    const body={
        source_code:encode(sourceCode),
        language_id:languageId,
        stdin:encode(stdin || ''),
        expected_output:encode(expectedOutput || ''),
        cpu_time_limit:cpuTimeLimit,
        wall_time_limit:cpuTimeLimit*2,
        memory_limit:memoryLimit
    };

    const response=await fetch(url,{
        method:'POST',
        headers:buildHeaders(),
        body:JSON.stringify(body)
    });

    const rawData=await response.json().catch(()=>null);
    const data=decodePayload(rawData);

    if(!response.ok){
        const message=(data && (data.error||data.message))||`Judge0 request failed with status ${response.status}`;
        const error=new Error(message);
        error.status=response.status;
        error.details=data;
        throw error;
    }

    return data;
}

module.exports={
    runJudge0Submission,
    isJudge0Configured
};
