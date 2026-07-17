import express from 'express';
import {
  getChatUsers,
  getConversation,
  getUnreadInternalMessageCount,
  sendInternalMessage
} from '../controller/internalMessageController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/users', authMiddleware, getChatUsers);
router.get('/unread-count', authMiddleware, getUnreadInternalMessageCount);
router.get('/:userId', authMiddleware, getConversation);
router.post('/', authMiddleware, sendInternalMessage);

export default router;
