import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { mindseaAPI } from '../api';
import '../styles/MindSeaChat.css';

interface NpcRelationship {
  trust: number;
  intimacy: number;
  respect: number;
  safety: number;
  commitment: number;
}

interface FatigueState {
  cognitive_load: number;
  mental_energy: number;
  dialogue_benefit: number;
  fatigue_score: number;
}

interface ImpressionValue {
  value: string;
  score: number;
}

interface ImpressionFeature {
  key: string;
  label: string;
  score: number;
  values: ImpressionValue[];
}

interface NpcDoc {
  _id: string;
  name: string;
  age: string;
  occupation: string;
  background: string;
  color: number[];
  location: string;
  current_action: string;
  system_prompt: string;
  relationship: NpcRelationship;
  fatigue: FatigueState;
  impression_features: ImpressionFeature[];
  dialogue_history: Array<{ role: string; content: string; timestamp: string }>;
  is_public: boolean;
  background_image: string | null;
  chat_background_image: string | null;
}

interface ChatMessage {
  role: 'user' | 'npc';
  content: string;
  id: string;
}

interface LogEntry {
  id: string;
  type: string;
  message: string;
  timestamp: Date;
}

function getRelationshipStage(intimacy: number): string {
  if (intimacy <= 20) return '陌生';
  if (intimacy <= 40) return '相识';
  if (intimacy <= 60) return '朋友';
  if (intimacy <= 80) return '亲密';
  return '深交';
}

function colorToCss(color: number[]): string {
  if (!color || color.length < 3) return '#a78bfa';
  const [r, g, b] = color;
  return `rgb(${r},${g},${b})`;
}

function getLogTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    tone: '🟡',
    impression: '🔵',
    fatigue: '🟠',
    relationship: '🌸',
    memory: '🟣',
    proactive: '🟢',
    scene: '📍',
  };
  return icons[type] || '⚪';
}

// Render message content with action descriptions in italic
const MessageContent: React.FC<{ content: string; isUser: boolean }> = ({ content, isUser }) => {
  const parts = content.split(/(（[^）]*）|\([^)]*\))/g);
  return (
    <>
      {parts.map((part, i) => {
        const isAction = /^（.*）$/.test(part) || /^\(.*\)$/.test(part);
        if (isAction) {
          return <span key={i} className="msg-action" style={isUser ? { opacity: 0.8 } : {}}>{part}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
};

const MindSeaChat: React.FC = () => {
  const { npcId } = useParams<{ npcId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [npc, setNpc] = useState<NpcDoc | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [rightPanel, setRightPanel] = useState<'none' | 'status' | 'log'>('none');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [relationship, setRelationship] = useState<NpcRelationship | null>(null);
  const [fatigue, setFatigue] = useState<FatigueState | null>(null);
  const [impressionFeatures, setImpressionFeatures] = useState<ImpressionFeature[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [extraPromptText, setExtraPromptText] = useState('');
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addLog = useCallback((type: string, message: string) => {
    const entry: LogEntry = { id: Date.now() + Math.random().toString(), type, message, timestamp: new Date() };
    setLogs(prev => [...prev.slice(-199), entry]);
  }, []);

  useEffect(() => {
    if (!npcId) return;
    document.title = 'MindSea Chat';
    sessionStorage.setItem('mindsea_chatting', npcId);
    fetchNpc();
    setupSocket();
    return () => {
      socketRef.current?.disconnect();
      sessionStorage.removeItem('mindsea_chatting');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [npcId]);

  const fetchNpc = async () => {
    if (!npcId) return;
    try {
      const data = await mindseaAPI.getNpc(npcId);
      const n: NpcDoc = data.npc;
      setNpc(n);
      setRelationship(n.relationship);
      setFatigue(n.fatigue);
      setImpressionFeatures(n.impression_features || []);
      // Load dialogue history into messages
      const history: ChatMessage[] = n.dialogue_history.map((h, i) => ({
        role: h.role === 'user' ? 'user' as const : 'npc' as const,
        content: h.content,
        id: `hist_${i}`,
      }));
      setMessages(history);
    } catch (err) {
      console.error('Failed to load NPC:', err);
    }
  };

  const setupSocket = () => {
    if (!token) return;
    const SOCKET_URL = import.meta.env.DEV ? 'http://localhost:4000' : window.location.origin;
    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('npc_relationship_update', (data: { npc_id: string; relationship: NpcRelationship }) => {
      if (data.npc_id === npcId) setRelationship(data.relationship);
    });
    socket.on('npc_fatigue_update', (data: { npc_id: string; fatigue: FatigueState }) => {
      if (data.npc_id === npcId) setFatigue(data.fatigue);
    });
    socket.on('npc_log', (data: { type: string; npc_id: string; message: string }) => {
      if (data.npc_id === npcId) addLog(data.type, data.message);
    });
    socket.on('npc_impression_update', (data: { npc_id: string; updates: Array<{ key: string; value: string }> }) => {
      if (data.npc_id === npcId) {
        addLog('impression', `印象更新: ${data.updates.map(u => u.key).join(', ')}`);
        fetchNpc(); // refresh to get updated impressions
      }
    });
    socket.on('npc_proactive', (data: { npc_id: string; content: string }) => {
      if (data.npc_id === npcId) {
        const msgId = `proactive_${Date.now()}`;
        setMessages(prev => [...prev, { role: 'npc', content: data.content, id: msgId }]);
        addLog('proactive', `主动消息: ${data.content.substring(0, 30)}…`);
      }
    });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isTyping || !npcId) return;
    setInputText('');
    const userMsgId = `user_${Date.now()}`;
    setMessages(prev => [...prev, { role: 'user', content: text, id: userMsgId }]);
    setIsTyping(true);

    try {
      const data = await mindseaAPI.chat(npcId, text);
      const npcMsgId = `npc_${Date.now()}`;
      setMessages(prev => [...prev, { role: 'npc', content: data.reply, id: npcMsgId }]);
      if (data.relationship) setRelationship(data.relationship);
      if (data.fatigue) setFatigue(data.fatigue);
    } catch (err) {
      const npcMsgId = `err_${Date.now()}`;
      setMessages(prev => [...prev, { role: 'npc', content: '（系统错误，请稍后重试）', id: npcMsgId }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearHistory = async () => {
    if (!npcId) return;
    try {
      await mindseaAPI.clearHistory(npcId);
      setMessages([]);
      setShowClearConfirm(false);
    } catch { /* ignore */ }
  };

  const togglePanel = (panel: 'status' | 'log') => {
    setRightPanel(prev => prev === panel ? 'none' : panel);
  };

  const handleUploadImage = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !npcId) return;
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件（支持 JPG、PNG、GIF 等格式）');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过5MB');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const base64 = evt.target?.result as string;
      try {
        await mindseaAPI.updateNpc(npcId, { chat_background_image: base64 });
        await fetchNpc();
      } catch (uploadErr) {
        console.error('Failed to upload image:', uploadErr);
        alert('上传图片失败，请重试');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleOpenGenerateModal = () => {
    setExtraPromptText('');
    setShowGenerateModal(true);
  };

  const handleConfirmGenerate = async () => {
    if (!npcId) return;
    setShowGenerateModal(false);
    setImageLoading(true);
    try {
      await mindseaAPI.generateChatBackground(npcId, extraPromptText.trim() || undefined);
      await fetchNpc();
    } catch {
      alert('AI生成聊天背景失败，请稍后重试');
    } finally {
      setImageLoading(false);
    }
  };

  const relMap: Array<{ key: keyof NpcRelationship; label: string }> = [
    { key: 'trust', label: '信任' },
    { key: 'intimacy', label: '亲密' },
    { key: 'respect', label: '尊重' },
    { key: 'safety', label: '安全' },
    { key: 'commitment', label: '承诺' },
  ];

  if (!npc) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>加载中…</div>;
  }

  const stage = getRelationshipStage(relationship?.intimacy ?? 10);
  const avatarColor = colorToCss(npc.color);

  return (
    <div className="mindsea-chat-page">
      <div className="chat-main">
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-npc">
            <div
              className="npc-avatar-circle"
              style={{ background: avatarColor }}
            >
              {npc.name[0]}
            </div>
            <div className="npc-header-info">
              <div className="npc-header-name">{npc.name}</div>
              <div className="npc-header-stage">{stage}</div>
              <div className="npc-header-bg" title={npc.background}>
                {npc.background.substring(0, 40)}…
              </div>
            </div>
          </div>

          <div className="chat-header-divider header-desktop-only" />

          {relationship && (
            <div className="header-rel-bars header-desktop-only">
              {relMap.map(({ key, label }) => (
                <div key={key} className="header-rel-bar">
                  <span>{label}</span>
                  <div className="header-rel-bar-track">
                    <div className="header-rel-bar-fill" style={{ width: `${relationship[key]}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="chat-header-divider header-desktop-only" />

          <div className="header-scene header-desktop-only">
            <div className="header-scene-loc">📍 {npc.location}</div>
            <div className="header-scene-action">{npc.current_action}</div>
          </div>

          <div className="chat-header-actions header-desktop-only">
            <button
              className="btn btn-icon"
              onClick={handleUploadImage}
              title="上传聊天背景"
              disabled={imageLoading}
            >🖼</button>
            <button
              className="btn btn-icon"
              onClick={handleOpenGenerateModal}
              title="AI生成聊天背景"
              disabled={imageLoading}
            >{imageLoading ? '⏳' : '✨'}</button>
            <button
              className={`btn btn-icon${rightPanel === 'status' ? ' active' : ''}`}
              onClick={() => togglePanel('status')}
              title="状态面板"
            >📊</button>
            <button
              className={`btn btn-icon${rightPanel === 'log' ? ' active' : ''}`}
              onClick={() => togglePanel('log')}
              title="日志"
            >🔍</button>
            <button
              className="btn btn-icon btn-danger"
              onClick={() => setShowClearConfirm(true)}
              title="清除记录"
            >🗑</button>
            <button
              className="btn btn-icon"
              onClick={() => navigate('/mindsea')}
              title="返回"
            >←</button>
          </div>

          {/* Mobile-only: collapse all actions into a single toggle */}
          <button
            className={`btn btn-icon header-mobile-toggle${showHeaderMenu ? ' active' : ''}`}
            onClick={() => setShowHeaderMenu(m => !m)}
            title="更多操作"
          >⋯</button>
        </div>

        {/* Messages */}
        <div
          className={`chat-messages${npc.chat_background_image ? ' has-chat-bg' : ''}`}
          style={npc.chat_background_image ? {
            backgroundImage: `url(${npc.chat_background_image})`,
          } : undefined}
        >
          {messages.map(msg => (
            <div key={msg.id} className={`message-row ${msg.role === 'user' ? 'user' : 'npc'}`}>
              {msg.role === 'npc' && (
                <div
                  className="message-avatar"
                  style={{ background: avatarColor }}
                >
                  {npc.name[0]}
                </div>
              )}
              <div className="message-bubble">
                <MessageContent content={msg.content} isUser={msg.role === 'user'} />
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="message-row npc">
              <div className="message-avatar" style={{ background: avatarColor }}>
                {npc.name[0]}
              </div>
              <div className="typing-indicator">
                <div className="typing-dots">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息… (Enter发送, Shift+Enter换行)"
            rows={1}
            disabled={isTyping}
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={isTyping || !inputText.trim()}
          >
            发送
          </button>
        </div>
      </div>

      {/* Right panel */}
      <div className={`chat-right-panel${rightPanel === 'none' ? ' collapsed' : ''}`}>
        {rightPanel !== 'none' && (
          <>
            <div className="panel-tabs">
              <button
                className={`panel-tab${rightPanel === 'status' ? ' active' : ''}`}
                onClick={() => setRightPanel('status')}
              >状态</button>
              <button
                className={`panel-tab${rightPanel === 'log' ? ' active' : ''}`}
                onClick={() => setRightPanel('log')}
              >日志</button>
            </div>

            <div className="panel-content">
              {rightPanel === 'status' && (
                <>
                  {/* Relationship */}
                  <div className="status-section">
                    <h4>关系维度</h4>
                    {relationship && relMap.map(({ key, label }) => (
                      <div key={key} className="rel-bar-row">
                        <span className="rel-bar-label">{label}</span>
                        <div className="rel-bar-track">
                          <div className="rel-bar-fill" style={{ width: `${relationship[key]}%` }} />
                        </div>
                        <span className="rel-bar-val">{relationship[key]}</span>
                      </div>
                    ))}
                  </div>

                  {/* Fatigue */}
                  {fatigue && (
                    <div className="status-section">
                      <h4>疲劳状态</h4>
                      <div className="fatigue-grid">
                        <div className="fatigue-item">
                          <div className="fatigue-item-label">认知负荷</div>
                          <div className="fatigue-item-val">{fatigue.cognitive_load}</div>
                        </div>
                        <div className="fatigue-item">
                          <div className="fatigue-item-label">精神能量</div>
                          <div className="fatigue-item-val">{fatigue.mental_energy}</div>
                        </div>
                        <div className="fatigue-item">
                          <div className="fatigue-item-label">对话收益</div>
                          <div className="fatigue-item-val">{fatigue.dialogue_benefit}</div>
                        </div>
                        <div className="fatigue-item">
                          <div className="fatigue-item-label">疲劳分数</div>
                          <div className="fatigue-item-val" style={{ color: fatigue.fatigue_score > 70 ? '#ef4444' : 'inherit' }}>
                            {Math.round(fatigue.fatigue_score)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Impressions */}
                  {impressionFeatures.length > 0 && (
                    <div className="status-section">
                      <h4>印象档案</h4>
                      {impressionFeatures.map(feat => (
                        <div key={feat.key} className="impression-feat">
                          <div className="impression-feat-header">
                            <span className="impression-feat-label">{feat.label}</span>
                            <span className="impression-feat-score">{feat.score}/10</span>
                          </div>
                          {feat.values.length > 0 && (
                            <div className="impression-feat-values">
                              {feat.values.slice(-4).map((v, i) => (
                                <span key={i} className="impression-tag">{v.value}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {rightPanel === 'log' && (
                <>
                  <div className="log-header">
                    <span>调试日志</span>
                    <button
                      className="btn"
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={() => setLogs([])}
                    >清除</button>
                  </div>
                  <div className="log-entries">
                    {logs.length === 0 && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center', marginTop: 20 }}>
                        暂无日志
                      </div>
                    )}
                    {[...logs].reverse().map(entry => (
                      <div key={entry.id} className={`log-entry ${entry.type}`}>
                        <span className="log-entry-type">{getLogTypeIcon(entry.type)}</span>
                        {entry.message}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Mobile header dropdown menu */}
      {showHeaderMenu && (
        <div className="header-mobile-menu-backdrop" role="presentation" onClick={() => setShowHeaderMenu(false)}>
          <div className="header-mobile-menu" onClick={e => e.stopPropagation()}>
            <button
              className="header-mobile-menu-item"
              onClick={() => { handleUploadImage(); setShowHeaderMenu(false); }}
              disabled={imageLoading}
            >🖼 上传聊天背景</button>
            <button
              className="header-mobile-menu-item"
              onClick={() => { handleOpenGenerateModal(); setShowHeaderMenu(false); }}
              disabled={imageLoading}
            >{imageLoading ? '⏳' : '✨'} AI生成聊天背景</button>
            <button
              className={`header-mobile-menu-item${rightPanel === 'status' ? ' active' : ''}`}
              onClick={() => { togglePanel('status'); setShowHeaderMenu(false); }}
            >📊 状态面板</button>
            <button
              className={`header-mobile-menu-item${rightPanel === 'log' ? ' active' : ''}`}
              onClick={() => { togglePanel('log'); setShowHeaderMenu(false); }}
            >🔍 日志</button>
            <button
              className="header-mobile-menu-item danger"
              onClick={() => { setShowClearConfirm(true); setShowHeaderMenu(false); }}
            >🗑 清除记录</button>
            <button
              className="header-mobile-menu-item"
              onClick={() => navigate('/mindsea')}
            >← 返回</button>
          </div>
        </div>
      )}

      {/* Clear confirm */}
      {showClearConfirm && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            style={{
              background: 'var(--bg-secondary)', borderRadius: 12, padding: 24,
              maxWidth: 320, width: '90%',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px' }}>确认清除</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 16px' }}>
              确定要清除与 {npc.name} 的所有对话记录吗？此操作不可撤销。
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowClearConfirm(false)}>取消</button>
              <button className="btn btn-danger" onClick={handleClearHistory}>确认清除</button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* AI Generate Modal */}
      {showGenerateModal && (
        <div className="chat-generate-modal-backdrop" onClick={() => setShowGenerateModal(false)}>
          <div className="chat-generate-modal" onClick={e => e.stopPropagation()}>
            <h3 className="chat-generate-modal-title">✨ AI生成聊天背景</h3>
            <p className="chat-generate-modal-desc">可补充场景描述（可选），留空则根据角色所在地点自动生成：</p>
            <textarea
              className="chat-generate-modal-textarea"
              placeholder="例如：夜晚的咖啡馆，窗外灯光点点…"
              value={extraPromptText}
              onChange={e => setExtraPromptText(e.target.value)}
              rows={3}
            />
            <div className="chat-generate-modal-actions">
              <button className="btn" onClick={() => setShowGenerateModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleConfirmGenerate}>开始生成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MindSeaChat;
