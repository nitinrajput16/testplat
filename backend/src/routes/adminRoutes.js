const express=require('express');
const { protect, requireRole }=require('../middleware/authMiddleware');
const adminController=require('../controllers/adminController');

const router=express.Router();

router.use(protect,requireRole('admin'));

router
    .route('/teachers')
    .get(adminController.listTeachers)
    .post(adminController.createTeacher);

router
    .route('/teachers/:id')
    .delete(adminController.removeTeacher);

module.exports=router;
