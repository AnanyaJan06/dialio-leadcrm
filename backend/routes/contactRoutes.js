import express from 'express';
import { addContact, getContacts, deleteContact } from '../controller/contactController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', authMiddleware, addContact);
router.get('/', authMiddleware, getContacts);
router.delete('/:id', authMiddleware, deleteContact);

export default router;