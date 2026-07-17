import express from 'express';
import { getConversationTimeline } from '../controller/conversationController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/timeline', authMiddleware, getConversationTimeline);

export default router;