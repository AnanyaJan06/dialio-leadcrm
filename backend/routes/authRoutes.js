import express from 'express';
import {
  register,
  login,
  logout,
  getCurrentUser,
  getUsers,
  getAdminActivityStats,
  changePassword,
  requireAdmin
} from '../controller/authController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', authMiddleware, requireAdmin, register);
router.post('/login', login);
router.post('/logout', authMiddleware, logout);

router.get('/me', authMiddleware, getCurrentUser);
router.get('/users', authMiddleware, requireAdmin, getUsers);
router.get('/admin-activity-stats', authMiddleware, requireAdmin, getAdminActivityStats);
router.post('/change-password', authMiddleware, changePassword);


export default router;
