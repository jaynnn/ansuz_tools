import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { mindseaAPI } from '../api';
import AddNpcModal from '../components/AddNpcModal';
import '../styles/MindSea.css';

interface NpcRelationship {
  trust: number;
  intimacy: number;
  respect: number;
  safety: number;
  commitment: number;
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
  relationship: NpcRelationship;
  is_public: boolean;
  background_image: string | null;
  dialogue_history: Array<{ role: string; content: string }>;
}

function getRelationshipStage(intimacy: number): string {
  if (intimacy <= 20) return '陌生';
  if (intimacy <= 40) return '相识';
  if (intimacy <= 60) return '朋友';
  if (intimacy <= 80) return '亲密';
  return '深交';
}

function colorToCss(color: number[]): string {
  if (!color || color.length < 3) return 'linear-gradient(135deg, #a78bfa, #ec4899)';
  const [r, g, b] = color;
  return `linear-gradient(135deg, rgb(${r},${g},${b}), rgb(${Math.min(r + 40, 255)},${Math.min(g + 20, 255)},${Math.min(b + 60, 255)}))`;
}

const MindSea: React.FC = () => {
  const [npcs, setNpcs] = useState<NpcDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editNpc, setEditNpc] = useState<NpcDoc | null>(null);
  const [unreadNpcs, setUnreadNpcs] = useState<Set<string>>(new Set());
  const [chattingNpcId, setChattingNpcId] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState<Record<string, boolean>>({});
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateModalNpcId, setGenerateModalNpcId] = useState<string | null>(null);
  const [extraPromptText, setExtraPromptText] = useState('');
  const navigate = useNavigate();
  const { token } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const socketRef = useRef<Socket | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<string | null>(null);

  useEffect(() => {
    document.title = 'MindSea';
    fetchNpcs();
    // Check if there's a chatting NPC in session
    const lastChat = sessionStorage.getItem('mindsea_chatting');
    if (lastChat) setChattingNpcId(lastChat);
  }, []);

  useEffect(() => {
    if (!token) return;
    const SOCKET_URL = import.meta.env.DEV ? 'http://localhost:4000' : window.location.origin;
    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;
    socket.on('npc_proactive', (data: { npc_id: string }) => {
      setUnreadNpcs(prev => new Set([...prev, data.npc_id]));
    });
    return () => { socket.disconnect(); };
  }, [token]);

  const fetchNpcs = async () => {
    try {
      setLoading(true);
      const data = await mindseaAPI.getNpcs();
      setNpcs(data.npcs || []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = (npc: NpcDoc) => {
    sessionStorage.setItem('mindsea_chatting', npc._id);
    setUnreadNpcs(prev => { const s = new Set(prev); s.delete(npc._id); return s; });
    navigate(`/mindsea/chat/${npc._id}`);
  };

  const handleUploadImage = (npcId: string) => {
    uploadTargetRef.current = npcId;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const npcId = uploadTargetRef.current;
    if (!file || !npcId) return;
    // Validate file type and size (max 5MB)
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
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
        await mindseaAPI.updateNpc(npcId, { background_image: base64 });
        await fetchNpcs();
      } catch {
        alert('上传图片失败，请重试');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleOpenGenerateModal = (e: React.MouseEvent, npcId: string) => {
    e.stopPropagation();
    setGenerateModalNpcId(npcId);
    setExtraPromptText('');
    setShowGenerateModal(true);
  };

  const handleConfirmGenerate = async () => {
    const npcId = generateModalNpcId;
    if (!npcId) return;
    setShowGenerateModal(false);
    setImageLoading(prev => ({ ...prev, [npcId]: true }));
    try {
      await mindseaAPI.generateImage(npcId, extraPromptText.trim() || undefined);
      await fetchNpcs();
    } catch (err) {
      const apiError = err as { response?: { data?: { can_retry?: boolean; prompt?: string } } };
      if (apiError.response?.data?.can_retry && apiError.response?.data?.prompt) {
        try {
          await mindseaAPI.retryImage(npcId, apiError.response.data.prompt);
          await fetchNpcs();
        } catch {
          alert('AI生成图像失败（已自动重试），请稍后再试');
        }
      } else {
        alert('AI生成图像失败，请稍后重试');
      }
    } finally {
      setImageLoading(prev => ({ ...prev, [npcId]: false }));
    }
  };

  const handleSaveNpc = async (data: Record<string, unknown>) => {
    try {
      if (editNpc) {
        await mindseaAPI.updateNpc(editNpc._id, data);
      } else {
        await mindseaAPI.createNpc(data);
      }
      await fetchNpcs();
      setShowAddModal(false);
      setEditNpc(null);
    } catch (err) {
      console.error('Failed to save NPC:', err);
    }
  };

  return (
    <div className="mindsea-page">
      <header className="mindsea-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-icon" onClick={() => navigate('/')} title="返回">←</button>
          <h1>MindSea</h1>
        </div>
        <div className="mindsea-header-actions">
          <button className="btn btn-icon" onClick={toggleTheme} title="切换主题">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      <div className="mindsea-content">
        {loading && <div className="mindsea-loading">加载中…</div>}
        {error && <div className="mindsea-error">{error}</div>}
        {!loading && !error && (
          <div className="npc-grid">
            {npcs.map(npc => {
              const stage = getRelationshipStage(npc.relationship?.intimacy ?? 10);
              const lastMsg = npc.dialogue_history?.slice(-1)[0]?.content || '';
              const isLoading = imageLoading[npc._id];
              const isChatting = chattingNpcId === npc._id;

              return (
                <div
                  key={npc._id}
                  className="npc-card"
                  onClick={() => handleCardClick(npc)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(npc); } }}
                  role="button"
                  tabIndex={0}
                  aria-label={`与${npc.name}对话`}
                >
                  <div
                    className="npc-card-bg"
                    style={npc.background_image
                      ? { backgroundImage: `url(${npc.background_image})` }
                      : { background: colorToCss(npc.color) }
                    }
                  />
                  <div className="npc-card-overlay" />

                  {isLoading && (
                    <div className="npc-image-loading">
                      <div className="spinner" />
                      生成中…
                    </div>
                  )}

                  <div className="npc-card-top">
                    <span className={`npc-status-badge${isChatting ? ' chatting' : ''}`}>
                      {isChatting ? '对话中' : '空闲'}
                    </span>
                    {unreadNpcs.has(npc._id) && <span className="npc-unread-dot" />}
                  </div>

                  <div className="npc-card-bottom">
                    <div className="npc-card-name">{npc.name}</div>
                    <div className="npc-card-stage">{stage}</div>
                    {lastMsg && (
                      <div className="npc-card-preview">{lastMsg}</div>
                    )}
                  </div>

                  <div className="npc-hover-overlay">
                    {!npc.is_public && (
                      <div className="npc-hover-top-actions" onClick={e => e.stopPropagation()}>
                        <button
                          className="npc-hover-btn"
                          title="上传形象图"
                          onClick={(e) => { e.stopPropagation(); handleUploadImage(npc._id); }}
                        >🖼 上传形象</button>
                        <button
                          className="npc-hover-btn"
                          title="AI生成形象图"
                          onClick={(e) => handleOpenGenerateModal(e, npc._id)}
                        >✨ AI生成</button>
                      </div>
                    )}
                    <span className="npc-hover-text">开始对话 →</span>
                  </div>
                </div>
              );
            })}

            {/* Add NPC card */}
            <div
              className="add-npc-card"
              onClick={() => { setEditNpc(null); setShowAddModal(true); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowAddModal(true); } }}
              role="button"
              tabIndex={0}
              aria-label="新增角色"
            >
              <div className="add-npc-icon">＋</div>
              <div className="add-npc-label">新增角色</div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {showAddModal && (
        <AddNpcModal
          npc={editNpc}
          onClose={() => { setShowAddModal(false); setEditNpc(null); }}
          onSave={handleSaveNpc}
        />
      )}

      {showGenerateModal && (
        <div className="generate-modal-backdrop" onClick={() => setShowGenerateModal(false)}>
          <div className="generate-modal" onClick={e => e.stopPropagation()}>
            <h3 className="generate-modal-title">✨ AI生成形象图</h3>
            <p className="generate-modal-desc">可补充角色形象描述（可选），留空则使用角色设定自动生成：</p>
            <textarea
              className="generate-modal-textarea"
              placeholder="例如：穿着红色旗袍，背景是樱花盛开的庭院…"
              value={extraPromptText}
              onChange={e => setExtraPromptText(e.target.value)}
              rows={3}
            />
            <div className="generate-modal-actions">
              <button className="btn" onClick={() => setShowGenerateModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleConfirmGenerate}>开始生成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MindSea;
