import express from 'express';
import { getMessages, getMessageThreads, receiveMessage, sendMessage, updateMessageStatus, uploadMessageImage } from '../controller/messageController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', authMiddleware, getMessages);
router.get('/threads', authMiddleware, getMessageThreads);
router.post('/upload-image', authMiddleware, express.raw({ type: 'image/*', limit: '5mb' }), uploadMessageImage);
router.post('/send', authMiddleware, sendMessage);
router.post('/incoming', receiveMessage);
router.post('/status', updateMessageStatus);

export default router;
