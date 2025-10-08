const express=require('express');
const router=express.Router();
const { protect }=require('../middleware/authMiddleware');
const { getCurrentProfile, updateCurrentProfile }=require('../controllers/userController');

router.get('/me',protect,getCurrentProfile);
router.put('/me',protect,updateCurrentProfile);

module.exports=router;
