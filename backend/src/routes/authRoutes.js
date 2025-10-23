const express=require('express');
const router=express.Router();
const authController=require('../controllers/authController');
const { loginRateLimiter }=require('../middleware/rateLimiter');

router.post('/register',authController.register);
router.post('/register-teacher',authController.registerTeacher);
router.post('/login',loginRateLimiter,authController.login);
router.post('/forgot-password',authController.forgotPassword);
router.post('/reset-password',authController.resetPassword);

module.exports=router;
