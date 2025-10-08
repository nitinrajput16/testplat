const jwt=require('jsonwebtoken');
const User=require('../models/User');
const config=require('../config/config');
const asyncHandler=require('../utils/asyncHandler');

const protect=asyncHandler(async (req,res,next)=>{
    const authHeader=req.headers.authorization;

    if(!authHeader || !authHeader.startsWith('Bearer ')){
        return res.status(401).json({ message:'Authentication required.' });
    }

    const token=authHeader.split(' ')[1];

    try{
        const decoded=jwt.verify(token,config.JWT_SECRET);
        const user=await User.findById(decoded.id);

        if(!user){
            return res.status(401).json({ message:'User no longer exists.' });
        }

        req.user=user;
        next();
    }catch(error){
        return res.status(401).json({ message:'Invalid or expired token.' });
    }
});

const requireRole=(...roles)=>{
    return (req,res,next)=>{
        if(!req.user){
            return res.status(401).json({ message:'Authentication required.' });
        }

        if(!roles.includes(req.user.role)){
            return res.status(403).json({ message:'You do not have permission to perform this action.' });
        }

        next();
    };
};

module.exports={
    protect,
    requireRole
};
