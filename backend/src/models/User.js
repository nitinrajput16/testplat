const mongoose=require('mongoose');
const bcrypt=require('bcryptjs');

const ROLES=['admin','instructor','student'];

const userSchema=new mongoose.Schema({
    name:{
        type:String,
        required:true,
        trim:true
    },
    email:{
        type:String,
        required:true,
        unique:true,
        lowercase:true,
        trim:true
    },
    password:{
        type:String,
        required:true,
        minlength:8
    },
    role:{
        type:String,
        enum:ROLES,
        default:'student'
    },
    isActive:{
        type:Boolean,
        default:true
    },
    organizations:{
        type:[{
            type:mongoose.Schema.Types.ObjectId,
            ref:'Organization'
        }],
        default:[]
    }
},{
    timestamps:true
});

userSchema.pre('save',async function(next){
    if(!this.isModified('password')){
        return next();
    }

    try{
        const salt=await bcrypt.genSalt(12);
        this.password=await bcrypt.hash(this.password,salt);
        next();
    }catch(error){
        next(error);
    }
});

userSchema.methods.comparePassword=function(candidatePassword){
    return bcrypt.compare(candidatePassword,this.password);
};

userSchema.methods.toJSON=function(){
    const userObject=this.toObject();
    delete userObject.password;
    return userObject;
};

module.exports=mongoose.model('User',userSchema);
module.exports.ROLES=ROLES;
