const User=require('../models/User');
const Organization=require('../models/Organization');
const asyncHandler=require('../utils/asyncHandler');
const { isValidEmail, validatePassword, sanitizeString }=require('../utils/validators');

const listTeachers=asyncHandler(async (_req,res)=>{
    const teachers=await User.find({ role:'instructor' })
        .select('-password')
        .populate('organizations','name')
        .sort('name');

    res.json(teachers);
});

const createTeacher=asyncHandler(async (req,res)=>{
    const name=sanitizeString(req.body.name);
    const email=req.body.email?.toLowerCase();
    const password=req.body.password;
    const organizationId=req.body.organizationId;

    if(!name){
        return res.status(400).json({ message:'Name is required.' });
    }

    if(!isValidEmail(email)){
        return res.status(400).json({ message:'A valid email is required.' });
    }

    if(!validatePassword(password)){
        return res.status(400).json({ message:'Password must be at least 8 characters.' });
    }

    const existingUser=await User.findOne({ email });
    if(existingUser){
        return res.status(409).json({ message:'An account with this email already exists.' });
    }

    const teacher=new User({
        name,
        email,
        password,
        role:'instructor'
    });

    if(organizationId){
        const organization=await Organization.findById(organizationId);
        if(!organization){
            return res.status(404).json({ message:'Organization not found.' });
        }

        teacher.organizations=[organizationId];
        try{
            await teacher.save();
        }catch(err){
            // duplicate key (race) - map to 409
            if(err && err.code===11000 && err.keyPattern && err.keyPattern.email){
                return res.status(409).json({ message:'An account with this email already exists.' });
            }
            throw err;
        }

        organization.teachers.push(teacher._id);
        await organization.save();

        const populatedTeacher=await User.findById(teacher._id)
            .select('-password')
            .populate('organizations','name');
        return res.status(201).json(populatedTeacher);
    }

    try{
        await teacher.save();
    }catch(err){
        if(err && err.code===11000 && err.keyPattern && err.keyPattern.email){
            return res.status(409).json({ message:'An account with this email already exists.' });
        }
        throw err;
    }
    const createdTeacher=await User.findById(teacher._id)
        .select('-password')
        .populate('organizations','name');
    res.status(201).json(createdTeacher);
});

const removeTeacher=asyncHandler(async (req,res)=>{
    const teacher=await User.findById(req.params.id);

    if(!teacher || teacher.role!=='instructor'){
        return res.status(404).json({ message:'Teacher account not found.' });
    }

    teacher.isActive=false;
    teacher.organizations=[];
    await teacher.save();

    await Organization.updateMany(
        { teachers:teacher._id },
        { $pull:{ teachers:teacher._id } }
    );

    res.status(204).end();
});

// --- User management for admins ---
const listUsers=asyncHandler(async (_req,res)=>{
    const users=await User.find()
        .select('-password -passwordResetToken -passwordResetExpires')
        .populate('organizations','name')
        .sort('name');

    res.json(users);
});

const updateUserRole=asyncHandler(async (req,res)=>{
    const { id } = req.params;
    const { role } = req.body;
    if(!id){
        return res.status(400).json({ message:'User id is required.' });
    }
    if(!role || !['admin','instructor','student'].includes(role)){
        return res.status(400).json({ message:'Invalid role.' });
    }

    const user=await User.findById(id);
    if(!user){
        return res.status(404).json({ message:'User not found.' });
    }

    user.role=role;
    await user.save();

    const updated=await User.findById(id).select('-password -passwordResetToken -passwordResetExpires').populate('organizations','name');
    res.json(updated);
});

const setUserActive=asyncHandler(async (req,res)=>{
    const { id } = req.params;
    const { isActive } = req.body;
    if(typeof isActive==='undefined'){
        return res.status(400).json({ message:'isActive boolean is required.' });
    }

    const user=await User.findById(id);
    if(!user){
        return res.status(404).json({ message:'User not found.' });
    }

    user.isActive=Boolean(isActive);
    await user.save();

    res.status(204).end();
});

const crypto=require('crypto');
const emailUtil=require('../utils/email');
const config=require('../config/config');
const resetUserPassword=asyncHandler(async (req,res)=>{
    const { id } = req.params;
    if(!id){
        return res.status(400).json({ message:'User id is required.' });
    }

    const user=await User.findById(id);
    if(!user){
        return res.status(404).json({ message:'User not found.' });
    }

    // generate a one-time token
    const token=crypto.randomBytes(20).toString('hex');
    user.passwordResetToken=token;
    user.passwordResetExpires=new Date(Date.now()+1000*60*60); // 1 hour
    await user.save();

    const frontendBase = config.FRONTEND_BASE_URL || '';
    const resetUrl = `${frontendBase}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;

    // attempt to email the reset link, otherwise return token in response for dev/testing
    try{
        if(config.SMTP_HOST){
            const subject='Password reset (admin)';
            const text=`An administrator requested a password reset. Use this link to reset the password: ${resetUrl}`;
            const html=`<p>An administrator requested a password reset for your account. Click below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`;
            await emailUtil.sendMail({ to: user.email, subject, text, html });
            return res.json({ message: 'Reset link emailed to the user' });
        }
    }catch(err){
        console.error('Failed to send admin-initiated reset email',err);
    }

    // Dev fallback: return token and url
    res.json({ resetToken: token, expiresAt: user.passwordResetExpires, resetUrl });
});

module.exports={
    listTeachers,
    createTeacher,
    removeTeacher
    ,listUsers,updateUserRole,setUserActive,resetUserPassword
};
