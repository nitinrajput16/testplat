const nodemailer = require('nodemailer');
const config = require('../config/config');

let transporter = null;
let transporterReady = false;

async function initTransporter(){
    if(!config.SMTP_HOST || !config.SMTP_PORT || !config.SMTP_USER || !config.SMTP_PASS){
        // console.log('SMTP not fully configured; email will use fallback logging.');
        transporter = null;
        transporterReady = false;
        return;
    }

    const transportOptions = {
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: Boolean(config.SMTP_SECURE), // true for 465, false for other ports (STARTTLS)
        auth: {
            user: config.SMTP_USER,
            pass: config.SMTP_PASS
        }
    };

    // For some providers and environments we may need to allow invalid certs (e.g., internal mailhog). Do not enable by default.
    if(process.env.SMTP_ALLOW_INSECURE === 'true'){
        transportOptions.tls = { rejectUnauthorized: false };
    }

    try{
        const t = nodemailer.createTransport(transportOptions);
        // verify will attempt a connection and authentication
        await t.verify();
        transporter = t;
        transporterReady = true;
        // console.log('SMTP transporter verified:', { host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.SMTP_SECURE });
    }catch(err){
        transporter = null;
        transporterReady = false;
        console.warn('SMTP transporter verification failed - falling back to console logging. Reason:', err && err.message ? err.message : err);
    }
}

// initialize transporter at module load
initTransporter().catch(err=>{
    console.warn('Failed to initialize SMTP transporter', err && err.message ? err.message : err);
});

async function sendMail({ to, subject, text, html }){
    const from = config.SMTP_FROM || config.SMTP_USER || config.DEFAULT_ADMIN_EMAIL;

    if(transporterReady && transporter){
        try{
            const result = await transporter.sendMail({ from, to, subject, text, html });
            // console.log('Email sent via SMTP to', to, 'messageId:', result && result.messageId);
            return result;
        }catch(err){
            console.error('SMTP sendMail failed, falling back to console. Error:', err && err.message ? err.message : err);
            // continue to fallback logging below
        }
    }

    // Fallback: log to console (useful for dev or when SMTP is unavailable)
    // console.log('Email fallback - not sent via SMTP');
    return Promise.resolve();
}

function getStatus(){
    return {
        smtpConfigured: Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS && config.SMTP_PORT),
        smtpEnabled: Boolean(config.SMTP_ENABLED),
        transporterReady
    };
}

module.exports = { sendMail, getStatus, initTransporter };
