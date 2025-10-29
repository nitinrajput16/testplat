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

async function sendMail({ to, subject, text, html }){
    const from = config.MAIL_FROM ;
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
        }
    }

    // Final fallback: log to console (useful for dev or when neither Brevo nor SMTP are available)
    console.log('Email fallback - not sent via provider. to:', to, 'subject:', subject, 'from:', fromHeader);
    return Promise.resolve({ ok: false, message: 'No mail provider available' });
}

function getStatus(){
    return {
        brevoConfigured
    };
}

module.exports = { sendMail, getStatus, };
