const { WebSocketServer, WebSocket }=require('ws');
const jwt=require('jsonwebtoken');
const config=require('../config/config');
const User=require('../models/User');
const ExamActivityLog=require('../models/ExamActivityLog');
const Exam=require('../models/Exam');
const ExamSession=require('../models/ExamSession');

function safeToString(value){
    if(!value){
        return '';
    }
    if(typeof value==='string'){
        return value;
    }
    if(value instanceof Date){
        return value.toISOString();
    }
    if(typeof value.toString==='function'){
        const result=value.toString();
        if(result && result!=='[object Object]'){
            return result;
        }
    }
    return '';
}

function normaliseObjectId(value){
    if(!value){
        return null;
    }
    if(typeof value==='string'){
        return value;
    }
    if(typeof value==='object' && value!==null){
        if(value._id){
            return normaliseObjectId(value._id);
        }
    }
    return null;
}

function initialiseAntiCheatGateway(server){
    const wss=new WebSocketServer({ server, path:'/ws/anti-cheat' });

    wss.on('connection',(socket,request)=>{
        (async ()=>{
            const requestUrl=new URL(request.url,`http://${request.headers.host}`);
            const token=requestUrl.searchParams.get('token');
            const examIdParam=requestUrl.searchParams.get('examId');
            const sessionIdParam=requestUrl.searchParams.get('sessionId');
            const forwardedFor=request.headers['x-forwarded-for'];
            const ipAddress=Array.isArray(forwardedFor)
                ? forwardedFor[0]
                : ((forwardedFor||'').split(',')[0]||request.socket?.remoteAddress||'');

            if(!token){
                socket.close(1008,'Authentication required');
                return;
            }

            let decoded;
            try{
                decoded=jwt.verify(token,config.JWT_SECRET);
            }catch(error){
                socket.close(1008,'Invalid token');
                return;
            }

            const user=await User.findById(decoded.id).select('_id role isActive');
            if(!user || user.role!=='student' || user.isActive===false){
                socket.close(1008,'Unauthorized');
                return;
            }

            let verifiedExamId=null;
            if(examIdParam){
                const exam=await Exam.findById(examIdParam).select('_id');
                if(exam){
                    verifiedExamId=exam._id.toString();
                }
            }

            if(!sessionIdParam){
                socket.close(1008,'Session required');
                return;
            }

            const session=await ExamSession.findById(sessionIdParam).select('_id exam student status metadata');
            if(!session){
                socket.close(1008,'Invalid session');
                return;
            }

            if(!session.student.equals(user._id)){
                socket.close(1008,'Session mismatch');
                return;
            }

            if(session.status!=='active'){
                socket.close(1008,'Session no longer active');
                return;
            }

            const sessionExamId=session.exam?.toString?.()||null;
            if(sessionExamId){
                if(verifiedExamId && verifiedExamId!==sessionExamId){
                    socket.close(1008,'Session exam mismatch');
                    return;
                }
                verifiedExamId=sessionExamId;
            }

            socket.context={
                userId:user._id,
                examId:verifiedExamId,
                sessionId:session._id,
                userAgent:safeToString(request.headers['user-agent']),
                ipAddress
            };

            const updatePayload={};
            if(!session.metadata?.userAgent && socket.context.userAgent){
                updatePayload['metadata.userAgent']=socket.context.userAgent;
            }
            if(!session.metadata?.ipAddress && ipAddress){
                updatePayload['metadata.ipAddress']=ipAddress;
            }
            updatePayload['metadata.additional.lastSocketConnectedAt']=new Date();

            if(Object.keys(updatePayload).length){
                await ExamSession.findByIdAndUpdate(session._id,{ $set:updatePayload }).catch(()=>{});
            }

            if(socket.readyState===WebSocket.OPEN){
                socket.send(JSON.stringify({ type:'ready' }));
            }

            socket.on('message',async (rawMessage)=>{
                if(!socket.context.sessionId){
                    return;
                }

                let payload;
                try{
                    payload=JSON.parse(rawMessage);
                }catch(error){
                    return;
                }

                if(!payload || payload.type!=='event'){
                    return;
                }

                const eventType=typeof payload.eventType==='string'?payload.eventType.trim():'';
                if(!eventType){
                    return;
                }

                const details=(payload.details && typeof payload.details==='object')
                    ? payload.details
                    : {};

                const eventExamId=normaliseObjectId(payload.examId) || socket.context.examId;
                const parsedTimestamp=payload.timestamp? new Date(payload.timestamp):new Date();
                const occurredAt=Number.isNaN(parsedTimestamp.getTime())? new Date():parsedTimestamp;

                try{
                    console.log('Anti-cheat event',{
                        user:socket.context.userId?.toString?.(),
                        exam:eventExamId,
                        eventType,
                        timestamp:occurredAt.toISOString()
                    });
                    await ExamSession.findByIdAndUpdate(socket.context.sessionId,{
                        $push:{
                            events:{
                                eventType,
                                details,
                                occurredAt
                            }
                        },
                        $set:{
                            'metadata.additional.lastEventAt':occurredAt
                        }
                    });
                    await ExamActivityLog.create({
                        exam:eventExamId || undefined,
                        session:socket.context.sessionId,
                        student:socket.context.userId,
                        eventType,
                        details,
                        userAgent:socket.context.userAgent,
                        occurredAt
                    });
                }catch(error){
                    console.error('Failed to persist anti-cheat event',error);
                }
            });
        })().catch((error)=>{
            console.error('Failed to initialise anti-cheat socket',error);
            if(socket.readyState===WebSocket.OPEN || socket.readyState===WebSocket.CONNECTING){
                socket.close(1011,'Server error');
            }
        });
    });

    return wss;
}

module.exports={ initialiseAntiCheatGateway };
