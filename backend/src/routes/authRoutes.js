const express=require('express');
const router=express.Router();
const authController=require('../controllers/authController');
const { loginRateLimiter }=require('../middleware/rateLimiter');

router.post('/register',authController.register);
router.post('/login',loginRateLimiter,authController.login);

module.exports=router;
