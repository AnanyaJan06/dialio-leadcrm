import express from 'express';
import {
  createPart,
  deletePart,
  getGoogleSheetSyncConfig,
  getParts,
  syncGoogleSheetParts,
  updatePart,
} from '../controller/partController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/sync-sheet', authMiddleware, syncGoogleSheetParts);
router.get('/sync-config', authMiddleware, getGoogleSheetSyncConfig);
router.post('/', authMiddleware, createPart);
router.get('/', authMiddleware, getParts);
router.put('/:id', authMiddleware, updatePart);
router.delete('/:id', authMiddleware, deletePart);

export default router;

