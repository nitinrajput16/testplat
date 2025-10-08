const mongoose=require('mongoose');

const answerSnapshotSchema=new mongoose.Schema({
    question:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'Question'
    },
    answerType:{
        type:String,
        trim:true
    },
    answerData:{
        type:mongoose.Schema.Types.Mixed,
        default:()=>({})
    },
    recordedAt:{
        type:Date,
        default:()=>new Date()
    }
},{ _id:false });

const eventSchema=new mongoose.Schema({
    eventType:{
        type:String,
        required:true,
        trim:true
    },
    details:{
        type:mongoose.Schema.Types.Mixed,
        default:()=>({})
    },
    occurredAt:{
        type:Date,
        default:()=>new Date()
    }
},{ _id:false });

const examSessionSchema=new mongoose.Schema({
    exam:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'Exam',
        required:true
    },
    student:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    submission:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'Submission'
    },
    status:{
        type:String,
        enum:['active','submitted','abandoned'],
        default:'active'
    },
    startedAt:{
        type:Date,
        default:()=>new Date()
    },
    endedAt:{
        type:Date,
        default:null
    },
    responses:{
        type:[answerSnapshotSchema],
        default:[]
    },
    events:{
        type:[eventSchema],
        default:[]
    },
    metadata:{
        userAgent:{
            type:String,
            default:''
        },
        ipAddress:{
            type:String,
            default:''
        },
        additional:{
            type:mongoose.Schema.Types.Mixed,
            default:()=>({})
        }
    },
    finalScore:{
        type:Number,
        default:null
    }
},{
    timestamps:true
});

examSessionSchema.index({ exam:1, student:1, status:1 });
examSessionSchema.index({ student:1, startedAt:-1 });
examSessionSchema.index({ submission:1 });

module.exports=mongoose.model('ExamSession',examSessionSchema);
