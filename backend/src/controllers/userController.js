const User=require('../models/User');
const Organization=require('../models/Organization');
const asyncHandler=require('../utils/asyncHandler');
const { sanitizeString, validatePassword, isValidEmail }=require('../utils/validators');

const formatRoleLabel=(role)=>{
    switch(role){
    case 'admin':
        return 'Administrator';
    case 'instructor':
        return 'Instructor';
    case 'student':
        return 'Student';
    default:
        return 'User';
    }
};

const getCurrentProfile=asyncHandler(async (req,res)=>{
    const user=await User.findById(req.user._id)
        .populate('organizations','name description');

    if(!user){
        return res.status(404).json({ message:'User not found.' });
    }

    res.json({
        user,
        meta:{
            roleLabel:formatRoleLabel(user.role)
        }
    });
});

const updateCurrentProfile=asyncHandler(async (req,res)=>{
    const user=await User.findById(req.user._id);

    if(!user){
        return res.status(404).json({ message:'User not found.' });
    }

    let hasChanges=false;
    let organizationsChanged=false;
    let previousOrganizationIds=[];
    let nextOrganizationIds=[];

    if(Object.prototype.hasOwnProperty.call(req.body,'name')){
        const sanitizedName=sanitizeString(req.body.name);
        if(!sanitizedName){
            return res.status(400).json({ message:'Name cannot be empty.' });
        }
        if(sanitizedName!==user.name){
            user.name=sanitizedName;
            hasChanges=true;
        }
    }

    if(Object.prototype.hasOwnProperty.call(req.body,'email')){
        const incomingEmail=(req.body.email||'').toLowerCase();
        if(!isValidEmail(incomingEmail)){
            return res.status(400).json({ message:'Provide a valid email address.' });
        }
        if(incomingEmail!==user.email){
            const existingUser=await User.findOne({ email:incomingEmail });
            if(existingUser && !existingUser._id.equals(user._id)){
                return res.status(409).json({ message:'That email address is already registered.' });
            }
            user.email=incomingEmail;
            hasChanges=true;
        }
    }

    if(Array.isArray(req.body.organizationIds) && (user.role==='admin' || user.role==='instructor')){
        previousOrganizationIds=user.organizations.map((id)=>id.toString());

        const organizationIds=req.body.organizationIds
            .map((value)=>value && value.toString && value.toString())
            .filter(Boolean);
        const uniqueOrganizationIds=[...new Set(organizationIds)];

        if(user.role==='instructor' && uniqueOrganizationIds.length>1){
            return res.status(400).json({ message:'Instructors can belong to only one organization.' });
        }

        if(uniqueOrganizationIds.length){
            const organizations=await Organization.find({ _id:{ $in:uniqueOrganizationIds } }).select('_id');
            if(organizations.length!==uniqueOrganizationIds.length){
                return res.status(400).json({ message:'One or more selected organizations could not be found.' });
            }
        }

        const currentSet=new Set(previousOrganizationIds);
        const nextSet=new Set(uniqueOrganizationIds);
        const hasDifference=currentSet.size!==nextSet.size
            || uniqueOrganizationIds.some((id)=>!currentSet.has(id));

        if(hasDifference){
            user.organizations=uniqueOrganizationIds;
            organizationsChanged=true;
            nextOrganizationIds=uniqueOrganizationIds;
            hasChanges=true;
        }
    }

    if(Object.prototype.hasOwnProperty.call(req.body,'password')){
        const newPassword=req.body.password;
        const confirmPassword=req.body.confirmPassword;
        const currentPassword=req.body.currentPassword;

        if(!newPassword){
            return res.status(400).json({ message:'Provide a new password.' });
        }

        if(!currentPassword){
            return res.status(400).json({ message:'Provide your current password to set a new password.' });
        }

        if(!validatePassword(newPassword)){
            return res.status(400).json({ message:'Password must be at least 8 characters long.' });
        }

        if(typeof confirmPassword==='string' && newPassword!==confirmPassword){
            return res.status(400).json({ message:'New password confirmation does not match.' });
        }

        const matches=await user.comparePassword(currentPassword);
        if(!matches){
            return res.status(400).json({ message:'Current password is incorrect.' });
        }

        user.password=newPassword;
        hasChanges=true;
    }

    if(!hasChanges){
        await user.populate('organizations','name description');
        return res.json({
            user,
            meta:{
                roleLabel:formatRoleLabel(user.role)
            },
            message:'No changes detected.'
        });
    }

    await user.save();

    if(organizationsChanged && user.role==='instructor'){
        const removedOrganizationIds=previousOrganizationIds.filter((id)=>!nextOrganizationIds.includes(id));
        const addedOrganizationIds=nextOrganizationIds.filter((id)=>!previousOrganizationIds.includes(id));

        if(removedOrganizationIds.length){
            await Organization.updateMany(
                { _id:{ $in:removedOrganizationIds } },
                { $pull:{ teachers:user._id } }
            );
        }

        if(addedOrganizationIds.length){
            await Organization.updateMany(
                { _id:{ $in:addedOrganizationIds } },
                { $addToSet:{ teachers:user._id } }
            );
        }
    }
    await user.populate('organizations','name description');

    res.json({
        user,
        meta:{
            roleLabel:formatRoleLabel(user.role)
        },
        message:'Profile updated successfully.'
    });
});

module.exports={
    getCurrentProfile,
    updateCurrentProfile
};
