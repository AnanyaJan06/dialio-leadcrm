import express from 'express';
import {
  createFollowUp,
  deleteFollowUp,
  getFollowUps,
  updateFollowUp
} from '../controller/followUpController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', authMiddleware, createFollowUp);
router.get('/', authMiddleware, getFollowUps);
router.patch('/:id', authMiddleware, updateFollowUp);
router.delete('/:id', authMiddleware, deleteFollowUp);

export default router;
