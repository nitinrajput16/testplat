const express=require('express');
const { protect, requireRole }=require('../middleware/authMiddleware');
const controller=require('../controllers/teacherRequestController');

const router=express.Router();

// student can create a request
router.post('/', protect, controller.createRequest);

module.exports=router;
