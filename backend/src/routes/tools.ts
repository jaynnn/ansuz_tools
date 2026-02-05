import express from 'express';
import { getTools, createTool, updateTool, deleteTool } from '../controllers/toolController';
import { auth } from '../middleware/auth';

const router = express.Router();

router.get('/', auth, getTools);
router.post('/', auth, createTool);
router.put('/:id', auth, updateTool);
router.delete('/:id', auth, deleteTool);

export default router;
