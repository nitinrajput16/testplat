const express=require('express');
const { protect, requireRole }=require('../middleware/authMiddleware');
const submissionController=require('../controllers/submissionController');

const router=express.Router();

router.use(protect);

router.post('/',requireRole('student'),submissionController.createSubmission);
router.get('/exam/:examId',requireRole('admin','instructor'),submissionController.getSubmissionsForExam);
router.get('/me',submissionController.getMySubmissions);

module.exports=router;
