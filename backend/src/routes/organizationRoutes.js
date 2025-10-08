const express=require('express');
const { protect, requireRole }=require('../middleware/authMiddleware');
const organizationController=require('../controllers/organizationController');

const router=express.Router();

router.get('/public',organizationController.listPublicOrganizations);

router.use(protect);

router
    .route('/')
    .get(requireRole('admin','instructor'),organizationController.listOrganizations)
    .post(requireRole('admin'),organizationController.createOrganization);

router
    .route('/:id')
    .delete(requireRole('admin'),organizationController.deleteOrganization);

router.post('/:id/teachers/:teacherId',requireRole('admin'),organizationController.addTeacherToOrganization);
router.delete('/:id/teachers/:teacherId',requireRole('admin'),organizationController.removeTeacherFromOrganization);

module.exports=router;
