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

const DEFAULT_CODES = ['sh000001', 'sz399001', 'sz399006', 'sh000688'];

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

const StockMarketPage: React.FC = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  // Stock data state
  const [codes, setCodes] = useState<string[]>(DEFAULT_CODES);
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    document.title = '股市行情 - 工具箱';
    loadQuotes();
    // Auto-refresh every 30 seconds
    autoRefreshRef.current = setInterval(() => {
      loadQuotes(false);
    }, 30000);
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (codes.length > 0) {
      loadQuotes(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const loadQuotes = async (showLoading = true) => {
    if (codes.length === 0) return;
    if (showLoading) setLoadingQuotes(true);
    setQuoteError(null);
    try {
      const data = await stockMarketAPI.getQuotes(codes);
      setQuotes(data.quotes);
      setLastUpdate(new Date().toLocaleTimeString('zh-CN'));
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setQuoteError(e?.response?.data?.error || '获取行情数据失败');
    } finally {
      if (showLoading) setLoadingQuotes(false);
    }
  };

  const handleAddCode = useCallback(() => {
    const raw = searchInput.trim().toLowerCase();
    if (!raw) return;
    // Support bare 6-digit code or with sh/sz prefix
    let code = raw;
    if (/^\d{6}$/.test(code)) {
      // Guess market: 6xxx/688xxx = sh, 0xxx/3xxx/002xxx = sz
      code = (code.startsWith('6') || code.startsWith('5')) ? `sh${code}` : `sz${code}`;
    }
    if (!/^(sh|sz)\d{6}$/.test(code)) {
      setQuoteError('请输入有效的股票代码（如 sh600036 或 600036）');
      return;
    }
    if (codes.includes(code)) {
      setSearchInput('');
      return;
    }
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
      const allMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const data = await stockMarketAPI.chat(allMessages);
      const assistantMsg: ChatMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: data.reply,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      const errMsg: ChatMessage = {
        id: `e_${Date.now()}`,
        role: 'assistant',
        content: `❌ 请求失败：${e?.response?.data?.error || '请稍后重试'}`,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Build quote map for quick lookup
  const quoteMap = new Map(quotes.map((q) => [q.code, q]));

  return (
    <div className="stock-market-page">
      {/* Header */}
      <header className="stock-market-header">
        <div className="stock-market-header-left">
          <button className="btn btn-icon" onClick={() => navigate('/')} title="返回">←</button>
          <h1>📈 股市行情</h1>
        </div>
        <div className="stock-market-header-actions">
          <button className="btn btn-icon" onClick={toggleTheme} title="切换主题">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="stock-market-body">
        {/* Left: Stock Data */}
        <div className="stock-panel">
          <div className="stock-panel-toolbar">
            <input
              className="stock-search-input"
              type="text"
              placeholder="输入股票代码，如 600036"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            <button className="stock-search-btn" onClick={handleAddCode}>
              添加
            </button>
            <button
              className="stock-refresh-btn"
              onClick={() => loadQuotes(true)}
              disabled={loadingQuotes}
              title="刷新行情"
            >
              🔄
            </button>
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
                    <th>代码</th>
                    <th>名称</th>
                    <th>现价</th>
                    <th>涨跌幅</th>
                    <th>涨跌额</th>
                    <th>成交量</th>
                    <th></th>
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
                          <td>
                            <button className="stock-delete-btn" onClick={() => handleRemoveCode(code)}>✕</button>
                          </td>
                        </tr>
                      );
                    }
                    const changeClass = getChangeClass(q.changePercent);
                    return (
                      <tr
                        key={code}
                        title={`开盘：${q.todayOpen} | 最高：${q.todayHigh} | 最低：${q.todayLow} | 昨收：${q.yesterdayClose} | 成交额：${formatAmount(q.amount)}`}
                      >
                        <td>{q.code.toUpperCase()}</td>
                        <td>{q.name}</td>
                        <td className={`stock-price ${changeClass}`}>
                          {q.currentPrice > 0 ? q.currentPrice.toFixed(2) : '--'}
                        </td>
                        <td className={changeClass}>{formatChange(q.changePercent)}</td>
                        <td className={changeClass}>
                          {q.changeAmount > 0 ? `+${q.changeAmount.toFixed(2)}` : q.changeAmount.toFixed(2)}
                        </td>
                        <td>{q.volume > 0 ? formatVolume(q.volume) : '--'}</td>
                        <td>
                          <button className="stock-delete-btn" onClick={() => handleRemoveCode(code)}>✕</button>
                        </td>
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

        {/* Right: AI Chat */}
        <div className="stock-chat-panel">
          <div className="stock-chat-panel-header">
            <h2>🤖 AI 股市助手</h2>
            {messages.length > 0 && (
              <button className="stock-chat-clear-btn" onClick={() => setMessages([])}>
                清空对话
              </button>
            )}
          </div>

          <div className="stock-chat-messages">
            {messages.length === 0 ? (
              <div className="stock-chat-welcome">
                <h3>你好！我是股市 AI 助手 👋</h3>
                <p>我可以帮你分析行情、解读指标、讲解知识，以及回答任何关于股市的问题。</p>
                <div className="welcome-hints">
                  {WELCOME_HINTS.map((hint) => (
                    <button
                      key={hint}
                      className="welcome-hint-btn"
                      onClick={() => handleSend(hint)}
                    >
                      {hint}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`stock-msg-row ${msg.role}`}>
                  <div className="stock-msg-bubble">
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))
            )}

            {isTyping && (
              <div className="stock-msg-row assistant">
                <div className="stock-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="stock-chat-input-area">
            <textarea
              ref={textareaRef}
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
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockMarketPage;
