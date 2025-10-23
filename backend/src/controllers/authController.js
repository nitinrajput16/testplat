const User=require('../models/User');
const Organization=require('../models/Organization');
const asyncHandler=require('../utils/asyncHandler');
const { generateToken }=require('../utils/generateToken');
const { isValidEmail, validatePassword, sanitizeString }=require('../utils/validators');
const crypto = require('crypto');
const emailUtil = require('../utils/email');
const config = require('../config/config');

const allowedRegistrationRoles=new Set(['student','instructor']);

const register=asyncHandler(async (req,res)=>{
    const name=sanitizeString(req.body.name);
    const email=req.body.email?.toLowerCase();
    const password=req.body.password;
    const requestedRole=req.body.role;
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

    const role=allowedRegistrationRoles.has(requestedRole)?requestedRole:'student';

    let organizations=[];
    if(role==='student'){
        if(!organizationId){
            return res.status(400).json({ message:'Organization is required for student registration.' });
        }

        const organization=await Organization.findById(organizationId);
        if(!organization){
            return res.status(404).json({ message:'Selected organization was not found.' });
        }

        organizations=[organization._id];
    }

    const user=await User.create({
        name,
        email,
        password,
        role,
        organizations
    });

    const token=generateToken(user);

    res.status(201).json({
        user:user,
        token
    });
});

const login=asyncHandler(async (req,res)=>{
    const email=req.body.email?.toLowerCase();
    const password=req.body.password;

    if(!isValidEmail(email)||!validatePassword(password)){
        return res.status(400).json({ message:'Invalid credentials.' });
    }

    const user=await User.findOne({ email });
    if(!user){
        return res.status(401).json({ message:'Invalid email or password.' });
    }

    const passwordMatch=await user.comparePassword(password);
    if(!passwordMatch){
        return res.status(401).json({ message:'Invalid email or password.' });
    }

    const token=generateToken(user);

    res.status(200).json({
        user:user,
        token
    });
});

const forgotPassword=asyncHandler(async (req,res)=>{
    const { email } = req.body;
    if(!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email });
    if(!user){
        return res.json({ message: 'If that email is registered, a reset link has been sent' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = token;
    user.passwordResetExpires = Date.now() + 1000 * 60 * 60; // 1 hour
    await user.save();

    const frontendBase = config.FRONTEND_BASE_URL || '';
    const resetUrl = `${frontendBase}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;

    const subject = 'Password reset';
    const text = `Click the link to reset your password: ${resetUrl}`;
    const html = `<p>Click the link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`;

    try{
        await emailUtil.sendMail({ to: user.email, subject, text, html });
    }catch(err){
        console.error('Failed sending reset email', err);
    }

    if(!config.SMTP_HOST){
        return res.json({ message: 'Reset token (dev-only)', token, resetUrl });
    }

    res.json({ message: 'If that email is registered, a reset link has been sent' });
});

const resetPassword=asyncHandler(async (req,res)=>{
    const { email, token, newPassword } = req.body;
    if(!email || !token || !newPassword) return res.status(400).json({ message: 'email, token and newPassword required' });

    const user = await User.findOne({ email, passwordResetToken: token, passwordResetExpires: { $gt: Date.now() } });
    if(!user) return res.status(400).json({ message: 'Invalid or expired token' });

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successful' });
});

module.exports={
    register,
    login,
    forgotPassword,
    resetPassword
};
