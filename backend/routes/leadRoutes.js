import express from 'express';
import { createLead, getLeads } from '../controller/leadController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', authMiddleware, createLead);
router.get('/', authMiddleware, getLeads);

export default router;
