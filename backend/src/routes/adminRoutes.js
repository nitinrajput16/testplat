const express=require('express');
const { protect, requireRole }=require('../middleware/authMiddleware');
const adminController=require('../controllers/adminController');
const teacherRequestController=require('../controllers/teacherRequestController');

const router=express.Router();

router.use(protect,requireRole('admin'));

router
    .route('/teachers')
    .get(adminController.listTeachers)
    .post(adminController.createTeacher);

router
    .route('/teachers/:id')
    .delete(adminController.removeTeacher);

// Teacher request review (admin)
router
    .route('/teacher-requests')
    .get(teacherRequestController.listRequests);

router
    .route('/teacher-requests/:id')
    .post(teacherRequestController.processRequest);

// Admin user management
router
    .route('/users')
    .get(adminController.listUsers);

router
    .route('/users/:id/role')
    .post(adminController.updateUserRole);

router
    .route('/users/:id/active')
    .post(adminController.setUserActive);

router
    .route('/users/:id/reset-password')
    .post(adminController.resetUserPassword);

module.exports=router;
