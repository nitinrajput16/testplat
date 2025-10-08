#!/usr/bin/env node

const path=require('path');
const mongoose=require('mongoose');
const dotenv=require('dotenv');

dotenv.config({ path:path.resolve(__dirname,'..','.env') });

const { repairQuestionCorrectOptions }=require('../src/utils/repairQuestionCorrectOptions');

async function run(){
    const uri=process.env.MONGODB_URI;
    if(!uri){
        throw new Error('MONGODB_URI is not defined.');
    }

    await mongoose.connect(uri,{
        autoIndex:false,
        maxPoolSize:5
    });

    const result=await repairQuestionCorrectOptions();

    console.log(`Updated ${result.updatedCount} question(s) with corrected option indexes.`);

    if(result.invalidTargets.length){
        console.warn('Some questions could not be updated due to invalid mappings:');
        result.invalidTargets.forEach((item)=>{
            console.warn('-',item.text);
            console.warn('  Options:',item.options);
            console.warn('  Expected correct option:',item.expectedIndex);
        });
    }

    if(result.unmapped.length){
        console.log('Questions without correction mapping:',result.unmapped);
    }

    await mongoose.disconnect();
}

run().catch(async (error)=>{
    console.error('Failed to fix option indexes:',error);
    try{
        await mongoose.disconnect();
    }catch(innerError){
        // ignore
    }
    process.exit(1);
});
