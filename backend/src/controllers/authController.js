const User=require('../models/User');
const Organization=require('../models/Organization');
const asyncHandler=require('../utils/asyncHandler');
const { generateToken }=require('../utils/generateToken');
const { isValidEmail, validatePassword, sanitizeString }=require('../utils/validators');

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

module.exports={
    register,
    login
};
