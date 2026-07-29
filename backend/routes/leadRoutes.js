import express from 'express';
import { addLeadNote, createLead, getLeads, updateLeadDisposition, updateLeadFollowUp } from '../controller/leadController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', authMiddleware, createLead);
router.get('/', authMiddleware, getLeads);
router.patch('/:id/disposition', authMiddleware, updateLeadDisposition);
router.post('/:id/notes', authMiddleware, addLeadNote);
router.patch('/:id/follow-up', authMiddleware, updateLeadFollowUp);

export default router;
