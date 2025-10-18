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
router.delete('/:submissionId', requireRole('admin','instructor'), submissionController.deleteSubmission);
// Adjust all submission scores for an exam by delta: POST /api/submissions/exam/:examId/adjust
router.post('/exam/:examId/adjust', requireRole('admin','instructor'), submissionController.adjustSubmissionScores);

module.exports=router;
