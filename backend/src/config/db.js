const mongoose=require('mongoose');
const config=require('./config');

mongoose.set('strictQuery',true);

async function connectDB(){
    if(!config.MONGODB_URI){
        throw new Error('MONGODB_URI is not defined.');
    }

    await mongoose.connect(config.MONGODB_URI);
    console.log('MongoDB connected');
    return mongoose.connection;
}

module.exports={ connectDB };
