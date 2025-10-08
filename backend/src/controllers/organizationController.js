const Organization=require('../models/Organization');
const User=require('../models/User');
const asyncHandler=require('../utils/asyncHandler');
const { sanitizeString }=require('../utils/validators');

const listOrganizations=asyncHandler(async (_req,res)=>{
    const organizations=await Organization.find()
        .populate('teachers','name email role isActive')
        .populate('createdBy','name email role')
        .sort('name');

    res.json(organizations);
});

const listPublicOrganizations=asyncHandler(async (_req,res)=>{
    const organizations=await Organization.find()
        .sort('name')
        .select('name description');

    res.json(organizations);
});

const createOrganization=asyncHandler(async (req,res)=>{
    const name=sanitizeString(req.body.name);
    const description=sanitizeString(req.body.description||'');

    if(!name){
        return res.status(400).json({ message:'Organization name is required.' });
    }

    const existing=await Organization.findOne({ name:new RegExp(`^${name}$`,'i') });
    if(existing){
        return res.status(409).json({ message:'An organization with this name already exists.' });
    }

    const organization=await Organization.create({
        name,
        description,
        createdBy:req.user._id
    });

    res.status(201).json(organization);
});

const deleteOrganization=asyncHandler(async (req,res)=>{
    const organization=await Organization.findById(req.params.id);

    if(!organization){
        return res.status(404).json({ message:'Organization not found.' });
    }

    await Organization.deleteOne({ _id:organization._id });
    await User.updateMany(
        { organizations:organization._id },
        { $pull:{ organizations:organization._id } }
    );

    res.status(204).end();
});

const addTeacherToOrganization=asyncHandler(async (req,res)=>{
    const { id:organizationId, teacherId }=req.params;

    const organization=await Organization.findById(organizationId);
    if(!organization){
        return res.status(404).json({ message:'Organization not found.' });
    }

    const teacher=await User.findById(teacherId);
    if(!teacher || teacher.role!=='instructor'){
        return res.status(404).json({ message:'Teacher account not found.' });
    }

    if(!teacher.isActive){
        return res.status(400).json({ message:'Teacher account is inactive.' });
    }

    // Ensure the teacher is no longer linked to other organizations.
    await Organization.updateMany(
        { _id:{ $ne:organization._id }, teachers:teacher._id },
        { $pull:{ teachers:teacher._id } }
    );

    const alreadyAssigned=organization.teachers.some((id)=>id.equals(teacher._id));
    if(!alreadyAssigned){
        organization.teachers.push(teacher._id);
    }
    await organization.save();

    teacher.organizations=[organization._id];
    await teacher.save();

    const updatedOrganization=await Organization.findById(organizationId)
        .populate('teachers','name email role isActive')
        .populate('createdBy','name email role');

    res.json(updatedOrganization);
});

const removeTeacherFromOrganization=asyncHandler(async (req,res)=>{
    const { id:organizationId, teacherId }=req.params;

    const organization=await Organization.findById(organizationId);
    if(!organization){
        return res.status(404).json({ message:'Organization not found.' });
    }

    organization.teachers=organization.teachers.filter((id)=>!id.equals(teacherId));
    await organization.save();

    await User.findByIdAndUpdate(teacherId,{ $pull:{ organizations:organizationId } });

    res.status(204).end();
});

module.exports={
    listOrganizations,
    listPublicOrganizations,
    createOrganization,
    deleteOrganization,
    addTeacherToOrganization,
    removeTeacherFromOrganization
};
