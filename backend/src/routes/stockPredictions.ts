import { Router, Response } from 'express';
import { dbRun, dbGet, dbAll, dbTransaction } from '../utils/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all stock predictions for the current user
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const predictions = await dbAll(
      'SELECT * FROM stock_predictions WHERE user_id = ? ORDER BY created_at DESC',
      [req.userId]
    );
    
    // Convert database format to frontend format
    const formattedPredictions = predictions.map((p: any) => ({
      id: p.id.toString(),
      stockInfo: p.stock_info,
      predictedChange: p.predicted_change,
      predictedPercent: p.predicted_percent,
      actualChange: p.actual_change,
      actualPercent: p.actual_percent,
      isComplete: p.is_complete === 1,
    }));

    res.json({ predictions: formattedPredictions });
  } catch (error) {
    console.error('Get stock predictions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific stock prediction
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const prediction: any = await dbGet(
      'SELECT * FROM stock_predictions WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    
    if (!prediction) {
      return res.status(404).json({ error: 'Stock prediction not found' });
    }

    // Convert database format to frontend format
    const formattedPrediction = {
      id: prediction.id.toString(),
      stockInfo: prediction.stock_info,
      predictedChange: prediction.predicted_change,
      predictedPercent: prediction.predicted_percent,
      actualChange: prediction.actual_change,
      actualPercent: prediction.actual_percent,
      isComplete: prediction.is_complete === 1,
    };

    res.json({ prediction: formattedPrediction });
  } catch (error) {
    console.error('Get stock prediction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new stock prediction
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const {
      stockInfo,
      predictedChange,
      predictedPercent,
      actualChange,
      actualPercent,
      isComplete,
    } = req.body;

    if (!predictedChange || !actualChange) {
      return res.status(400).json({ error: 'Predicted change and actual change are required' });
    }

    const result = await dbRun(
      `INSERT INTO stock_predictions 
        (user_id, stock_info, predicted_change, predicted_percent, actual_change, actual_percent, is_complete) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.userId,
        stockInfo || '',
        predictedChange,
        predictedPercent || 0,
        actualChange,
        actualPercent || 0,
        isComplete ? 1 : 0,
      ]
    );

    res.status(201).json({
      message: 'Stock prediction created successfully',
      prediction: {
        id: (result as any).lastID.toString(),
        stockInfo,
        predictedChange,
        predictedPercent: predictedPercent || 0,
        actualChange,
        actualPercent: actualPercent || 0,
        isComplete: isComplete || false,
      }
    });
  } catch (error) {
    console.error('Create stock prediction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a stock prediction
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const {
      stockInfo,
      predictedChange,
      predictedPercent,
      actualChange,
      actualPercent,
      isComplete,
    } = req.body;

    // Check if prediction exists and belongs to user
    const prediction = await dbGet(
      'SELECT * FROM stock_predictions WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    
    if (!prediction) {
      return res.status(404).json({ error: 'Stock prediction not found' });
    }

    await dbRun(
      `UPDATE stock_predictions 
       SET stock_info = ?, predicted_change = ?, predicted_percent = ?, 
           actual_change = ?, actual_percent = ?, is_complete = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [
        stockInfo,
        predictedChange,
        predictedPercent || 0,
        actualChange,
        actualPercent || 0,
        isComplete ? 1 : 0,
        req.params.id,
        req.userId,
      ]
    );

    res.json({
      message: 'Stock prediction updated successfully',
      prediction: {
        id: req.params.id,
        stockInfo,
        predictedChange,
        predictedPercent: predictedPercent || 0,
        actualChange,
        actualPercent: actualPercent || 0,
        isComplete: isComplete || false,
      }
    });
  } catch (error) {
    console.error('Update stock prediction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a stock prediction
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Check if prediction exists and belongs to user
    const prediction = await dbGet(
      'SELECT * FROM stock_predictions WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    
    if (!prediction) {
      return res.status(404).json({ error: 'Stock prediction not found' });
    }

    await dbRun(
      'DELETE FROM stock_predictions WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );

    res.json({ message: 'Stock prediction deleted successfully' });
  } catch (error) {
    console.error('Delete stock prediction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Batch create/update stock predictions (for migration from localStorage)
router.post('/batch', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { predictions } = req.body;

    if (!Array.isArray(predictions)) {
      return res.status(400).json({ error: 'Predictions must be an array' });
    }

    const results = await dbTransaction(async () => {
      const batchResults = [];
      
      for (const pred of predictions) {
        const {
          stockInfo,
          predictedChange,
          predictedPercent,
          actualChange,
          actualPercent,
          isComplete,
        } = pred;

        const result = await dbRun(
          `INSERT INTO stock_predictions 
            (user_id, stock_info, predicted_change, predicted_percent, actual_change, actual_percent, is_complete) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            req.userId,
            stockInfo || '',
            predictedChange,
            predictedPercent || 0,
            actualChange,
            actualPercent || 0,
            isComplete ? 1 : 0,
          ]
        );

        batchResults.push({
          id: (result as any).lastID.toString(),
          stockInfo: stockInfo || '',
          predictedChange,
          predictedPercent: predictedPercent || 0,
          actualChange,
          actualPercent: actualPercent || 0,
          isComplete: isComplete || false,
        });
      }
      
      return batchResults;
    });

    res.status(201).json({
      message: `${results.length} stock predictions created successfully`,
      predictions: results
    });
  } catch (error) {
    console.error('Batch create stock predictions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
