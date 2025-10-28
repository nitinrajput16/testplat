const nodemailer = require('nodemailer');
const config = require('../config/config');

let transporter = null;
let transporterReady = false;

// Brevo (Sendinblue) client - lazy init only if API key is provided
let brevoClient = null;
let brevoConfigured = false;
try{
    const SibApiV3Sdk = require('sib-api-v3-sdk');
    if(process.env.BREVO_API_KEY){
        const defaultClient = SibApiV3Sdk.ApiClient.instance;
        defaultClient.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;
        brevoClient = new SibApiV3Sdk.TransactionalEmailsApi();
        brevoConfigured = true;
    }
}catch(e){
    brevoClient = null;
    brevoConfigured = false;
}

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
    const from = config.MAIL_FROM || config.SMTP_FROM || config.SMTP_USER || config.DEFAULT_ADMIN_EMAIL;
    const fromName = config.MAIL_FROM_NAME || '';
    const fromHeader = fromName ? `${fromName} <${from}>` : from;

    // Prefer Brevo (Sendinblue) API if configured
    if(brevoConfigured && brevoClient){
        try{
            const SibApiV3Sdk = require('sib-api-v3-sdk');
            const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

            // normalize recipients
            const recipients = Array.isArray(to) ? to : [to];
            sendSmtpEmail.to = recipients.map(r=>({ email: r }));
            // include name if present
            sendSmtpEmail.sender = fromName ? { name: fromName, email: from } : { email: from };
            sendSmtpEmail.subject = subject;
            if(html) sendSmtpEmail.htmlContent = html;
            if(text) sendSmtpEmail.textContent = text;

            const resp = await brevoClient.sendTransacEmail(sendSmtpEmail);
            return resp;
        }catch(err){
            console.error('Brevo sendTransacEmail failed, falling back to SMTP/console. Error:', err && err.body ? err.body : (err && err.message ? err.message : err));
            // fall through to SMTP fallback (unless API-only)
        }
    }

    // If configured to use API only, skip SMTP fallback entirely
    if(true){
        console.warn('EMAIL_API_ONLY enabled - skipping SMTP fallback. Email not sent to:', to);
        return Promise.resolve({ ok: false, message: 'EMAIL_API_ONLY enabled and Brevo send failed or not configured' });
    }

    // Next try SMTP transporter if ready
    if(transporterReady && transporter){
        try{
            const result = await transporter.sendMail({ from: fromHeader, to, subject, text, html });
            return result;
        }catch(err){
            console.error('SMTP sendMail failed, falling back to console. Error:', err && err.message ? err.message : err);
        }
    }

    // Final fallback: log to console (useful for dev or when neither Brevo nor SMTP are available)
    console.log('Email fallback - not sent via provider. to:', to, 'subject:', subject, 'from:', fromHeader);
    return Promise.resolve({ ok: false, message: 'No mail provider available' });
}

function getStatus(){
    return {
        smtpConfigured: Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS && config.SMTP_PORT),
        smtpEnabled: Boolean(config.SMTP_ENABLED),
        transporterReady,
        brevoConfigured
    };
}

module.exports = { sendMail, getStatus, initTransporter };
