import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useTheme } from '../contexts/ThemeContext';
import { stockMarketAPI } from '../api';
import '../styles/StockMarket.css';

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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Holding {
  stock_code: string;
  stock_name: string;
  quantity: number;
  avg_cost: number;
}

interface Order {
  id: number;
  stock_code: string;
  stock_name: string;
  action: string;
  quantity: number;
  price: number;
  total_amount: number;
  is_bot: number;
  created_at: string;
}

interface BotLog {
  id: number;
  action: string;
  stock_code: string | null;
  reasoning: string | null;
  result: string | null;
  created_at: string;
}

const DEFAULT_CODES = ['sh000001', 'sz399001', 'sz399006', 'sh000688'];
const STORAGE_KEY = 'stock_market_codes';

const WELCOME_HINTS = [
  '上证指数今天表现如何？',
  'A股市场近期有哪些热点板块？',
  'PE估值多少算合理？',
  '如何看懂K线图？',
  '什么是MACD指标？',
  '价值投资的核心逻辑是什么？',
];

function formatAmount(amount: number): string {
  if (amount >= 1e12) return `${(amount / 1e12).toFixed(2)}万亿`;
  if (amount >= 1e8) return `${(amount / 1e8).toFixed(2)}亿`;
  if (amount >= 1e4) return `${(amount / 1e4).toFixed(2)}万`;
  return `${amount}`;
}

function formatVolume(volume: number): string {
  if (volume >= 1e8) return `${(volume / 1e8).toFixed(2)}亿手`;
  if (volume >= 1e4) return `${(volume / 1e4).toFixed(2)}万手`;
  return `${volume}手`;
}

function formatMoney(amount: number): string {
  if (Math.abs(amount) >= 1e8) return `${(amount / 1e8).toFixed(2)}亿`;
  if (Math.abs(amount) >= 1e4) return `${(amount / 1e4).toFixed(2)}万`;
  return amount.toFixed(2);
}

type TabType = 'market' | 'trading' | 'chat' | 'bot';

const StockMarketPage: React.FC = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<TabType>('market');

  // Stock data state — load from localStorage initially, fall back to DEFAULT_CODES
  const [codes, setCodes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_CODES;
    } catch {
      return DEFAULT_CODES;
    }
  });
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');

  // Use a ref so the auto-refresh interval always sees the latest codes
  const codesRef = useRef(codes);
  useEffect(() => { codesRef.current = codes; }, [codes]);

  // Persist codes to localStorage and backend whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
    // Sync to backend (fire-and-forget)
    stockMarketAPI.putWatchlist(codes).catch(() => {});
  }, [codes]);

  // Load codes from backend on mount (backend is source of truth if available)
  useEffect(() => {
    document.title = '股市行情 - 工具箱';
    stockMarketAPI.getWatchlist().then(({ codes: serverCodes }) => {
      if (serverCodes.length > 0) {
        setCodes(serverCodes);
      }
    }).catch(() => {});
  }, []);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Trading state
  const [balance, setBalance] = useState<number>(0);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tradeCode, setTradeCode] = useState('');
  const [tradeQty, setTradeQty] = useState('100');
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null);
  const [loadingTrade, setLoadingTrade] = useState(false);
  const [tradingSubTab, setTradingSubTab] = useState<'holdings' | 'orders'>('holdings');

  // Bot state
  const [botRunning, setBotRunning] = useState(false);
  const [botLogs, setBotLogs] = useState<BotLog[]>([]);
  const [botError, setBotError] = useState<string | null>(null);
  const [loadingBot, setLoadingBot] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const botLogsEndRef = useRef<HTMLDivElement>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const botPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load quotes using codesRef to avoid stale closure
  const loadQuotes = useCallback(async (showLoading = true) => {
    const currentCodes = codesRef.current;
    if (currentCodes.length === 0) return;
    if (showLoading) setLoadingQuotes(true);
    setQuoteError(null);
    try {
      const data = await stockMarketAPI.getQuotes(currentCodes);
      setQuotes(data.quotes);
      setLastUpdate(new Date().toLocaleTimeString('zh-CN'));
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setQuoteError(e?.response?.data?.error || '获取行情数据失败');
    } finally {
      if (showLoading) setLoadingQuotes(false);
    }
  }, []);

  useEffect(() => {
    loadQuotes();
    autoRefreshRef.current = setInterval(() => loadQuotes(false), 30000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [loadQuotes]);

  // Reload quotes when codes change
  useEffect(() => {
    if (codes.length > 0) loadQuotes(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Load trading data when tab switches to 'trading'
  useEffect(() => {
    if (activeTab === 'trading') loadTradingData();
    if (activeTab === 'bot') loadBotStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Poll bot status every 10s when bot tab is active
  useEffect(() => {
    if (activeTab === 'bot') {
      botPollRef.current = setInterval(loadBotStatus, 10000);
    } else {
      if (botPollRef.current) clearInterval(botPollRef.current);
    }
    return () => { if (botPollRef.current) clearInterval(botPollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadTradingData = async () => {
    try {
      const [accountData, ordersData] = await Promise.all([
        stockMarketAPI.getAccount(),
        stockMarketAPI.getOrders(),
      ]);
      setBalance(accountData.balance);
      setHoldings(accountData.holdings);
      setOrders(ordersData.orders);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setTradeError(e?.response?.data?.error || '加载交易数据失败');
    }
  };

  const loadBotStatus = async () => {
    try {
      const data = await stockMarketAPI.getBotStatus();
      setBotRunning(data.isRunning);
      setBotLogs(data.logs);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setBotError(e?.response?.data?.error || '加载机器人状态失败');
    }
  };

  const handleAddCode = useCallback(() => {
    const raw = searchInput.trim().toLowerCase();
    if (!raw) return;
    let code = raw;
    if (/^\d{6}$/.test(code)) {
      code = (code.startsWith('6') || code.startsWith('5')) ? `sh${code}` : `sz${code}`;
    }
    if (!/^(sh|sz)\d{6}$/.test(code)) {
      setQuoteError('请输入有效的股票代码（如 sh600036 或 600036）');
      return;
    }
    if (codes.includes(code)) { setSearchInput(''); return; }
    setCodes((prev) => [...prev, code]);
    setSearchInput('');
  }, [searchInput, codes]);

  const handleRemoveCode = (code: string) => {
    setCodes((prev) => prev.filter((c) => c !== code));
    setQuotes((prev) => prev.filter((q) => q.code !== code));
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAddCode();
  };

  const getChangeClass = (change: number) => {
    if (change > 0) return 'stock-change-up';
    if (change < 0) return 'stock-change-down';
    return 'stock-change-flat';
  };

  const formatChange = (change: number) => {
    if (change > 0) return `+${change.toFixed(2)}%`;
    return `${change.toFixed(2)}%`;
  };

  // Chat logic
  const handleSend = async (text?: string) => {
    const content = (text ?? inputText).trim();
    if (!content || isTyping) return;
    setInputText('');
    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: 'user', content };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);
    try {
      const allMessages = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const data = await stockMarketAPI.chat(allMessages);
      setMessages((prev) => [...prev, { id: `a_${Date.now()}`, role: 'assistant', content: data.reply }]);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setMessages((prev) => [...prev, {
        id: `e_${Date.now()}`,
        role: 'assistant',
        content: `❌ 请求失败：${e?.response?.data?.error || '请稍后重试'}`,
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Trading logic
  const handleBuy = async () => {
    setTradeError(null); setTradeSuccess(null);
    const code = tradeCode.trim().toLowerCase();
    const qty = parseInt(tradeQty);
    if (!code || isNaN(qty) || qty <= 0) { setTradeError('请选择股票并输入数量'); return; }
    const quote = quotes.find(q => q.code === code);
    if (!quote || quote.currentPrice <= 0) { setTradeError('无法获取该股票现价'); return; }
    setLoadingTrade(true);
    try {
      const res = await stockMarketAPI.buy(code, quote.name, qty, quote.currentPrice);
      setTradeSuccess(res.message);
      setBalance(res.balance);
      await loadTradingData();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setTradeError(e?.response?.data?.error || '买入失败');
    } finally {
      setLoadingTrade(false);
    }
  };

  const handleSell = async () => {
    setTradeError(null); setTradeSuccess(null);
    const code = tradeCode.trim().toLowerCase();
    const qty = parseInt(tradeQty);
    if (!code || isNaN(qty) || qty <= 0) { setTradeError('请选择股票并输入数量'); return; }
    const quote = quotes.find(q => q.code === code);
    if (!quote || quote.currentPrice <= 0) { setTradeError('无法获取该股票现价'); return; }
    setLoadingTrade(true);
    try {
      const res = await stockMarketAPI.sell(code, qty, quote.currentPrice);
      setTradeSuccess(res.message);
      setBalance(res.balance);
      await loadTradingData();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setTradeError(e?.response?.data?.error || '卖出失败');
    } finally {
      setLoadingTrade(false);
    }
  };

  const handleResetAccount = async () => {
    if (!window.confirm('确定要重置账户吗？所有持仓和交易记录将被清除，初始资金恢复为100万。')) return;
    try {
      const res = await stockMarketAPI.resetAccount();
      setTradeSuccess(res.message);
      await loadTradingData();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setTradeError(e?.response?.data?.error || '重置失败');
    }
  };

  // Bot logic
  const handleStartBot = async () => {
    setBotError(null);
    setLoadingBot(true);
    try {
      await stockMarketAPI.startBot(codes);
      await loadBotStatus();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setBotError(e?.response?.data?.error || '启动失败');
    } finally {
      setLoadingBot(false);
    }
  };

  const handleStopBot = async () => {
    setBotError(null);
    setLoadingBot(true);
    try {
      await stockMarketAPI.stopBot();
      await loadBotStatus();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setBotError(e?.response?.data?.error || '停止失败');
    } finally {
      setLoadingBot(false);
    }
  };

  const quoteMap = new Map(quotes.map((q) => [q.code, q]));

  // Calculate portfolio value
  const holdingsValue = holdings.reduce((sum, h) => {
    const q = quoteMap.get(h.stock_code);
    return sum + (q ? q.currentPrice * h.quantity : h.avg_cost * h.quantity);
  }, 0);
  const totalAssets = balance + holdingsValue;
  const totalCost = holdings.reduce((sum, h) => sum + h.avg_cost * h.quantity, 0);
  const totalPnl = holdingsValue - totalCost;

  const getBotLogIcon = (action: string) => {
    switch (action) {
      case 'buy': return '🟢';
      case 'sell': return '🔴';
      case 'hold': return '⚪';
      case 'analysis': return '🔍';
      case 'analysis_start': return '▶️';
      case 'analysis_end': return '✅';
      case 'start': return '🚀';
      case 'stop': return '⏹️';
      case 'error': return '❌';
      case 'skip': return '⏭️';
      default: return '📝';
    }
  };

  return (
    <div className="stock-market-page">
      {/* Header */}
      <header className="stock-market-header">
        <div className="stock-market-header-left">
          <button className="btn btn-icon" onClick={() => navigate('/')} title="返回">←</button>
          <h1>📈 股市行情</h1>
        </div>
        <div className="stock-tab-bar">
          {([
            { key: 'market', label: '行情' },
            { key: 'trading', label: '模拟交易' },
            { key: 'chat', label: 'AI助手' },
            { key: 'bot', label: 'AI机器人' },
          ] as { key: TabType; label: string }[]).map(tab => (
            <button
              key={tab.key}
              className={`stock-tab-btn${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.key === 'bot' && botRunning && <span className="bot-running-dot" />}
            </button>
          ))}
        </div>
        <div className="stock-market-header-actions">
          <button className="btn btn-icon" onClick={toggleTheme} title="切换主题">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {/* Tab Content */}
      <div className="stock-market-body">

        {/* ── 行情 Tab ── */}
        {activeTab === 'market' && (
          <div className="stock-panel full-width">
            <div className="stock-panel-toolbar">
              <input
                className="stock-search-input"
                type="text"
                placeholder="输入股票代码，如 600036"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              <button className="stock-search-btn" onClick={handleAddCode}>添加</button>
              <button
                className="stock-refresh-btn"
                onClick={() => loadQuotes(true)}
                disabled={loadingQuotes}
                title="刷新行情"
              >🔄</button>
            </div>

            {quoteError && <div className="stock-error">{quoteError}</div>}

            <div className="stock-table-container">
              {loadingQuotes && quotes.length === 0 ? (
                <div className="stock-loading">加载中...</div>
              ) : codes.length === 0 ? (
                <div className="stock-empty">暂无自选股票，请添加股票代码</div>
              ) : (
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>代码</th><th>名称</th><th>现价</th>
                      <th>涨跌幅</th><th>涨跌额</th><th>成交量</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map((code) => {
                      const q = quoteMap.get(code);
                      if (!q) {
                        return (
                          <tr key={code}>
                            <td>{code}</td>
                            <td colSpan={5} style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                              {loadingQuotes ? '加载中...' : '暂无数据'}
                            </td>
                            <td><button className="stock-delete-btn" onClick={() => handleRemoveCode(code)}>✕</button></td>
                          </tr>
                        );
                      }
                      const changeClass = getChangeClass(q.changePercent);
                      return (
                        <tr key={code} title={`开盘：${q.todayOpen} | 最高：${q.todayHigh} | 最低：${q.todayLow} | 昨收：${q.yesterdayClose} | 成交额：${formatAmount(q.amount)}`}>
                          <td>{q.code.toUpperCase()}</td>
                          <td>{q.name}</td>
                          <td className={`stock-price ${changeClass}`}>{q.currentPrice > 0 ? q.currentPrice.toFixed(2) : '--'}</td>
                          <td className={changeClass}>{formatChange(q.changePercent)}</td>
                          <td className={changeClass}>{q.changeAmount > 0 ? `+${q.changeAmount.toFixed(2)}` : q.changeAmount.toFixed(2)}</td>
                          <td>{q.volume > 0 ? formatVolume(q.volume) : '--'}</td>
                          <td><button className="stock-delete-btn" onClick={() => handleRemoveCode(code)}>✕</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {lastUpdate && (
              <div className="stock-last-update">最后更新：{lastUpdate}（每30秒自动刷新）</div>
            )}
          </div>
        )}

        {/* ── 模拟交易 Tab ── */}
        {activeTab === 'trading' && (
          <div className="trading-panel">
            {/* Account Summary */}
            <div className="trading-summary">
              <div className="trading-summary-item">
                <span className="ts-label">可用资金</span>
                <span className="ts-value">¥{formatMoney(balance)}</span>
              </div>
              <div className="trading-summary-item">
                <span className="ts-label">持仓市值</span>
                <span className="ts-value">¥{formatMoney(holdingsValue)}</span>
              </div>
              <div className="trading-summary-item">
                <span className="ts-label">总资产</span>
                <span className="ts-value">¥{formatMoney(totalAssets)}</span>
              </div>
              <div className="trading-summary-item">
                <span className="ts-label">持仓盈亏</span>
                <span className={`ts-value ${totalPnl >= 0 ? 'stock-change-up' : 'stock-change-down'}`}>
                  {totalPnl >= 0 ? '+' : ''}¥{formatMoney(totalPnl)}
                </span>
              </div>
              <button className="trading-reset-btn" onClick={handleResetAccount} title="重置账户">重置</button>
            </div>

            {/* Trade Controls */}
            <div className="trading-controls">
              <select
                className="trading-select"
                value={tradeCode}
                onChange={(e) => { setTradeCode(e.target.value); setTradeError(null); setTradeSuccess(null); }}
              >
                <option value="">-- 选择股票 --</option>
                {codes.map(code => {
                  const q = quoteMap.get(code);
                  return (
                    <option key={code} value={code}>
                      {q ? `${q.name} (${code.toUpperCase()}) ¥${q.currentPrice.toFixed(2)}` : code.toUpperCase()}
                    </option>
                  );
                })}
              </select>
              <input
                className="trading-qty-input"
                type="number"
                min="100"
                step="100"
                value={tradeQty}
                onChange={(e) => setTradeQty(e.target.value)}
                placeholder="数量（整手）"
              />
              <button className="trading-buy-btn" onClick={handleBuy} disabled={loadingTrade}>买入</button>
              <button className="trading-sell-btn" onClick={handleSell} disabled={loadingTrade}>卖出</button>
            </div>

            {tradeError && <div className="stock-error">{tradeError}</div>}
            {tradeSuccess && <div className="trade-success">{tradeSuccess}</div>}

            {/* Sub-tabs */}
            <div className="trading-subtab-bar">
              <button
                className={`trading-subtab-btn${tradingSubTab === 'holdings' ? ' active' : ''}`}
                onClick={() => setTradingSubTab('holdings')}
              >当前持仓</button>
              <button
                className={`trading-subtab-btn${tradingSubTab === 'orders' ? ' active' : ''}`}
                onClick={() => setTradingSubTab('orders')}
              >交易记录</button>
            </div>

            {tradingSubTab === 'holdings' && (
              <div className="stock-table-container">
                {holdings.length === 0 ? (
                  <div className="stock-empty">暂无持仓</div>
                ) : (
                  <table className="stock-table">
                    <thead>
                      <tr><th>代码</th><th>名称</th><th>持仓</th><th>均价</th><th>现价</th><th>盈亏</th><th>市值</th></tr>
                    </thead>
                    <tbody>
                      {holdings.map(h => {
                        const q = quoteMap.get(h.stock_code);
                        const currentPrice = q?.currentPrice ?? h.avg_cost;
                        const pnl = (currentPrice - h.avg_cost) * h.quantity;
                        const pnlPct = ((currentPrice - h.avg_cost) / h.avg_cost * 100);
                        const cls = pnl >= 0 ? 'stock-change-up' : 'stock-change-down';
                        return (
                          <tr key={h.stock_code}
                            onClick={() => setTradeCode(h.stock_code)}
                            style={{ cursor: 'pointer' }}
                            title="点击选择该股票进行交易"
                          >
                            <td>{h.stock_code.toUpperCase()}</td>
                            <td>{h.stock_name}</td>
                            <td>{h.quantity}</td>
                            <td>¥{h.avg_cost.toFixed(2)}</td>
                            <td>{currentPrice.toFixed(2)}</td>
                            <td className={cls}>
                              {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}<br />
                              <small>({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)</small>
                            </td>
                            <td>¥{formatMoney(currentPrice * h.quantity)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tradingSubTab === 'orders' && (
              <div className="stock-table-container">
                {orders.length === 0 ? (
                  <div className="stock-empty">暂无交易记录</div>
                ) : (
                  <table className="stock-table">
                    <thead>
                      <tr><th>时间</th><th>代码</th><th>名称</th><th>操作</th><th>数量</th><th>价格</th><th>金额</th><th>来源</th></tr>
                    </thead>
                    <tbody>
                      {orders.map(o => (
                        <tr key={o.id}>
                          <td style={{ fontSize: 11 }}>{new Date(o.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                          <td>{o.stock_code.toUpperCase()}</td>
                          <td>{o.stock_name}</td>
                          <td className={o.action === 'buy' ? 'stock-change-up' : 'stock-change-down'}>
                            {o.action === 'buy' ? '买入' : '卖出'}
                          </td>
                          <td>{o.quantity}</td>
                          <td>¥{o.price.toFixed(2)}</td>
                          <td>¥{formatMoney(o.total_amount)}</td>
                          <td style={{ fontSize: 11 }}>{o.is_bot ? '🤖机器人' : '👤手动'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── AI助手 Tab ── */}
        {activeTab === 'chat' && (
          <div className="stock-chat-panel full-width">
            <div className="stock-chat-panel-header">
              <h2>🤖 AI 股市助手</h2>
              {messages.length > 0 && (
                <button className="stock-chat-clear-btn" onClick={() => setMessages([])}>清空对话</button>
              )}
            </div>

            <div className="stock-chat-messages">
              {messages.length === 0 ? (
                <div className="stock-chat-welcome">
                  <h3>你好！我是股市 AI 助手 👋</h3>
                  <p>我可以帮你分析行情、解读指标、讲解知识，以及回答任何关于股市的问题。</p>
                  <div className="welcome-hints">
                    {WELCOME_HINTS.map((hint) => (
                      <button key={hint} className="welcome-hint-btn" onClick={() => handleSend(hint)}>{hint}</button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`stock-msg-row ${msg.role}`}>
                    <div className="stock-msg-bubble">
                      {msg.role === 'assistant' ? <ReactMarkdown>{msg.content}</ReactMarkdown> : msg.content}
                    </div>
                  </div>
                ))
              )}
              {isTyping && (
                <div className="stock-msg-row assistant">
                  <div className="stock-typing"><span /><span /><span /></div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="stock-chat-input-area">
              <textarea
                className="stock-chat-textarea"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="向AI助手提问关于股市的问题…（Enter发送，Shift+Enter换行）"
                rows={1}
                disabled={isTyping}
              />
              <button
                className="stock-chat-send-btn"
                onClick={() => handleSend()}
                disabled={isTyping || !inputText.trim()}
              >发送</button>
            </div>
          </div>
        )}

        {/* ── AI机器人 Tab ── */}
        {activeTab === 'bot' && (
          <div className="bot-panel">
            <div className="bot-header">
              <div className="bot-status">
                <span className={`bot-status-dot ${botRunning ? 'running' : 'stopped'}`} />
                <span>{botRunning ? '运行中' : '已停止'}</span>
                {botRunning && <span className="bot-interval-hint">（每5分钟决策一次）</span>}
              </div>
              <div className="bot-controls">
                {!botRunning ? (
                  <button className="bot-start-btn" onClick={handleStartBot} disabled={loadingBot || codes.length === 0}>
                    {loadingBot ? '启动中...' : '▶ 启动机器人'}
                  </button>
                ) : (
                  <button className="bot-stop-btn" onClick={handleStopBot} disabled={loadingBot}>
                    {loadingBot ? '停止中...' : '⏹ 停止机器人'}
                  </button>
                )}
              </div>
            </div>

            <div className="bot-watchlist">
              <span className="bot-watchlist-label">监控股票：</span>
              {codes.length === 0 ? (
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>请先在「行情」标签页添加股票</span>
              ) : codes.map(code => {
                const q = quoteMap.get(code);
                return (
                  <span key={code} className="bot-watchlist-tag">
                    {q ? q.name : code.toUpperCase()}
                  </span>
                );
              })}
            </div>

            {botError && <div className="stock-error">{botError}</div>}

            <div className="bot-description">
              <p>🤖 AI交易机器人是一位顶尖专业交易员，使用 DeepSeek LLM 分析行情后，在模拟账户中自动买卖你自选列表中的股票。</p>
              <p>你可以实时观察机器人的每一个决策过程和结果。</p>
            </div>

            <div className="bot-logs-header">
              <span>决策日志</span>
              <button className="stock-chat-clear-btn" onClick={loadBotStatus}>刷新</button>
            </div>
            <div className="bot-logs-container">
              {botLogs.length === 0 ? (
                <div className="stock-empty">暂无日志，启动机器人后会在此显示决策过程</div>
              ) : (
                botLogs.map(log => (
                  <div key={log.id} className={`bot-log-entry bot-log-${log.action}`}>
                    <div className="bot-log-meta">
                      <span className="bot-log-icon">{getBotLogIcon(log.action)}</span>
                      <span className="bot-log-time">{new Date(log.created_at).toLocaleString('zh-CN')}</span>
                      {log.stock_code && <span className="bot-log-code">{log.stock_code.toUpperCase()}</span>}
                    </div>
                    {log.reasoning && <div className="bot-log-reasoning">{log.reasoning}</div>}
                    {log.result && <div className="bot-log-result">{log.result}</div>}
                  </div>
                ))
              )}
              <div ref={botLogsEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockMarketPage;
