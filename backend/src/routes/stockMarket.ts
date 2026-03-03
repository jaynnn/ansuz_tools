import { Router, Response, NextFunction } from 'express';
import https from 'https';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { chatCompletion } from '../utils/llmService';
import { logInfo, logError, logWarn } from '../utils/logger';
import { dbRun, dbGet, dbAll } from '../utils/database';
import type { LLMMessage } from '../utils/llmService';

const router = Router();

// Simple in-memory rate limiter
const quoteRateLimitMap = new Map<number, number[]>();
const chatRateLimitMap = new Map<number, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const QUOTE_RATE_LIMIT_MAX = 30;
const CHAT_RATE_LIMIT_MAX = 10;

const DIARY_MAX_TITLE_LENGTH = 200;
const DIARY_MAX_CONTENT_LENGTH = 10000;

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

const tradingReadRateLimitMap = new Map<number, number[]>();
const tradingWriteRateLimitMap = new Map<number, number[]>();
const TRADING_READ_MAX = 60;  // 60 reads per minute
const TRADING_WRITE_MAX = 20; // 20 writes per minute

const diaryReadRateLimitMap = new Map<number, number[]>();
const diaryWriteRateLimitMap = new Map<number, number[]>();
const DIARY_READ_MAX = 60;
const DIARY_WRITE_MAX = 20;

const tradingReadRateLimit = (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.userId!;
  const now = Date.now();
  const timestamps = (tradingReadRateLimitMap.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= TRADING_READ_MAX) {
    logWarn('stock_trading_read_rate_limit_exceeded', { userId });
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  timestamps.push(now);
  tradingReadRateLimitMap.set(userId, timestamps);
  next();
};

const tradingWriteRateLimit = (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.userId!;
  const now = Date.now();
  const timestamps = (tradingWriteRateLimitMap.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= TRADING_WRITE_MAX) {
    logWarn('stock_trading_write_rate_limit_exceeded', { userId });
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  timestamps.push(now);
  tradingWriteRateLimitMap.set(userId, timestamps);
  next();
};

const diaryReadRateLimit = (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.userId!;
  const now = Date.now();
  const timestamps = (diaryReadRateLimitMap.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= DIARY_READ_MAX) {
    logWarn('stock_diary_read_rate_limit_exceeded', { userId });
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  timestamps.push(now);
  diaryReadRateLimitMap.set(userId, timestamps);
  next();
};

const diaryWriteRateLimit = (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.userId!;
  const now = Date.now();
  const timestamps = (diaryWriteRateLimitMap.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= DIARY_WRITE_MAX) {
    logWarn('stock_diary_write_rate_limit_exceeded', { userId });
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  timestamps.push(now);
  diaryWriteRateLimitMap.set(userId, timestamps);
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * SQLite's CURRENT_TIMESTAMP stores in UTC as "YYYY-MM-DD HH:MM:SS" without
 * timezone info. Appending 'Z' turns it into a proper ISO-8601 UTC string so
 * browsers (and JavaScript's Date constructor) correctly convert it to local time.
 */
function normalizeTimestamp(ts: string | null | undefined): string {
  if (!ts) return '';
  // Already has timezone info: contains 'T' (ISO format with optional Z/offset) or ends with 'Z'
  if (ts.includes('T') || ts.endsWith('Z')) return ts;
  // "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SSZ"
  return ts.replace(' ', 'T') + 'Z';
}

/**
 * Returns today's date in YYYY-MM-DD format using the configured server timezone
 * (default: Asia/Shanghai). Used for A-share T+1 rule enforcement.
 */
function getTodayTradeDate(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: process.env.SERVER_TIMEZONE || 'Asia/Shanghai' });
}

/**
 * Returns true when a security is a T+0 product (can be bought and sold on the same day).
 *
 * A-share T+0 ETF types (per CSRC settlement rules):
 *   - 跨境/QDII ETF  (cross-border / overseas-index ETF)
 *   - 债券 ETF        (bond ETF)
 *   - 黄金 ETF        (gold ETF)
 *   - 货币 ETF        (monetary / money-market ETF)
 *   - 商品 ETF        (commodity ETF)
 *
 * Everything else — regular A-share stocks and domestic equity/mixed/broad-based ETFs
 * — follows the T+1 rule (shares bought today cannot be sold until the next trading day).
 */
function isT0Product(code: string, name: string): boolean {
  const n = name;
  const c = code.toLowerCase();

  // Gold ETF
  if (/黄金/.test(n)) return true;

  // Monetary / cash-management ETF
  if (/货币|日利|现金宝/.test(n)) return true;

  // Bond ETF (国债, 政金债, 企债, 公司债, 城投债, 可转债 ETF, etc.)
  if (/国债ETF|政金债|企债ETF|公司债ETF|债券ETF|可转债ETF/.test(n)) return true;

  // Cross-border / QDII ETF — name references foreign market
  if (/纳指|纳斯达克|标普|道琼斯|恒生|日经|港股|美股|QDII|A50|印度|越南|德国|法国|韩国|东南亚|海外/.test(n)) return true;

  // Shanghai cross-border ETF codes: sh513xxx
  if (/^sh513/.test(c)) return true;

  // Commodity ETF
  if (/原油|豆粕|有色金属|铜ETF|能源ETF|商品ETF/.test(n)) return true;

  return false;
}

// ─── Financial News ──────────────────────────────────────────────────────────

interface NewsItem {
  title: string;
  summary: string;
}

interface QuanmiaoTopic {
  HotTopic?: string;
  TextSummary?: string;
}

// In-memory news cache to avoid hammering the news API every bot cycle
let newsCache: { items: NewsItem[]; fetchedAt: number } | null = null;
const NEWS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const NEWS_ITEMS_LIMIT = 8;

/**
 * Fetch hot-topic news from Alibaba Cloud Quanmiao (全妙) service.
 * Requires env vars: ALIBABA_CLOUD_ACCESS_KEY_ID, ALIBABA_CLOUD_ACCESS_KEY_SECRET, WORKSPACE_ID.
 * Falls back to EastMoney 快讯 when credentials are absent or the call fails.
 */
async function fetchFinancialNews(): Promise<NewsItem[]> {
  const now = Date.now();
  if (newsCache && now - newsCache.fetchedAt < NEWS_CACHE_TTL_MS) {
    return newsCache.items;
  }

  // ── Primary: Quanmiao (Alibaba Cloud aimiaobi) ──────────────────────────
  const akId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
  const akSecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
  const workspaceId = process.env.WORKSPACE_ID;

  if (akId && akSecret && workspaceId) {
    try {
      // Dynamically import to avoid loading the SDK when credentials are absent
      const OpenApi = await import('@alicloud/openapi-client');
      const $Util = await import('@alicloud/tea-util');

      const config = new OpenApi.Config({
        signatureVersion: 'V3',
        accessKeyId: akId,
        accessKeySecret: akSecret,
        endpoint: 'aimiaobi.cn-beijing.aliyuncs.com',
      });
      const client = new OpenApi.default(config);

      const runtime = new $Util.RuntimeOptions({ readTimeout: 10000, connectTimeout: 10000 });
      const request = new OpenApi.OpenApiRequest();
      request.body = { WorkspaceId: workspaceId, Size: NEWS_ITEMS_LIMIT, Locations: [] as string[] };

      const result = await client.doRPCRequest(
        'GetHotTopicBroadcast', '2023-08-01', 'https', 'POST', 'AK', 'json', request, runtime
      );
      const topics: QuanmiaoTopic[] = result?.body?.Data?.Data ?? [];
      const items: NewsItem[] = topics.map((t: QuanmiaoTopic) => ({
        title: t.HotTopic || '',
        summary: t.TextSummary || '',
      })).filter((i: NewsItem) => i.title);

      if (items.length > 0) {
        newsCache = { items, fetchedAt: Date.now() };
        return items;
      }
    } catch (err) {
      logWarn('quanmiao_news_error', { message: (err as Error).message });
      // Fall through to EastMoney backup
    }
  }

  // ── Fallback: EastMoney 快讯 ─────────────────────────────────────────────
  return new Promise((resolve) => {
    const path = '/kuaixun/v1/getlistbyft.aspx?rtntype=2&ft=f&pageindex=1&pagesize=8';
    const req = https.request(
      {
        hostname: 'newsapi.eastmoney.com',
        port: 443,
        path,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.eastmoney.com',
        },
        timeout: 8000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString('utf-8');
            const jsonText = text.replace(/^[^(]*\(/, '').replace(/\)[^)]*$/, '').trim();
            const json = JSON.parse(jsonText.length ? jsonText : text);
            const list: any[] = json?.LiveList ?? json?.list ?? [];
            const items: NewsItem[] = list.slice(0, NEWS_ITEMS_LIMIT).map((item: any) => ({
              title: item.title || item.Title || '',
              summary: item.digest || item.Digest || '',
            })).filter((i: NewsItem) => i.title);
            newsCache = { items, fetchedAt: Date.now() };
            resolve(items);
          } catch {
            resolve(newsCache?.items ?? []);
          }
        });
      }
    );
    req.on('timeout', () => { req.destroy(); resolve(newsCache?.items ?? []); });
    req.on('error', () => resolve(newsCache?.items ?? []));
    req.end();
  });
}

// ─── Watchlist ───────────────────────────────────────────────────────────────

// GET /api/stock-market/watchlist
router.get('/watchlist', authMiddleware, tradingReadRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const rows = await dbAll(
      'SELECT stock_code FROM stock_watchlist WHERE user_id = ? ORDER BY created_at ASC',
      [req.userId]
    );
    const codes = rows.map((r: any) => r.stock_code);
    res.json({ codes });
  } catch (error) {
    logError('stock_watchlist_get_error', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// PUT /api/stock-market/watchlist  (replace entire list)
router.put('/watchlist', authMiddleware, tradingWriteRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { codes } = req.body as { codes: string[] };
    if (!Array.isArray(codes)) return res.status(400).json({ error: 'codes array required' });

    const validCodes = codes
      .map((c: string) => c.trim().toLowerCase())
      .filter((c: string) => /^(sh|sz)\d{6}$/.test(c))
      .slice(0, 50);

    await dbRun('DELETE FROM stock_watchlist WHERE user_id = ?', [req.userId]);
    for (const code of validCodes) {
      await dbRun(
        'INSERT OR IGNORE INTO stock_watchlist (user_id, stock_code) VALUES (?, ?)',
        [req.userId, code]
      );
    }
    res.json({ codes: validCodes });
  } catch (error) {
    logError('stock_watchlist_put_error', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

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

// ─── Virtual Trading System ───────────────────────────────────────────────────

const INITIAL_BALANCE = 1000000; // 100万初始资金

async function ensureAccount(userId: number) {
  const existing = await dbGet('SELECT * FROM stock_trading_accounts WHERE user_id = ?', [userId]);
  if (!existing) {
    await dbRun(
      'INSERT INTO stock_trading_accounts (user_id, balance) VALUES (?, ?)',
      [userId, INITIAL_BALANCE]
    );
    return { balance: INITIAL_BALANCE };
  }
  return existing;
}

// GET /api/stock-market/trading/account
router.get('/trading/account', authMiddleware, tradingReadRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const account = await ensureAccount(req.userId!);
    const holdings = await dbAll(
      'SELECT * FROM stock_trading_holdings WHERE user_id = ? AND quantity > 0',
      [req.userId]
    );
    res.json({ balance: account.balance, holdings });
  } catch (error) {
    logError('stock_trading_account_error', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/stock-market/trading/buy  { code, name, quantity, price }
router.post('/trading/buy', authMiddleware, tradingWriteRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, quantity, price } = req.body as {
      code: string; name: string; quantity: number; price: number;
    };
    if (!code || !quantity || !price || quantity <= 0 || price <= 0) {
      return res.status(400).json({ error: '参数错误' });
    }

    const account = await ensureAccount(req.userId!);
    const total = quantity * price;

    if (account.balance < total) {
      return res.status(400).json({ error: `余额不足，需要 ¥${total.toFixed(2)}，当前余额 ¥${account.balance.toFixed(2)}` });
    }

    // Deduct balance
    await dbRun(
      'UPDATE stock_trading_accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [total, req.userId]
    );

    // Update holdings (upsert)
    const existing = await dbGet(
      'SELECT * FROM stock_trading_holdings WHERE user_id = ? AND stock_code = ?',
      [req.userId, code]
    );
    const buyDate = getTodayTradeDate();
    if (existing) {
      const newQty = existing.quantity + quantity;
      const newAvgCost = (existing.avg_cost * existing.quantity + price * quantity) / newQty;
      // Note: updating last_buy_date locks the entire position for T+1 (conservative simplification;
      // per-lot tracking would be needed to allow selling pre-existing shares separately).
      await dbRun(
        'UPDATE stock_trading_holdings SET quantity = ?, avg_cost = ?, stock_name = ?, last_buy_date = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND stock_code = ?',
        [newQty, newAvgCost, name || existing.stock_name, buyDate, req.userId, code]
      );
    } else {
      await dbRun(
        'INSERT INTO stock_trading_holdings (user_id, stock_code, stock_name, quantity, avg_cost, last_buy_date) VALUES (?, ?, ?, ?, ?, ?)',
        [req.userId, code, name, quantity, price, buyDate]
      );
    }

    // Record order
    await dbRun(
      'INSERT INTO stock_trading_orders (user_id, stock_code, stock_name, action, quantity, price, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.userId, code, name, 'buy', quantity, price, total]
    );

    logInfo('stock_trading_buy', { userId: req.userId, code, quantity, price, total });
    const updatedAccount = await dbGet('SELECT balance FROM stock_trading_accounts WHERE user_id = ?', [req.userId]);
    res.json({ message: '买入成功', balance: updatedAccount.balance });
  } catch (error) {
    logError('stock_trading_buy_error', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/stock-market/trading/sell  { code, quantity, price }
router.post('/trading/sell', authMiddleware, tradingWriteRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { code, quantity, price } = req.body as { code: string; quantity: number; price: number };
    if (!code || !quantity || !price || quantity <= 0 || price <= 0) {
      return res.status(400).json({ error: '参数错误' });
    }

    const holding = await dbGet(
      'SELECT * FROM stock_trading_holdings WHERE user_id = ? AND stock_code = ?',
      [req.userId, code]
    );
    if (!holding || holding.quantity < quantity) {
      return res.status(400).json({ error: `持仓不足，当前持有 ${holding?.quantity ?? 0} 股` });
    }

    // Enforce A-share T+1: domestic equity/mixed/broad-based ETFs and regular stocks
    // cannot be sold on the same day they were purchased.
    // Cross-border, bond, gold, monetary, and commodity ETFs are T+0 and are exempt.
    const todayDate = getTodayTradeDate();
    if (holding.last_buy_date === todayDate && !isT0Product(code, holding.stock_name)) {
      return res.status(400).json({ error: `T+1限制：${holding.stock_name} 今日买入的股份须等到下一个交易日才能卖出` });
    }

    const total = quantity * price;

    // Add balance
    await dbRun(
      'UPDATE stock_trading_accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [total, req.userId]
    );

    // Update holdings
    const newQty = holding.quantity - quantity;
    if (newQty === 0) {
      await dbRun(
        'DELETE FROM stock_trading_holdings WHERE user_id = ? AND stock_code = ?',
        [req.userId, code]
      );
    } else {
      await dbRun(
        'UPDATE stock_trading_holdings SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND stock_code = ?',
        [newQty, req.userId, code]
      );
    }

    // Record order
    await dbRun(
      'INSERT INTO stock_trading_orders (user_id, stock_code, stock_name, action, quantity, price, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.userId, code, holding.stock_name, 'sell', quantity, price, total]
    );

    logInfo('stock_trading_sell', { userId: req.userId, code, quantity, price, total });
    const updatedAccount = await dbGet('SELECT balance FROM stock_trading_accounts WHERE user_id = ?', [req.userId]);
    res.json({ message: '卖出成功', balance: updatedAccount.balance });
  } catch (error) {
    logError('stock_trading_sell_error', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/stock-market/trading/orders
router.get('/trading/orders', authMiddleware, tradingReadRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const orders = await dbAll(
      'SELECT * FROM stock_trading_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
      [req.userId]
    );
    res.json({ orders: orders.map((o: any) => ({ ...o, created_at: normalizeTimestamp(o.created_at) })) });
  } catch (error) {
    logError('stock_trading_orders_error', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/stock-market/trading/reset  (reset account to initial state)
router.post('/trading/reset', authMiddleware, tradingWriteRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    await dbRun('DELETE FROM stock_trading_holdings WHERE user_id = ?', [req.userId]);
    await dbRun('DELETE FROM stock_trading_orders WHERE user_id = ?', [req.userId]);
    await dbRun(
      'INSERT OR REPLACE INTO stock_trading_accounts (user_id, balance, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [req.userId, INITIAL_BALANCE]
    );
    res.json({ message: '账户已重置', balance: INITIAL_BALANCE });
  } catch (error) {
    logError('stock_trading_reset_error', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ─── AI Trading Bot ───────────────────────────────────────────────────────────

// In-memory bot state: userId -> { timer, watchlist, sessionId, priceHistory, cycleCount }
interface BotPriceHistory {
  [stockCode: string]: number[]; // last N cycle closing prices
}
const runningBots = new Map<number, {
  timer: ReturnType<typeof setInterval>;
  watchlist: string[];
  sessionId: number;
  priceHistory: BotPriceHistory;   // tracks last 3 prices per stock
  cycleCount: number;              // how many cycles have run
}>();

const BOT_INTERVAL_MS = parseInt(process.env.STOCK_BOT_INTERVAL_MS || '') || 10 * 60 * 1000; // Default: 10 minutes
const BOT_PRICE_HISTORY_SIZE = 3; // remember last 3 cycle prices per stock

async function runBotCycle(userId: number, watchlist: string[], sessionId: number) {
  // Get the mutable bot state so we can update price history
  const botState = runningBots.get(userId);
  const priceHistory: BotPriceHistory = botState?.priceHistory ?? {};
  const cycleCount = (botState?.cycleCount ?? 0) + 1;
  if (botState) botState.cycleCount = cycleCount;
  try {
    logInfo('stock_bot_cycle_start', { userId, watchlist });

    // Fetch current quotes
    let quotes: StockQuote[] = [];
    try {
      quotes = await fetchEastmoneyQuotes(watchlist);
    } catch (err) {
      await dbRun(
        'INSERT INTO stock_trading_bot_logs (user_id, action, reasoning, session_id) VALUES (?, ?, ?, ?)',
        [userId, 'error', `获取行情失败: ${(err as Error).message}`, sessionId]
      );
      return;
    }

    if (quotes.length === 0) {
      await dbRun(
        'INSERT INTO stock_trading_bot_logs (user_id, action, reasoning, session_id) VALUES (?, ?, ?, ?)',
        [userId, 'error', '未能获取任何行情数据（市场可能已收盘）', sessionId]
      );
      return;
    }

    // Fetch current portfolio
    const account = await ensureAccount(userId);
    const holdings = await dbAll(
      'SELECT * FROM stock_trading_holdings WHERE user_id = ? AND quantity > 0',
      [userId]
    );

    // Update price history for each quote (keep last BOT_PRICE_HISTORY_SIZE prices)
    for (const q of quotes) {
      if (q.currentPrice > 0) {
        const hist = priceHistory[q.code] ?? [];
        hist.push(q.currentPrice);
        if (hist.length > BOT_PRICE_HISTORY_SIZE) hist.shift();
        priceHistory[q.code] = hist;
      }
    }
    if (botState) botState.priceHistory = priceHistory;

    // Fetch recent bot orders (last 10) for this user to show trade history context
    const recentBotOrders = await dbAll(
      `SELECT stock_code, stock_name, action, quantity, price, created_at
       FROM stock_trading_orders
       WHERE user_id = ? AND is_bot = 1
       ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );

    // Fetch financial news (non-blocking – falls back gracefully)
    const newsItems = await fetchFinancialNews();

    // Build market summary with quantitative metrics + multi-cycle trend
    const marketSummary = quotes.map(q => {
      const priceVsOpen = q.todayOpen > 0 ? ((q.currentPrice - q.todayOpen) / q.todayOpen * 100).toFixed(2) : 'N/A';
      const priceRange = q.todayHigh > 0 && q.todayLow > 0 && q.yesterdayClose > 0
        ? ((q.todayHigh - q.todayLow) / q.yesterdayClose * 100).toFixed(2)
        : 'N/A';
      const upperShadow = (q.todayHigh > 0 && q.currentPrice > 0)
        ? ((q.todayHigh - Math.max(q.currentPrice, q.todayOpen)) / q.todayHigh * 100).toFixed(1)
        : 'N/A';
      // Multi-cycle trend from price history
      const hist = priceHistory[q.code] ?? [];
      let trendDesc = '数据不足';
      if (hist.length >= 2) {
        const oldest = hist[0];
        const newest = hist[hist.length - 1];
        const trendPct = ((newest - oldest) / oldest * 100).toFixed(2);
        trendDesc = `近${hist.length}轮${Number(trendPct) >= 0 ? '上涨' : '下跌'}${Math.abs(Number(trendPct))}%`;
      }
      return [
        `${q.name}(${q.code}):`,
        `  现价=${q.currentPrice}`,
        `  昨收=${q.yesterdayClose} 今开=${q.todayOpen}`,
        `  涨跌幅=${q.changePercent > 0 ? '+' : ''}${q.changePercent}%`,
        `  日内相对开盘=${priceVsOpen}%`,
        `  日振幅=${priceRange}%  上影线=${upperShadow}%`,
        `  最高=${q.todayHigh}  最低=${q.todayLow}`,
        `  成交额=${(q.amount / 1e8).toFixed(2)}亿  成交量=${(q.volume / 1e4).toFixed(1)}万手`,
        `  机器人观测趋势（${cycleCount}轮）：${trendDesc}`,
      ].join('\n');
    }).join('\n\n');

    const todayCycleDate = getTodayTradeDate();
    const holdingsSummary = holdings.length > 0
      ? holdings.map((h: any) => {
          const q = quotes.find(x => x.code === h.stock_code);
          const currentVal = q ? q.currentPrice * h.quantity : 0;
          const cost = h.avg_cost * h.quantity;
          const pnl = currentVal - cost;
          const t1Lock = h.last_buy_date === todayCycleDate && !isT0Product(h.stock_code, h.stock_name) ? '【T+1锁定，今日不可卖出】' : '';
          return `${h.stock_name}(${h.stock_code}): 持有${h.quantity}股, 均价${h.avg_cost.toFixed(2)}, 现价${q?.currentPrice?.toFixed(2) ?? 'N/A'}, 盈亏${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}${t1Lock}`;
        }).join('\n')
      : '暂无持仓';

    // Recent trade history summary to prevent repetitive behaviour
    const tradeHistorySummary = recentBotOrders.length > 0
      ? recentBotOrders.map((o: any) => {
          const ts = normalizeTimestamp(o.created_at);
          return `  ${o.action === 'buy' ? '买入' : '卖出'} ${o.stock_name}(${o.stock_code}) ${o.quantity}股 @¥${o.price.toFixed(2)} [${new Date(ts).toLocaleString('zh-CN', { timeZone: process.env.SERVER_TIMEZONE || 'Asia/Shanghai' })}]`;
        }).join('\n')
      : '  无历史交易记录';

    // News summary section
    const newsSummary = newsItems.length > 0
      ? newsItems.map((n, i) => `  ${i + 1}. ${n.title}${n.summary ? ': ' + n.summary : ''}`).join('\n')
      : '  暂无最新资讯';

    const prompt = `你是一位顶尖专业量化股票交易员，采用严格的系统化方法论做出每一笔交易决策。
当前为第 ${cycleCount} 轮决策分析。

【可用资金】¥${account.balance.toFixed(2)}

【当前行情（含量化指标）】
${marketSummary}

【当前持仓】
${holdingsSummary}

【机器人最近操作历史】
${tradeHistorySummary}

【最新财经资讯（供宏观判断参考）】
${newsSummary}

【交易分析方法论】
每笔决策必须经过以下四步分析框架，并在 reasoning 中体现关键数据：

第一步 — 趋势识别（Trend Identification）
· 结合多轮历史价格，区分主趋势与短期噪音
· 计算近N轮的价格变动幅度及方向，判断趋势强弱与持续性
· 对比今开与昨收，评估当日缺口性质（跳空高开/低开）

第二步 — 动量与量价验证（Momentum & Volume Confirmation）
· 涨跌幅、日内振幅反映价格动能，振幅>3%视为高波动
· 成交额放量（明显高于历史均值）才能确认趋势有效，缩量反转需谨慎
· 上影线占比高意味着上方抛压较重，下影线长则显示下方支撑较强

第三步 — 风险评估（Risk Assessment）
· 买入前评估潜在最大亏损幅度与预期盈利空间（风险/回报比 ≥ 1:2 方可考虑入场）
· 仓位分配依据市场不确定性调整：波动率高时降低单笔金额，不超过可用资金的20%
· 卖出时单次减仓不超过持仓的50%，保留仓位以应对反转机会

第四步 — 宏观与情绪过滤（Macro & Sentiment Filter）
· 综合最新财经资讯，判断当前宏观情绪（风险偏好 / 避险情绪）
· 若整体市场情绪明显悲观或消息面高度不确定，需降低做多意愿
· 当分析结论不明确或信号相互矛盾时，hold（观望）优于强行交易

【A股交易制度约束（硬性规则，不可违反）】
1. 只允许对以上行情列表中的标的进行交易
2. 若标的现价为0，视为停牌或收盘，不得交易
3. T+1规则：当日买入的境内股票型ETF、混合型ETF及普通A股，当日不得卖出（须等下一交易日）；持仓中标注【T+1锁定，今日不可卖出】的标的，今日只能 hold
4. T+0例外：跨境ETF（如纳指ETF、标普ETF、恒生ETF）、债券ETF、黄金ETF、货币ETF、商品ETF当日买入可当日卖出

请按上述方法论完成分析，再给出交易决策。以JSON格式返回：
{
  "analysis": "市场总体分析（含关键量化数据），100字以内",
  "decisions": [
    {
      "code": "股票代码（如sh600036）",
      "action": "buy 或 sell 或 hold",
      "quantity": 交易数量（hold时为0，必须是100的整数倍）,
      "reasoning": "基于四步分析框架的决策依据，需含具体数值，50字以内"
    }
  ]
}`;

    let llmResponse: string;
    try {
      const result = await chatCompletion([
        { role: 'system', content: '你是专业量化股票交易员，严格遵循趋势识别、量价验证、风险评估、宏观过滤四步分析方法论做出每一笔交易决策，只返回JSON格式的交易决策，不要有任何其他文字。' },
        { role: 'user', content: prompt },
      ]);
      llmResponse = result.content;
    } catch (err) {
      await dbRun(
        'INSERT INTO stock_trading_bot_logs (user_id, action, reasoning, session_id) VALUES (?, ?, ?, ?)',
        [userId, 'error', `LLM请求失败: ${(err as Error).message}`, sessionId]
      );
      return;
    }

    // Parse LLM response
    let parsed: { analysis: string; decisions: Array<{ code: string; action: string; quantity: number; reasoning: string }> };
    try {
      // Extract JSON from response (may have markdown code blocks)
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
      await dbRun(
        'INSERT INTO stock_trading_bot_logs (user_id, action, reasoning, result, session_id) VALUES (?, ?, ?, ?, ?)',
        [userId, 'error', `解析LLM响应失败: ${(err as Error).message}`, llmResponse.slice(0, 500), sessionId]
      );
      return;
    }

    // Log the analysis
    await dbRun(
      'INSERT INTO stock_trading_bot_logs (user_id, action, reasoning, session_id) VALUES (?, ?, ?, ?)',
      [userId, 'analysis', parsed.analysis || '', sessionId]
    );

    // Execute decisions
    let buyCount = 0, sellCount = 0, holdCount = 0;
    for (const decision of (parsed.decisions || [])) {
      const { code, action, reasoning } = decision;
      if (!code || !action) continue;

      const quote = quotes.find(q => q.code === code);
      if (!quote || quote.currentPrice <= 0) {
        await dbRun(
          'INSERT INTO stock_trading_bot_logs (user_id, action, stock_code, reasoning, result, session_id) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, 'skip', code, reasoning || '', '价格为0，跳过', sessionId]
        );
        continue;
      }

      if (action === 'hold' || !decision.quantity || decision.quantity <= 0) {
        holdCount++;
        await dbRun(
          'INSERT INTO stock_trading_bot_logs (user_id, action, stock_code, reasoning, result, session_id) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, 'hold', code, reasoning || '', `持有观望 ${quote.name}`, sessionId]
        );
        continue;
      }

      // Re-fetch current account balance
      const currentAccount = await dbGet('SELECT balance FROM stock_trading_accounts WHERE user_id = ?', [userId]);
      const currentBalance = currentAccount?.balance ?? 0;

      if (action === 'buy') {
        // Enforce: quantity must be multiple of 100; total ≤ 20% of available balance
        const maxAmount = currentBalance * 0.20;
        const rawQty = Math.floor(decision.quantity / 100) * 100;
        const maxQtyByBudget = Math.floor(maxAmount / quote.currentPrice / 100) * 100;
        const quantity = Math.min(rawQty, maxQtyByBudget);

        if (quantity <= 0) {
          await dbRun(
            'INSERT INTO stock_trading_bot_logs (user_id, action, stock_code, reasoning, result, session_id) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, 'skip', code, reasoning || '', `可买数量为0（余额${currentBalance.toFixed(2)}，单价${quote.currentPrice.toFixed(2)}）`, sessionId]
          );
          continue;
        }

        const total = quantity * quote.currentPrice;

        await dbRun(
          'UPDATE stock_trading_accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
          [total, userId]
        );

        const existingHolding = await dbGet(
          'SELECT * FROM stock_trading_holdings WHERE user_id = ? AND stock_code = ?',
          [userId, code]
        );
        if (existingHolding) {
          const newQty = existingHolding.quantity + quantity;
          const newAvgCost = (existingHolding.avg_cost * existingHolding.quantity + quote.currentPrice * quantity) / newQty;
          // Note: updating last_buy_date locks the entire position for T+1 (conservative simplification)
          await dbRun(
            'UPDATE stock_trading_holdings SET quantity = ?, avg_cost = ?, last_buy_date = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND stock_code = ?',
            [newQty, newAvgCost, todayCycleDate, userId, code]
          );
        } else {
          await dbRun(
            'INSERT INTO stock_trading_holdings (user_id, stock_code, stock_name, quantity, avg_cost, last_buy_date) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, code, quote.name, quantity, quote.currentPrice, todayCycleDate]
          );
        }

        await dbRun(
          'INSERT INTO stock_trading_orders (user_id, stock_code, stock_name, action, quantity, price, total_amount, is_bot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [userId, code, quote.name, 'buy', quantity, quote.currentPrice, total, 1]
        );

        buyCount++;
        await dbRun(
          'INSERT INTO stock_trading_bot_logs (user_id, action, stock_code, reasoning, result, session_id) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, 'buy', code, reasoning || '', `买入 ${quote.name} ${quantity}股 @¥${quote.currentPrice.toFixed(2)}，花费¥${total.toFixed(2)}`, sessionId]
        );
      } else if (action === 'sell') {
        const holding = await dbGet(
          'SELECT * FROM stock_trading_holdings WHERE user_id = ? AND stock_code = ?',
          [userId, code]
        );
        if (!holding || holding.quantity <= 0) {
          await dbRun(
            'INSERT INTO stock_trading_bot_logs (user_id, action, stock_code, reasoning, result, session_id) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, 'skip', code, reasoning || '', `无持仓，无法卖出`, sessionId]
          );
          continue;
        }

        // Enforce A-share T+1: domestic equity/mixed/broad-based ETFs and regular stocks
        // cannot be sold on the day they were bought. T+0 products (cross-border, bond,
        // gold, monetary, commodity ETFs) are exempt from this restriction.
        if (holding.last_buy_date === todayCycleDate && !isT0Product(code, quote.name)) {
          holdCount++;
          await dbRun(
            'INSERT INTO stock_trading_bot_logs (user_id, action, stock_code, reasoning, result, session_id) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, 'hold', code, reasoning || '', `T+1限制：${quote.name} 今日买入，须下一交易日方可卖出`, sessionId]
          );
          continue;
        }

        // Enforce: quantity ≤ 50% of current holding, must be multiple of 100
        const maxSell = Math.floor(holding.quantity * 0.5 / 100) * 100 || Math.min(holding.quantity, 100);
        const rawSellQty = Math.floor(decision.quantity / 100) * 100;
        const quantity = Math.min(rawSellQty || 100, maxSell, holding.quantity);
        const total = quantity * quote.currentPrice;
        await dbRun(
          'UPDATE stock_trading_accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
          [total, userId]
        );

        const newQty = holding.quantity - quantity;
        if (newQty === 0) {
          await dbRun('DELETE FROM stock_trading_holdings WHERE user_id = ? AND stock_code = ?', [userId, code]);
        } else {
          await dbRun(
            'UPDATE stock_trading_holdings SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND stock_code = ?',
            [newQty, userId, code]
          );
        }

        await dbRun(
          'INSERT INTO stock_trading_orders (user_id, stock_code, stock_name, action, quantity, price, total_amount, is_bot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [userId, code, holding.stock_name, 'sell', quantity, quote.currentPrice, total, 1]
        );

        const pnl = (quote.currentPrice - holding.avg_cost) * quantity;
        sellCount++;
        await dbRun(
          'INSERT INTO stock_trading_bot_logs (user_id, action, stock_code, reasoning, result, session_id) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, 'sell', code, reasoning || '', `卖出 ${holding.stock_name} ${quantity}股 @¥${quote.currentPrice.toFixed(2)}，获得¥${total.toFixed(2)}，盈亏¥${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}`, sessionId]
        );
      }
    }

    // Emit a single consolidated cycle-summary log instead of the generic "本轮决策执行完毕"
    const currentAccount = await dbGet('SELECT balance FROM stock_trading_accounts WHERE user_id = ?', [userId]);
    const cycleSummary = `第${cycleCount}轮完成 | 买入${buyCount}笔 卖出${sellCount}笔 观望${holdCount}笔 | 余额¥${(currentAccount?.balance ?? 0).toFixed(2)}`;
    await dbRun(
      'INSERT INTO stock_trading_bot_logs (user_id, action, reasoning, session_id) VALUES (?, ?, ?, ?)',
      [userId, 'cycle_summary', cycleSummary, sessionId]
    );
    logInfo('stock_bot_cycle_end', { userId });
  } catch (error) {
    logError('stock_bot_cycle_error', error as Error, { userId });
    try {
      await dbRun(
        'INSERT INTO stock_trading_bot_logs (user_id, action, reasoning, session_id) VALUES (?, ?, ?, ?)',
        [userId, 'error', `机器人运行出错: ${(error as Error).message}`, sessionId]
      );
    } catch (_) { /* ignore log error */ }
  }
}

// GET /api/stock-market/trading/bot/status
router.get('/trading/bot/status', authMiddleware, tradingReadRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const isRunning = runningBots.has(req.userId!);
    const watchlist = runningBots.get(req.userId!)?.watchlist ?? [];
    const logs = await dbAll(
      'SELECT id, user_id, action, stock_code, reasoning, result, created_at, session_id FROM stock_trading_bot_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
      [req.userId]
    );
    const account = await dbGet('SELECT balance FROM stock_trading_accounts WHERE user_id = ?', [req.userId]);
    const balance = account?.balance ?? null;
    res.json({ isRunning, watchlist, logs: logs.map((l: any) => ({ ...l, created_at: normalizeTimestamp(l.created_at) })), balance });
  } catch (error) {
    logError('stock_bot_status_error', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/stock-market/trading/bot/start  { watchlist: string[] }
router.post('/trading/bot/start', authMiddleware, tradingWriteRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    if (runningBots.has(userId)) {
      return res.status(400).json({ error: '机器人已在运行中' });
    }

    const { watchlist } = req.body as { watchlist: string[] };
    if (!Array.isArray(watchlist) || watchlist.length === 0) {
      return res.status(400).json({ error: '请提供自选股列表' });
    }

    const validCodes = watchlist
      .map((c: string) => c.trim().toLowerCase())
      .filter((c: string) => /^(sh|sz)\d{6}$/.test(c))
      .slice(0, 20);

    if (validCodes.length === 0) {
      return res.status(400).json({ error: '没有有效的股票代码' });
    }

    // Compute next session_id for this user
    const maxRow = await dbGet(
      'SELECT MAX(session_id) as max_sid FROM stock_trading_bot_logs WHERE user_id = ?',
      [userId]
    );
    const sessionId = (maxRow?.max_sid ?? 0) + 1;

    await dbRun(
      'INSERT INTO stock_trading_bot_logs (user_id, action, reasoning, session_id) VALUES (?, ?, ?, ?)',
      [userId, 'start', `机器人启动，监控股票: ${validCodes.join(', ')}`, sessionId]
    );

    // Run one cycle immediately, then schedule
    runBotCycle(userId, validCodes, sessionId);
    const timer = setInterval(() => runBotCycle(userId, validCodes, sessionId), BOT_INTERVAL_MS);
    runningBots.set(userId, { timer, watchlist: validCodes, sessionId, priceHistory: {}, cycleCount: 0 });

    logInfo('stock_bot_started', { userId, watchlist: validCodes, sessionId });
    res.json({ message: '机器人已启动', watchlist: validCodes });
  } catch (error) {
    logError('stock_bot_start_error', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/stock-market/trading/bot/stop
router.post('/trading/bot/stop', authMiddleware, tradingWriteRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const bot = runningBots.get(userId);
    if (!bot) {
      return res.status(400).json({ error: '机器人未在运行' });
    }

    clearInterval(bot.timer);
    runningBots.delete(userId);

    await dbRun(
      'INSERT INTO stock_trading_bot_logs (user_id, action, reasoning, session_id) VALUES (?, ?, ?, ?)',
      [userId, 'stop', '机器人已停止', bot.sessionId]
    );

    logInfo('stock_bot_stopped', { userId });
    res.json({ message: '机器人已停止' });
  } catch (error) {
    logError('stock_bot_stop_error', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/stock-market/trading/bot/logs
router.get('/trading/bot/logs', authMiddleware, tradingReadRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const logs = await dbAll(
      'SELECT id, user_id, action, stock_code, reasoning, result, created_at, session_id FROM stock_trading_bot_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [req.userId, limit]
    );
    res.json({ logs: logs.map((l: any) => ({ ...l, created_at: normalizeTimestamp(l.created_at) })) });
  } catch (error) {
    logError('stock_bot_logs_error', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// DELETE /api/stock-market/trading/bot/logs  (clear all bot logs for the user)
router.delete('/trading/bot/logs', authMiddleware, tradingWriteRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    await dbRun('DELETE FROM stock_trading_bot_logs WHERE user_id = ?', [req.userId]);
    logInfo('stock_bot_logs_cleared', { userId: req.userId });
    res.json({ message: '日志已清空' });
  } catch (error) {
    logError('stock_bot_logs_clear_error', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/stock-market/trading/stats  (P&L statistics per stock)
router.get('/trading/stats', authMiddleware, tradingReadRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT
        stock_code,
        stock_name,
        SUM(CASE WHEN action='buy' THEN quantity ELSE 0 END) AS total_bought,
        SUM(CASE WHEN action='sell' THEN quantity ELSE 0 END) AS total_sold,
        SUM(CASE WHEN action='buy' THEN total_amount ELSE 0 END) AS total_buy_amount,
        SUM(CASE WHEN action='sell' THEN total_amount ELSE 0 END) AS total_sell_amount,
        SUM(CASE WHEN action='buy' THEN 1 ELSE 0 END) AS buy_count,
        SUM(CASE WHEN action='sell' THEN 1 ELSE 0 END) AS sell_count,
        COUNT(*) AS trade_count
      FROM stock_trading_orders
      WHERE user_id = ?
      GROUP BY stock_code
      ORDER BY trade_count DESC`,
      [req.userId]
    );

    // Compute realized P&L per stock using average cost method
    const stats = rows.map((row: any) => {
      const remaining = row.total_bought - row.total_sold;
      let realized_pnl = 0;
      if (row.total_bought > 0) {
        const avg_buy_price = row.total_buy_amount / row.total_bought;
        realized_pnl = row.total_sell_amount - avg_buy_price * row.total_sold;
      }
      return {
        stock_code: row.stock_code,
        stock_name: row.stock_name,
        total_bought: row.total_bought,
        total_sold: row.total_sold,
        remaining_qty: remaining,
        total_buy_amount: row.total_buy_amount,
        total_sell_amount: row.total_sell_amount,
        buy_count: row.buy_count,
        sell_count: row.sell_count,
        trade_count: row.trade_count,
        realized_pnl,
      };
    });

    const total_realized_pnl = stats.reduce((sum: number, s: any) => sum + s.realized_pnl, 0);
    res.json({ stats, total_realized_pnl });
  } catch (error) {
    logError('stock_trading_stats_error', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ─── Trading Diary ────────────────────────────────────────────────────────────

// GET /api/stock-market/diary  (list all diary entries for the user)
router.get('/diary', authMiddleware, diaryReadRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const entries = await dbAll(
      'SELECT id, title, content, mood, tags, created_at, updated_at FROM stock_trading_diary WHERE user_id = ? ORDER BY created_at DESC',
      [req.userId]
    );
    res.json({ entries: entries.map((e: any) => ({ ...e, tags: JSON.parse(e.tags || '[]'), created_at: normalizeTimestamp(e.created_at), updated_at: normalizeTimestamp(e.updated_at) })) });
  } catch (error) {
    logError('stock_diary_list_error', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/stock-market/diary  (create a new diary entry)
router.post('/diary', authMiddleware, diaryWriteRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, mood, tags } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: '标题不能为空' });
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: '内容不能为空' });
    }
    const tagsJson = JSON.stringify(Array.isArray(tags) ? tags.map(String) : []);
    const result = await dbRun(
      'INSERT INTO stock_trading_diary (user_id, title, content, mood, tags) VALUES (?, ?, ?, ?, ?)',
      [req.userId, title.trim().slice(0, DIARY_MAX_TITLE_LENGTH), content.trim().slice(0, DIARY_MAX_CONTENT_LENGTH), mood || null, tagsJson]
    );
    const entry = await dbGet(
      'SELECT id, title, content, mood, tags, created_at, updated_at FROM stock_trading_diary WHERE id = ?',
      [result.lastID]
    );
    logInfo('stock_diary_created', { userId: req.userId, id: result.lastID });
    res.status(201).json({ entry: { ...entry, tags: JSON.parse(entry.tags || '[]'), created_at: normalizeTimestamp(entry.created_at), updated_at: normalizeTimestamp(entry.updated_at) } });
  } catch (error) {
    logError('stock_diary_create_error', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// PUT /api/stock-market/diary/:id  (update a diary entry)
router.put('/diary/:id', authMiddleware, diaryWriteRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) return res.status(400).json({ error: '无效的ID' });
    const existing = await dbGet(
      'SELECT id FROM stock_trading_diary WHERE id = ? AND user_id = ?',
      [id, req.userId]
    );
    if (!existing) return res.status(404).json({ error: '日记不存在' });

    const { title, content, mood, tags } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: '标题不能为空' });
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: '内容不能为空' });
    }
    const tagsJson = JSON.stringify(Array.isArray(tags) ? tags.map(String) : []);
    await dbRun(
      'UPDATE stock_trading_diary SET title = ?, content = ?, mood = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [title.trim().slice(0, DIARY_MAX_TITLE_LENGTH), content.trim().slice(0, DIARY_MAX_CONTENT_LENGTH), mood || null, tagsJson, id, req.userId]
    );
    const entry = await dbGet(
      'SELECT id, title, content, mood, tags, created_at, updated_at FROM stock_trading_diary WHERE id = ?',
      [id]
    );
    logInfo('stock_diary_updated', { userId: req.userId, id });
    res.json({ entry: { ...entry, tags: JSON.parse(entry.tags || '[]'), created_at: normalizeTimestamp(entry.created_at), updated_at: normalizeTimestamp(entry.updated_at) } });
  } catch (error) {
    logError('stock_diary_update_error', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// DELETE /api/stock-market/diary/:id  (delete a diary entry)
router.delete('/diary/:id', authMiddleware, diaryWriteRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) return res.status(400).json({ error: '无效的ID' });
    const existing = await dbGet(
      'SELECT id FROM stock_trading_diary WHERE id = ? AND user_id = ?',
      [id, req.userId]
    );
    if (!existing) return res.status(404).json({ error: '日记不存在' });
    await dbRun('DELETE FROM stock_trading_diary WHERE id = ? AND user_id = ?', [id, req.userId]);
    logInfo('stock_diary_deleted', { userId: req.userId, id });
    res.json({ message: '日记已删除' });
  } catch (error) {
    logError('stock_diary_delete_error', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
