const path=require('path');
const dotenv=require('dotenv');

const envFile=process.env.NODE_ENV==='test'?'.env.test':'.env';
dotenv.config({ path:path.resolve(process.cwd(), envFile) });

const config={
    NODE_ENV:process.env.NODE_ENV||'development',
    PORT:Number(process.env.PORT||5000),
    MONGODB_URI:process.env.MONGODB_URI,
    JWT_SECRET:process.env.JWT_SECRET||'dev-secret-change-me',
    JWT_EXPIRES_IN:process.env.JWT_EXPIRES_IN||'7d',
    DEFAULT_ADMIN_NAME:process.env.DEFAULT_ADMIN_NAME||'Super Admin',
    DEFAULT_ADMIN_EMAIL:(process.env.DEFAULT_ADMIN_EMAIL||'admin@example.com').toLowerCase(),
    DEFAULT_ADMIN_PASSWORD:process.env.DEFAULT_ADMIN_PASSWORD||'',
    DEFAULT_ADMIN_FORCE_RESET:process.env.DEFAULT_ADMIN_FORCE_RESET==='true'
};

module.exports=config;
