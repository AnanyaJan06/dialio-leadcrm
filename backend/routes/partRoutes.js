import express from 'express';
import {
  createPart,
  deletePart,
  getGoogleSheetSyncConfig,
  getParts,
  syncGoogleSheetParts,
  updatePart,
  uploadPartImage,
} from '../controller/partController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/upload-image', authMiddleware, express.raw({ type: 'image/*', limit: '10mb' }), uploadPartImage);
router.post('/sync-sheet', authMiddleware, syncGoogleSheetParts);
router.get('/sync-config', authMiddleware, getGoogleSheetSyncConfig);
router.post('/', authMiddleware, createPart);
router.get('/', authMiddleware, getParts);
router.put('/:id', authMiddleware, updatePart);
router.delete('/:id', authMiddleware, deletePart);

export default router;

