import { Response } from 'express';
import Tool from '../models/Tool';
import { AuthRequest } from '../middleware/auth';

export const getTools = async (req: AuthRequest, res: Response) => {
  try {
    const tools = await Tool.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json(tools);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const createTool = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, tags, icon } = req.body;

    const tool = new Tool({
      name,
      description,
      tags,
      icon,
      userId: req.userId
    });

    await tool.save();
    res.status(201).json(tool);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const updateTool = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, tags, icon } = req.body;

    const tool = await Tool.findOneAndUpdate(
      { _id: id, userId: req.userId },
      { name, description, tags, icon },
      { new: true }
    );

    if (!tool) {
      return res.status(404).json({ message: 'Tool not found' });
    }

    res.json(tool);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const deleteTool = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const tool = await Tool.findOneAndDelete({ _id: id, userId: req.userId });

    if (!tool) {
      return res.status(404).json({ message: 'Tool not found' });
    }

    res.json({ message: 'Tool deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};
