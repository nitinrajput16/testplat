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
        await teacher.save();

        organization.teachers.push(teacher._id);
        await organization.save();

        const populatedTeacher=await User.findById(teacher._id)
            .select('-password')
            .populate('organizations','name');
        return res.status(201).json(populatedTeacher);
    }

    await teacher.save();
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

module.exports={
    listTeachers,
    createTeacher,
    removeTeacher
};
