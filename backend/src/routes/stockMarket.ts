import { Router, Response, NextFunction } from 'express';
import https from 'https';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { chatCompletion } from '../utils/llmService';
import { logInfo, logError, logWarn } from '../utils/logger';
import type { LLMMessage } from '../utils/llmService';

const router = Router();

// Simple in-memory rate limiter
const quoteRateLimitMap = new Map<number, number[]>();
const chatRateLimitMap = new Map<number, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const QUOTE_RATE_LIMIT_MAX = 30;
const CHAT_RATE_LIMIT_MAX = 10;

const quoteRateLimit = (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.userId!;
  const now = Date.now();
  const timestamps = (quoteRateLimitMap.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= QUOTE_RATE_LIMIT_MAX) {
    logWarn('stock_quote_rate_limit_exceeded', { userId });
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  timestamps.push(now);
  quoteRateLimitMap.set(userId, timestamps);
  next();
};

const chatRateLimit = (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.userId!;
  const now = Date.now();
  const timestamps = (chatRateLimitMap.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= CHAT_RATE_LIMIT_MAX) {
    logWarn('stock_chat_rate_limit_exceeded', { userId });
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  timestamps.push(now);
  chatRateLimitMap.set(userId, timestamps);
  next();
};

interface StockQuote {
  code: string;
  name: string;
  currentPrice: number;
  yesterdayClose: number;
  todayOpen: number;
  todayHigh: number;
  todayLow: number;
  changeAmount: number;
  changePercent: number;
  volume: number;
  amount: number;
}

function convertToSecid(code: string): string {
  const code6 = code.slice(2);
  const prefix = code.slice(0, 2);
  return prefix === 'sh' ? `1.${code6}` : `0.${code6}`;
}

async function fetchEastmoneyQuotes(codes: string[]): Promise<StockQuote[]> {
  const secids = codes.map(convertToSecid).join(',');
  const fields = 'f2,f3,f4,f5,f6,f7,f12,f13,f14,f15,f16,f17,f18';
  const path = `/api/qt/ulist.np/get?secids=${encodeURIComponent(secids)}&fields=${fields}&fltt=2&invt=2`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'push2.eastmoney.com',
        port: 443,
        path,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.eastmoney.com',
        },
        timeout: 10000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString('utf-8');
            const json = JSON.parse(text);
            const items: any[] = json?.data?.diff ?? [];
            const quotes: StockQuote[] = items.map((item: any) => {
              const marketPrefix = item.f13 === 1 ? 'sh' : 'sz';
              const code = `${marketPrefix}${item.f12}`;
              const currentPrice = Number(item.f2) || 0;
              const yesterdayClose = Number(item.f18) || 0;
              return {
                code,
                name: item.f14 || '',
                currentPrice,
                yesterdayClose,
                todayOpen: Number(item.f17) || 0,
                todayHigh: Number(item.f15) || 0,
                todayLow: Number(item.f16) || 0,
                changeAmount: Number(item.f4) || parseFloat((currentPrice - yesterdayClose).toFixed(2)),
                changePercent: Number(item.f3) || 0,
                volume: Number(item.f5) || 0,
                amount: Number(item.f6) || 0,
              };
            });
            resolve(quotes);
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Stock data request timed out')));
    req.on('error', reject);
    req.end();
  });
}

// GET /api/stock-market/quote?codes=sh000001,sz399001
router.get('/quote', authMiddleware, quoteRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { codes } = req.query;

    if (!codes || typeof codes !== 'string') {
      return res.status(400).json({ error: 'codes parameter required' });
    }

    const codeList = codes
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter((c) => /^(sh|sz)\d{6}$/.test(c))
      .slice(0, 30);

    if (codeList.length === 0) {
      return res.status(400).json({ error: 'Invalid stock codes' });
    }

    logInfo('stock_market_quote', { userId: req.userId, codes: codeList });
    const quotes = await fetchEastmoneyQuotes(codeList);
    res.json({ quotes });
  } catch (error) {
    logError('stock_market_quote_error', error as Error);
    res.status(500).json({ error: (error as Error).message || 'Failed to fetch stock data' });
  }
});

// POST /api/stock-market/chat
router.post('/chat', authMiddleware, chatRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { messages } = req.body as { messages: LLMMessage[] };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const systemMessage: LLMMessage = {
      role: 'system',
      content: `你是一位专业的股市分析助手，精通A股、港股、美股等市场分析。你可以帮助用户：
- 分析个股走势和基本面（PE、PB、ROE、营收增速等核心指标）
- 解读大盘行情、板块热点和市场情绪
- 讲解技术分析指标（K线形态、均线、MACD、RSI、布林带等）
- 分析宏观经济政策对股市的影响
- 提供投资策略建议和仓位管理思路
- 解答股市基础知识和名词解释

请提供专业、客观的分析，语言简洁清晰，适当使用数据和举例说明。
重要声明：所有分析仅供参考学习，不构成投资建议。股市有风险，投资须谨慎。`,
    };

    logInfo('stock_market_chat', { userId: req.userId, messageCount: messages.length });
    const result = await chatCompletion([systemMessage, ...messages]);

    res.json({ reply: result.content, usage: result.usage });
  } catch (error) {
    logError('stock_market_chat_error', error as Error);
    res.status(500).json({ error: (error as Error).message || 'AI chat failed' });
  }
});

export default router;
