const mongoose=require('mongoose');

const teacherRequestSchema=new mongoose.Schema({
    user:{ type:mongoose.Schema.Types.ObjectId, ref:'User', required:true },
    message:{ type:String, default:'' },
    status:{ type:String, enum:['pending','approved','rejected'], default:'pending' },
    processedBy:{ type:mongoose.Schema.Types.ObjectId, ref:'User', default:null },
    processedAt:{ type:Date }
},{ timestamps:true });

module.exports=mongoose.model('TeacherRequest',teacherRequestSchema);
