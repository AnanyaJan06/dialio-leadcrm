import express from 'express';
import { saveCallLog, getCallLogs, markCallAnswered, getInboundSession } from '../controller/callController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/log', authMiddleware, saveCallLog);
router.post('/answer', authMiddleware, markCallAnswered);
router.get('/session/:callSid', authMiddleware, getInboundSession);
router.get('/logs', authMiddleware, getCallLogs);

export default router;