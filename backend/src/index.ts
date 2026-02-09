import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { initDatabase } from './utils/database';
import logger, { logInfo, logError } from './utils/logger';
import authRoutes from './routes/auth';
import toolsRoutes from './routes/tools';
import stockPredictionsRoutes from './routes/stockPredictions';
import llmRoutes from './routes/llm';
import mbtiRoutes from './routes/mbti';

// Load environment variables
dotenv.config();

// Validate required environment variables
if (!process.env.JWT_SECRET) {
  const errorMsg = 'FATAL ERROR: JWT_SECRET is not defined in environment variables';
  console.error(errorMsg);
  logError('startup_error', new Error(errorMsg));
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logInfo('http_request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    });
  });
  
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tools', toolsRoutes);
app.use('/api/stock-predictions', stockPredictionsRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/mbti', mbtiRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Serve frontend static files in production
const frontendDistPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath));

// Fallback to index.html for client-side routing (must be last route)
app.use((req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

// Initialize database and start server
const startServer = async () => {
  try {
    logInfo('server_starting', { port: PORT, nodeEnv: process.env.NODE_ENV });
    await initDatabase();
    app.listen(PORT, () => {
      const message = `Server is running on port ${PORT}`;
      console.log(message);
      logInfo('server_started', { port: PORT });
    });
  } catch (error) {
    const errorMsg = 'Failed to start server';
    console.error(errorMsg, error);
    logError('server_startup_failed', error as Error);
    process.exit(1);
  }
};

startServer();
