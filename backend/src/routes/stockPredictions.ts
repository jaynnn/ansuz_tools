import { Router, Response } from 'express';
import { dbRun, dbGet, dbAll, dbTransaction } from '../utils/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logInfo, logError, logWarn } from '../utils/logger';

const router = Router();

// Get all stock predictions for the current user
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    logInfo('get_stock_predictions', { userId: req.userId });
    
    const predictions = await dbAll(
      'SELECT * FROM stock_predictions WHERE user_id = ? ORDER BY created_at DESC',
      [req.userId]
    );
    
    // Convert database format to frontend format
    const formattedPredictions = predictions.map((p: any) => ({
      id: p.id.toString(),
      stockInfo: p.stock_info,
      predictionDate: p.prediction_date,
      predictedChange: p.predicted_change,
      predictedPercent: p.predicted_percent,
      actualChange: p.actual_change,
      actualPercent: p.actual_percent,
      isComplete: p.is_complete === 1,
    }));

    logInfo('get_stock_predictions_success', { 
      userId: req.userId, 
      count: formattedPredictions.length 
    });
    res.json({ predictions: formattedPredictions });
  } catch (error) {
    logError('get_stock_predictions_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific stock prediction
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    logInfo('get_stock_prediction', { userId: req.userId, predictionId: req.params.id });
    
    const prediction: any = await dbGet(
      'SELECT * FROM stock_predictions WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    
    if (!prediction) {
      logWarn('get_stock_prediction_not_found', { 
        userId: req.userId, 
        predictionId: req.params.id 
      });
      return res.status(404).json({ error: 'Stock prediction not found' });
    }

    // Convert database format to frontend format
    const formattedPrediction = {
      id: prediction.id.toString(),
      stockInfo: prediction.stock_info,
      predictionDate: prediction.prediction_date,
      predictedChange: prediction.predicted_change,
      predictedPercent: prediction.predicted_percent,
      actualChange: prediction.actual_change,
      actualPercent: prediction.actual_percent,
      isComplete: prediction.is_complete === 1,
    };

    logInfo('get_stock_prediction_success', { 
      userId: req.userId, 
      predictionId: req.params.id 
    });
    res.json({ prediction: formattedPrediction });
  } catch (error) {
    logError('get_stock_prediction_error', error as Error, { 
      userId: req.userId, 
      predictionId: req.params.id 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new stock prediction
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const {
      stockInfo,
      predictionDate,
      predictedChange,
      predictedPercent,
      actualChange,
      actualPercent,
      isComplete,
    } = req.body;

    logInfo('create_stock_prediction', { 
      userId: req.userId,
      requestBody: req.body
    });

    if (!predictedChange || !actualChange) {
      logWarn('create_stock_prediction_validation_failed', {
        userId: req.userId,
        missingFields: {
          predictedChange: !predictedChange,
          actualChange: !actualChange
        }
      });
      return res.status(400).json({ error: 'Predicted change and actual change are required' });
    }

    const result = await dbRun(
      `INSERT INTO stock_predictions 
        (user_id, stock_info, prediction_date, predicted_change, predicted_percent, actual_change, actual_percent, is_complete) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.userId,
        stockInfo || '',
        predictionDate || null,
        predictedChange,
        predictedPercent || 0,
        actualChange,
        actualPercent || 0,
        isComplete ? 1 : 0,
      ]
    );

    const createdPrediction = {
      id: (result as any).lastID.toString(),
      stockInfo,
      predictionDate,
      predictedChange,
      predictedPercent: predictedPercent || 0,
      actualChange,
      actualPercent: actualPercent || 0,
      isComplete: isComplete || false,
    };

    logInfo('create_stock_prediction_success', { 
      userId: req.userId, 
      predictionId: createdPrediction.id 
    });

    res.status(201).json({
      message: 'Stock prediction created successfully',
      prediction: createdPrediction
    });
  } catch (error) {
    logError('create_stock_prediction_error', error as Error, { 
      userId: req.userId,
      requestBody: req.body
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a stock prediction
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const {
      stockInfo,
      predictionDate,
      predictedChange,
      predictedPercent,
      actualChange,
      actualPercent,
      isComplete,
    } = req.body;

    logInfo('update_stock_prediction', { 
      userId: req.userId,
      predictionId: req.params.id,
      requestBody: req.body
    });

    // Validate required fields
    if (!predictedChange || !actualChange) {
      logWarn('update_stock_prediction_validation_failed', {
        userId: req.userId,
        predictionId: req.params.id,
        missingFields: {
          predictedChange: !predictedChange,
          actualChange: !actualChange
        }
      });
      return res.status(400).json({ error: 'Predicted change and actual change are required' });
    }

    // Check if prediction exists and belongs to user
    const prediction = await dbGet(
      'SELECT * FROM stock_predictions WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    
    if (!prediction) {
      logWarn('update_stock_prediction_not_found', { 
        userId: req.userId, 
        predictionId: req.params.id 
      });
      return res.status(404).json({ error: 'Stock prediction not found' });
    }

    await dbRun(
      `UPDATE stock_predictions 
       SET stock_info = ?, prediction_date = ?, predicted_change = ?, predicted_percent = ?, 
           actual_change = ?, actual_percent = ?, is_complete = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [
        stockInfo !== undefined ? stockInfo : prediction.stock_info,
        predictionDate !== undefined ? (predictionDate || null) : prediction.prediction_date,
        predictedChange,
        predictedPercent !== undefined ? (predictedPercent || 0) : prediction.predicted_percent,
        actualChange,
        actualPercent !== undefined ? (actualPercent || 0) : prediction.actual_percent,
        isComplete !== undefined ? (isComplete ? 1 : 0) : prediction.is_complete,
        req.params.id,
        req.userId,
      ]
    );

    const updatedPrediction = {
      id: req.params.id,
      stockInfo: stockInfo !== undefined ? stockInfo : prediction.stock_info,
      predictionDate: predictionDate !== undefined ? predictionDate : prediction.prediction_date,
      predictedChange,
      predictedPercent: predictedPercent !== undefined ? (predictedPercent || 0) : prediction.predicted_percent,
      actualChange,
      actualPercent: actualPercent !== undefined ? (actualPercent || 0) : prediction.actual_percent,
      isComplete: isComplete !== undefined ? (isComplete || false) : (prediction.is_complete === 1),
    };

    logInfo('update_stock_prediction_success', { 
      userId: req.userId, 
      predictionId: req.params.id 
    });

    res.json({
      message: 'Stock prediction updated successfully',
      prediction: updatedPrediction
    });
  } catch (error) {
    logError('update_stock_prediction_error', error as Error, { 
      userId: req.userId,
      predictionId: req.params.id,
      requestBody: req.body
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a stock prediction
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    logInfo('delete_stock_prediction', { 
      userId: req.userId, 
      predictionId: req.params.id 
    });

    // Check if prediction exists and belongs to user
    const prediction = await dbGet(
      'SELECT * FROM stock_predictions WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    
    if (!prediction) {
      logWarn('delete_stock_prediction_not_found', { 
        userId: req.userId, 
        predictionId: req.params.id 
      });
      return res.status(404).json({ error: 'Stock prediction not found' });
    }

    await dbRun(
      'DELETE FROM stock_predictions WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );

    logInfo('delete_stock_prediction_success', { 
      userId: req.userId, 
      predictionId: req.params.id 
    });

    res.json({ message: 'Stock prediction deleted successfully' });
  } catch (error) {
    logError('delete_stock_prediction_error', error as Error, { 
      userId: req.userId, 
      predictionId: req.params.id 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Batch create/update stock predictions (for migration from localStorage)
router.post('/batch', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { predictions } = req.body;

    logInfo('batch_create_stock_predictions', { 
      userId: req.userId,
      count: Array.isArray(predictions) ? predictions.length : 0
    });

    if (!Array.isArray(predictions)) {
      logWarn('batch_create_validation_failed', {
        userId: req.userId,
        error: 'Predictions must be an array'
      });
      return res.status(400).json({ error: 'Predictions must be an array' });
    }

    const results = await dbTransaction(async () => {
      const batchResults = [];
      
      for (const pred of predictions) {
        const {
          stockInfo,
          predictionDate,
          predictedChange,
          predictedPercent,
          actualChange,
          actualPercent,
          isComplete,
        } = pred;

        const result = await dbRun(
          `INSERT INTO stock_predictions 
            (user_id, stock_info, prediction_date, predicted_change, predicted_percent, actual_change, actual_percent, is_complete) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.userId,
            stockInfo || '',
            predictionDate || null,
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
          predictionDate: predictionDate || undefined,
          predictedChange,
          predictedPercent: predictedPercent || 0,
          actualChange,
          actualPercent: actualPercent || 0,
          isComplete: isComplete || false,
        });
      }
      
      return batchResults;
    });

    logInfo('batch_create_stock_predictions_success', { 
      userId: req.userId,
      count: results.length
    });

    res.status(201).json({
      message: `${results.length} stock predictions created successfully`,
      predictions: results
    });
  } catch (error) {
    logError('batch_create_stock_predictions_error', error as Error, { 
      userId: req.userId,
      requestBody: req.body
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
