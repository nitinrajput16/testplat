const app=require('./app');
const config=require('./config/config');
const { connectDB }=require('./config/db');
const { ensureDefaultAdmin }=require('./utils/ensureDefaultAdmin');
const { repairQuestionCorrectOptions }=require('./utils/repairQuestionCorrectOptions');
const { initialiseAntiCheatGateway }=require('./ws/antiCheatGateway');

async function start(){
    try{
        await connectDB();
        await ensureDefaultAdmin();
        if(process.env.AUTO_FIX_CORRECT_OPTIONS!=="false"){
            const { updatedCount }=await repairQuestionCorrectOptions();
            if(updatedCount>0){
                console.log(`Fixed ${updatedCount} question${updatedCount===1?'':'s'} with corrected answer indexes on startup.`);
            }
        }

        const server=app.listen(config.PORT,()=>{
            console.log(`Server is running on http://localhost:${config.PORT}`);
        });

        initialiseAntiCheatGateway(server);

        process.on('SIGTERM',()=>{
            server.close(()=>process.exit(0));
        });
        process.on('SIGINT',()=>{
            server.close(()=>process.exit(0));
        });
    }catch(error){
        console.error('Failed to start server:',error);
        process.exit(1);
    }
}

start();
