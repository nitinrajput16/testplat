const express=require('express');
const { protect, requireRole }=require('../middleware/authMiddleware');
const submissionController=require('../controllers/submissionController');

const router=express.Router();

router.use(protect);

router.post('/',requireRole('student'),submissionController.createSubmission);
router.get('/exam/:examId',requireRole('admin','instructor'),submissionController.getSubmissionsForExam);
router.get('/me',submissionController.getMySubmissions);
// Manual score update (instructors/admins only)
router.post('/:submissionId/score', requireRole('admin','instructor'), submissionController.updateSubmissionScore);
router.post('/:submissionId/answer/:answerIndex/score', requireRole('admin','instructor'), submissionController.updateSubmissionAnswerScore);

module.exports=router;
