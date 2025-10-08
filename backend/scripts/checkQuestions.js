const mongoose=require('mongoose');
const path=require('path');
const dotenv=require('dotenv');

dotenv.config({ path:path.resolve(__dirname,'..','.env') });

const Question=require('../src/models/Question');
const Exam=require('../src/models/Exam');

async function run(){
    try{
        const uri=process.env.MONGODB_URI;
        if(!uri){
            throw new Error('MONGODB_URI is not defined.');
        }
        await mongoose.connect(uri,{
            autoIndex:false,
            maxPoolSize:5
        });

        const exams=await Exam.find().select('_id title questions').lean();
        for(const exam of exams){
            console.log(`Exam: ${exam.title} (${exam._id})`);
            const questions=await Question.find({ exam:exam._id }).lean();
            for(const question of questions){
                const options=(question.options||[]).map((option)=>option.text||option);
                const correctOption=Number.isInteger(question.correctOptionIndex)
                    ? options[question.correctOptionIndex]
                    : null;
                console.log('  Question:',question.text);
                console.log('  Options:',options);
                console.log('  Correct index:',question.correctOptionIndex,'=>',correctOption);
            }
        }
    }catch(error){
        console.error('Failed to inspect questions:',error);
    }finally{
        await mongoose.disconnect();
    }
}

run();