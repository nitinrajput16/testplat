const express=require('express');
const { protect, requireRole }=require('../middleware/authMiddleware');
const examController=require('../controllers/examController');

const router=express.Router();

router.use(protect);

router.get('/upcoming',examController.getUpcomingExams);

router
    .route('/')
    .get(examController.getExams)
    .post(requireRole('admin','instructor'),examController.createExam);

router.post('/:id/session',requireRole('student'),examController.ensureExamSession);

router
    .route('/:id')
    .get(examController.getExamById)
    .patch(requireRole('admin','instructor'),examController.updateExam)
    .delete(requireRole('admin','instructor'),examController.deleteExam);

module.exports=router;
