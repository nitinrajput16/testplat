const express=require('express');
const { protect, requireRole }=require('../middleware/authMiddleware');
const codeExecutionController=require('../controllers/codeExecutionController');

const router=express.Router();

router.use(protect);
router.post('/run',requireRole('admin','instructor','student'),codeExecutionController.runCode);

module.exports=router;
