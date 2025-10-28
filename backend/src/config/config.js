const path = require('path');
const dotenv = require('dotenv');

// choose env file: .env.test when running tests, otherwise .env
const envFileName = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
const fs = require('fs');

// prefer project root .env but also accept backend/.env so local backend editing works
const candidates = [
    path.resolve(process.cwd(), envFileName),
    path.resolve(__dirname, '../../', envFileName)
];

let loaded = false;
for(const p of candidates){
    try{
        if(fs.existsSync(p)){
            dotenv.config({ path: p });
            loaded = true;
            break;
        }
    }catch(e){ /* ignore */ }
}

if(!loaded){
    // fallback to default behavior
    dotenv.config({ path: path.resolve(process.cwd(), envFileName) });
}

function parseBool(v){
    if(typeof v === 'boolean') return v;
    if(!v && v !== 0) return false;
    return String(v).toLowerCase() === 'true' || String(v) === '1' || String(v).toLowerCase() === 'yes';
}

function parsePort(v){
    if(!v && v !== 0) return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
}

function normalizeUrl(u){
    if(!u) return '';
    let s = String(u).trim();
    if(s.endsWith('/')) s = s.slice(0, -1);
    return s;
}

const config = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parsePort(process.env.PORT) || 5000,
    MONGODB_URI: process.env.MONGODB_URI || '',
    JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    DEFAULT_ADMIN_NAME: process.env.DEFAULT_ADMIN_NAME || 'Administrator',
    DEFAULT_ADMIN_EMAIL: (process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com').toLowerCase(),
    DEFAULT_ADMIN_PASSWORD: process.env.DEFAULT_ADMIN_PASSWORD || '',
    DEFAULT_ADMIN_FORCE_RESET: parseBool(process.env.DEFAULT_ADMIN_FORCE_RESET)
};

// Optional SMTP settings (use environment variables to configure)
config.SMTP_HOST = process.env.SMTP_HOST || '';
config.SMTP_PORT = parsePort(process.env.SMTP_PORT) || undefined;
config.SMTP_SECURE = parseBool(process.env.SMTP_SECURE);
config.SMTP_USER = process.env.SMTP_USER || '';
config.SMTP_PASS = process.env.SMTP_PASS || '';
// From address to use when sending emails: env SMTP_FROM -> SMTP_USER -> DEFAULT_ADMIN_EMAIL
config.SMTP_FROM = process.env.SMTP_FROM || config.SMTP_USER || config.DEFAULT_ADMIN_EMAIL;
// General mail-from env (preferred) - fall back to SMTP_FROM and DEFAULT_ADMIN_EMAIL
config.MAIL_FROM = process.env.MAIL_FROM || config.SMTP_FROM || config.DEFAULT_ADMIN_EMAIL;
// Optional display name for the sender
config.MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || '';
// If true, only use API providers (Brevo/SendGrid) and do not attempt SMTP
config.EMAIL_API_ONLY = parseBool(process.env.EMAIL_API_ONLY);
// Convenience flag to indicate SMTP is properly configured
config.SMTP_ENABLED = Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS && config.SMTP_PORT);

// Decide frontend base URL:
// 1) explicit FRONTEND_BASE_URL env
// 2) Render's automatically provided RENDER_EXTERNAL_URL (when deployed on Render)
// 3) fallback to localhost for non-production
const rawFrontend = process.env.FRONTEND_BASE_URL || process.env.RENDER_EXTERNAL_URL || '';
config.FRONTEND_BASE_URL = normalizeUrl(rawFrontend) || (config.NODE_ENV === 'production' ? '' : `http://localhost:${config.PORT}`);

module.exports = config;
