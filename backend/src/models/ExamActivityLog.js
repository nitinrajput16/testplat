const mongoose=require('mongoose');

const examActivityLogSchema=new mongoose.Schema({
    exam:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'Exam'
    },
    session:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'ExamSession'
    },
    student:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    eventType:{
        type:String,
        required:true,
        trim:true
    },
    details:{
        type:mongoose.Schema.Types.Mixed,
        default:()=>({})
    },
    userAgent:{
        type:String,
        default:''
    },
    occurredAt:{
        type:Date,
        default:()=>new Date()
    }
},{
    timestamps:true
});

examActivityLogSchema.index({ exam:1, student:1, occurredAt:-1 });
examActivityLogSchema.index({ session:1, occurredAt:-1 });
examActivityLogSchema.index({ student:1, occurredAt:-1 });
examActivityLogSchema.index({ eventType:1, occurredAt:-1 });

module.exports=mongoose.model('ExamActivityLog',examActivityLogSchema);
