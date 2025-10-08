const config=require('../config/config');

function notFoundHandler(req,res,next){
    const error=new Error(`Not Found - ${req.originalUrl}`);
    error.status=404;
    next(error);
}

function errorHandler(err,req,res,next){
    const status=err.status||err.statusCode||500;
    const response={
        message:err.message||'Internal Server Error'
    };

    if(config.NODE_ENV!=='production' && err.stack){
        response.stack=err.stack;
    }

    res.status(status).json(response);
}

module.exports={
    notFoundHandler,
    errorHandler
};
