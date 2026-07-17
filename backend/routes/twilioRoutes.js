import express from 'express';
import { getToken, makeCall, voiceResponse, incomingVoice, incomingCallStatus, transcriptionStatus } from '../controller/twilioController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

// Token for Browser Softphone (Important)
router.get('/token', authMiddleware, getToken);

// Make outbound call
router.post('/make-call', authMiddleware, makeCall);

// Twilio Webhook (TwiML)
router.post('/voice', voiceResponse);

router.post('/incoming', incomingVoice);

router.post('/incoming-status', incomingCallStatus);

router.post('/transcription', transcriptionStatus);

export default router;
