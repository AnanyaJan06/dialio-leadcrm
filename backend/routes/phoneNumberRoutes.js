import express from 'express';
import {
  assignNumberToUser,
  listMyAssignedNumbers,
  listOwnedNumbers,
  setMyDefaultNumber,
  setDefaultNumberForUser,
  syncPurchasedNumbers
} from '../controller/phoneNumberController.js';
import { requireAdmin } from '../controller/authController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/me', listMyAssignedNumbers);
router.patch('/me/default', setMyDefaultNumber);

router.use(requireAdmin);

router.get('/', listOwnedNumbers);
router.post('/import', syncPurchasedNumbers);
router.patch('/:id/assign', assignNumberToUser);
router.patch('/:id/default', setDefaultNumberForUser);

export default router;
