import express from 'express';
import { createPart, deletePart, getParts } from '../controller/partController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', authMiddleware, createPart);
router.get('/', authMiddleware, getParts);
router.delete('/:id', authMiddleware, deletePart);

export default router;
