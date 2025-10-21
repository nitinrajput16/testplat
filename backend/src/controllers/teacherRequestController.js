const TeacherRequest=require('../models/TeacherRequest');
const User=require('../models/User');
const asyncHandler=require('../utils/asyncHandler');
const { sanitizeString }=require('../utils/validators');

const createRequest=asyncHandler(async (req,res)=>{
    const userId=req.user._id;
    const message=sanitizeString(req.body.message||'');

    const existing=await TeacherRequest.findOne({ user:userId, status:'pending' });
    if(existing){
        return res.status(409).json({ message:'You already have a pending request.' });
    }

    const reqDoc=await TeacherRequest.create({ user:userId, message });
    res.status(201).json({ requestId:reqDoc._id, status:reqDoc.status });
});

const listRequests=asyncHandler(async (_req,res)=>{
    const items=await TeacherRequest.find().sort('-createdAt').populate('user','name email role').populate('processedBy','name email');
    res.json(items);
});

const processRequest=asyncHandler(async (req,res)=>{
    const { id }=req.params;
    const action=req.body.action;

    if(!['approve','reject'].includes(action)){
        return res.status(400).json({ message:'Invalid action.' });
    }

    const requestDoc=await TeacherRequest.findById(id).populate('user');
    if(!requestDoc || requestDoc.status!=='pending'){
        return res.status(404).json({ message:'Pending request not found.' });
    }

    requestDoc.status = action==='approve' ? 'approved' : 'rejected';
    requestDoc.processedBy = req.user._id;
    requestDoc.processedAt = new Date();
    await requestDoc.save();

    if(action==='approve'){
        const user=requestDoc.user;
        user.role='instructor';
        await user.save();
    }

    res.json({ id:requestDoc._id, status:requestDoc.status });
});

module.exports={ createRequest, listRequests, processRequest };
