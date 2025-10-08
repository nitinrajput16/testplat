const mongoose=require('mongoose');

const organizationSchema=new mongoose.Schema({
    name:{
        type:String,
        required:true,
        trim:true,
        unique:true
    },
    description:{
        type:String,
        trim:true,
        default:''
    },
    createdBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    teachers:{
        type:[{
            type:mongoose.Schema.Types.ObjectId,
            ref:'User'
        }],
        default:[]
    }
},{
    timestamps:true
});

module.exports=mongoose.model('Organization',organizationSchema);
