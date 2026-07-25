import express from 'express';
import { createLead, getLeads, updateLeadDisposition } from '../controller/leadController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', authMiddleware, createLead);
router.get('/', authMiddleware, getLeads);
router.patch('/:id/disposition', authMiddleware, updateLeadDisposition);

export default router;
