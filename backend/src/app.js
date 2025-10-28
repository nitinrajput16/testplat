const express=require('express');
const path=require('path');
const fs=require('fs');
const cors=require('cors');

const authRoutes=require('./routes/authRoutes');
const examRoutes=require('./routes/examRoutes');
const questionRoutes=require('./routes/questionRoutes');
const submissionRoutes=require('./routes/submissionRoutes');
const userRoutes=require('./routes/userRoutes');
const { notFoundHandler, errorHandler }=require('./middleware/errorHandler');
const organizationRoutes=require('./routes/organizationRoutes');
const adminRoutes=require('./routes/adminRoutes');
const codeExecutionRoutes=require('./routes/codeExecutionRoutes');
const teacherRequestRoutes=require('./routes/teacherRequestRoutes');
const { apiRateLimiter }=require('./middleware/rateLimiter');

const app=express();

app.set('trust proxy',1);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended:true }));
app.use('/api',apiRateLimiter);

const publicDir=path.resolve(__dirname,'../../frontend/public');
const viewsDir=path.resolve(__dirname,'../../frontend/views');

const hasPublicDir=fs.existsSync(publicDir);
const hasViewsDir=fs.existsSync(viewsDir);

if(hasViewsDir){
    app.set('views',viewsDir);
    app.set('view engine','ejs');
}

if(hasPublicDir){
    app.use(express.static(publicDir));
}

app.get('/health',(_req,res)=>{
    res.json({ status:'ok' });
});

app.use('/api/auth',authRoutes);
app.use('/api/exams',examRoutes);
app.use('/api/questions',questionRoutes);
app.use('/api/submissions',submissionRoutes);
app.use('/api/organizations',organizationRoutes);
app.use('/api/admin',adminRoutes);
app.use('/api/code',codeExecutionRoutes);
app.use('/api/users',userRoutes);
app.use('/api/teacher-requests',teacherRequestRoutes);

// Temporary test endpoint to exercise the mailer (POST { to })
app.post('/api/test-send', async (req, res) => {
    try {
        const emailUtil = require('./utils/email');
        const config = require('./config/config');
        const to = req.body?.to || process.env.MAIL_FROM || '';
        if(!to) return res.status(400).json({ message: 'Recipient (to) or MAIL_FROM must be set' });

        const subject = req.body?.subject || 'Test email from TestPlat';
        const text = req.body?.text || 'This is a test email to verify delivery.';

        const resp = await emailUtil.sendMail({ to, subject, text, html: `<p>${text}</p>` });

        const usedFrom = config.MAIL_FROM_NAME ? `${config.MAIL_FROM_NAME} <${config.MAIL_FROM}>` : config.MAIL_FROM;
        return res.json({ ok: true, usedFrom, resp });
    } catch (err) {
        console.error('Test send failed', err && (err.stack || err));
        return res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
    }
});

if(hasViewsDir){
    app.get('/',(_req,res)=>{
        res.redirect('/land');
    });

    app.get('/home',(_req,res)=>{
        res.render('index',{ pageTitle:'Home', navActive:'home' });
    });

    app.get('/land',(_req,res)=>{
        res.render('land',{ pageTitle:'Welcome', navActive:'home' });
    });

    app.get('/login',(_req,res)=>{
        res.render('login',{ pageTitle:'Login', navActive:'login' });
    });

    app.get('/register',(_req,res)=>{
        res.render('register',{ pageTitle:'Register', navActive:'register' });
    });

    app.get('/register-teacher',(_req,res)=>{
        res.render('register-teacher',{ pageTitle:'Register as Teacher', navActive:'register' });
    });

    app.get('/forgot-password',(_req,res)=>{
        res.render('forgot-password',{ pageTitle:'Forgot Password', navActive:'login' });
    });

    app.get('/reset-password',(_req,res)=>{
        res.render('reset-password',{ pageTitle:'Reset Password', navActive:'login' });
    });

    app.get('/dashboard',(_req,res)=>{
        res.render('dashboard-redirect',{ pageTitle:'Dashboard', navActive:'dashboard' });
    });

    app.get('/dashboard-admin',(_req,res)=>{
        res.render('dashboard-admin',{ pageTitle:'Dashboard', navActive:'dashboard' });
    });

    app.get('/dashboard-student',(_req,res)=>{
        res.render('dashboard-student',{ pageTitle:'Dashboard', navActive:'dashboard' });
    });

    app.get('/profile',(_req,res)=>{
        res.render('profile',{ pageTitle:'Profile', navActive:'profile' });
    });
}

app.use((req,res,next)=>{
    if(req.method==='GET' && !req.originalUrl.startsWith('/api/')){
        if(hasViewsDir){
            return res.render('login',{ pageTitle:'Login', navActive:'login' });
        }

        if(hasPublicDir){
            const indexPath=path.join(publicDir,'index.html');
            if(fs.existsSync(indexPath)){
                return res.sendFile(indexPath);
            }
        }
    }
    next();
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports=app;
