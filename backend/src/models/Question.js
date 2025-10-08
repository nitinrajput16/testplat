const mongoose=require('mongoose');

const optionSchema=new mongoose.Schema({
    text:{
        type:String,
        required:true,
        trim:true
    }
},{
    _id:false
});

const codeTestCaseSchema=new mongoose.Schema({
    input:{
        type:String,
        default:''
    },
    expectedOutput:{
        type:String,
        default:'',
        required:true
    },
    isPublic:{
        type:Boolean,
        default:false
    }
},{
    _id:false
});

const codeSettingsSchema=new mongoose.Schema({
    languageId:{
        type:Number,
        required:true
    },
    languageName:{
        type:String,
        trim:true,
        default:''
    },
    starterCode:{
        type:String,
        default:''
    },
    timeLimit:{
        type:Number,
        default:5,
        min:1
    },
    memoryLimit:{
        type:Number,
        default:128000,
        min:64000
    },
    testCases:{
        type:[codeTestCaseSchema],
        validate:{
            validator:function(value){
                if(!value||!Array.isArray(value)){
                    return false;
                }
                return value.length>0 && value.every((test)=>typeof test.expectedOutput==='string');
            },
            message:'Provide at least one valid test case with an expected output.'
        }
    }
},{
    _id:false
});

const QUESTION_TYPES=['mcq','written','code'];

const questionSchema=new mongoose.Schema({
    exam:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'Exam',
        required:true
    },
    text:{
        type:String,
        required:true,
        trim:true
    },
    category:{
        type:String,
        trim:true,
        default:'General'
    },
    type:{
        type:String,
        enum:QUESTION_TYPES,
        default:'mcq'
    },
    options:{
        type:[optionSchema],
        default:[],
        validate:{
            validator:function(value){
                if(this.type==='mcq'){
                    return Array.isArray(value)&&value.length>=2;
                }
                return true;
            },
            message:'A multiple-choice question must have at least two options.'
        }
    },
    correctOptionIndex:{
        type:Number,
        default:null,
        min:0,
        validate:{
            validator:function(value){
                if(this.type!=='mcq'){
                    return value===null || typeof value==='undefined';
                }
                return Number.isInteger(value) && value>=0 && value<(this.options?.length||0);
            },
            message:'The correct option index must reference an existing option.'
        }
    },
    expectedAnswer:{
        type:String,
        trim:true,
        default:''
    },
    codeSettings:{
        type:codeSettingsSchema,
        required:function(){
            return this.type==='code';
        }
    }
},{
    timestamps:true
});

questionSchema.methods.requiresManualGrading=function(){
    if(this.type==='written'){
        return !this.expectedAnswer || !this.expectedAnswer.trim();
    }
    if(this.type==='code'){
        return false;
    }
    return false;
};

questionSchema.methods.isCorrect=function(response){
    if(this.type==='written'){
        const expected=(this.expectedAnswer||'').trim();
        if(!expected){
            return null;
        }
        if(typeof response!=='string'){
            return false;
        }
        return response.trim().toLowerCase()===expected.toLowerCase();
    }

    if(this.type==='code'){
        return null;
    }

    return Number(response)===this.correctOptionIndex;
};

module.exports=mongoose.model('Question',questionSchema);
