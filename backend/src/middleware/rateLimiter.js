const rateLimit=require('express-rate-limit');

const FIFTEEN_MINUTES_IN_MS=15*60*1000;
const ONE_MINUTE_IN_MS=60*1000;

const loginRateLimiter=rateLimit({
    windowMs:FIFTEEN_MINUTES_IN_MS,
    max:5,
    standardHeaders:'draft-7',
    legacyHeaders:false,
    message:{ message:'Too many login attempts. Please try again after 15 minutes.' },
    handler:(_req,res,_next,options)=>{
        const statusCode=options.statusCode||429;
        res.status(statusCode).json(options.message);
    }
});

const apiRateLimiter=rateLimit({
    windowMs:ONE_MINUTE_IN_MS,
    max:300,
    standardHeaders:'draft-7',
    legacyHeaders:false
});

module.exports={
    loginRateLimiter,
    apiRateLimiter
};
