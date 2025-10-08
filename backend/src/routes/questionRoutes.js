const express=require('express');
const multer=require('multer');
const { protect, requireRole }=require('../middleware/authMiddleware');
const questionController=require('../controllers/questionController');

const router=express.Router({ mergeParams:true });

const upload=multer({
    storage:multer.memoryStorage(),
    limits:{
        fileSize:1024*1024 // 1 MB
    }
});

const uploadCsvMiddleware=(req,res,next)=>{
    upload.single('file')(req,res,(error)=>{
        if(!error){
            return next();
        }

        if(error.code==='LIMIT_FILE_SIZE'){
            return res.status(400).json({ message:'CSV file is too large. Maximum size is 1 MB.' });
        }

        return res.status(400).json({ message:error.message || 'Failed to process uploaded CSV file.' });
    });
};

router.use(protect);

router.post(
    '/:examId/import',
    requireRole('admin','instructor'),
    uploadCsvMiddleware,
    questionController.importMcqQuestionsFromCsv
);

router
    .route('/:examId')
    .get(questionController.listByExam)
    .post(requireRole('admin','instructor'),questionController.createQuestion);

router
    .route('/:examId/:questionId')
    .patch(requireRole('admin','instructor'),questionController.updateQuestion)
    .delete(requireRole('admin','instructor'),questionController.removeQuestion);

module.exports=router;
