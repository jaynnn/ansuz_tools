import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { mindseaAPI } from '../api';
import AddNpcModal from '../components/AddNpcModal';
import '../styles/MindSeaScene.css';

interface SceneDoc {
  _id: string;
  name: string;
  description: string;
  era: string;
  setting: string;
  theme: string;
  color: number[];
  background_hint: string;
  background_image: string | null;
  is_preset: boolean;
  language_constraints: string;
}

interface NpcRelationship {
  intimacy: number;
  affinity: number;
  trust: number;
  hostility: number;
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
  scene_id: string | null;
  background_image: string | null;
  dialogue_history: Array<{ role: string; content: string }>;
}

interface PlayerCharacter {
  _id: string;
  name: string;
  occupation: string;
  background: string;
  personality: string[];
  appearance: string;
  avatar: string | null;
}

interface NpcOrbit {
  npc: NpcDoc;
  angle: number; // degrees
}

function colorToCss(color: number[]): string {
  if (!color || color.length < 3) return 'linear-gradient(135deg, #a78bfa, #ec4899)';
  const [r, g, b] = color;
  return `linear-gradient(135deg, rgb(${r},${g},${b}), rgb(${Math.min(r + 40, 255)},${Math.min(g + 20, 255)},${Math.min(b + 60, 255)}))`;
}

function getRelationshipStage(intimacy: number): string {
  if (intimacy <= 20) return '陌生';
  if (intimacy <= 40) return '相识';
  if (intimacy <= 60) return '朋友';
  if (intimacy <= 80) return '亲密';
  return '深交';
}

/** Distribute NPCs evenly around a circle, staggered on two radii for aesthetics. */
function buildOrbits(npcs: NpcDoc[]): NpcOrbit[] {
  return npcs.map((npc, i) => ({
    npc,
    angle: (360 / npcs.length) * i,
  }));
}

const MindSeaScene: React.FC = () => {
  const { sceneId } = useParams<{ sceneId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [scene, setScene] = useState<SceneDoc | null>(null);
  const [npcs, setNpcs] = useState<NpcDoc[]>([]);
  const [playerChar, setPlayerChar] = useState<PlayerCharacter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unreadNpcs, setUnreadNpcs] = useState<Set<string>>(new Set());
  const [hoveredNpc, setHoveredNpc] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState<Record<string, boolean>>({});
  const [showAddNpcModal, setShowAddNpcModal] = useState(false);
  const [showPlayerCharModal, setShowPlayerCharModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateTargetId, setGenerateTargetId] = useState<string | null>(null);
  const [extraPromptText, setExtraPromptText] = useState('');

  // Player character form state
  const [pcName, setPcName] = useState('');
  const [pcAge, setPcAge] = useState('');
  const [pcOccupation, setPcOccupation] = useState('');
  const [pcBackground, setPcBackground] = useState('');
  const [pcPersonality, setPcPersonality] = useState('');
  const [pcGoals, setPcGoals] = useState('');
  const [pcAbilities, setPcAbilities] = useState('');
  const [pcAppearance, setPcAppearance] = useState('');
  const [pcSaving, setPcSaving] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!sceneId) return;
    try {
      setLoading(true);
      const [sceneData, npcsData, pcData] = await Promise.all([
        mindseaAPI.getScene(sceneId),
        mindseaAPI.getNpcs(sceneId),
        mindseaAPI.getPlayerCharacter(sceneId),
      ]);
      setScene(sceneData.scene);
      setNpcs(npcsData.npcs || []);
      setPlayerChar(pcData.character || null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [sceneId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (scene) document.title = `心语 · ${scene.name}`;
  }, [scene]);

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

  const handleNpcClick = (npc: NpcDoc) => {
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
    if (!file.type.startsWith('image/')) { alert('请选择图片文件'); e.target.value = ''; return; }
    if (file.size > 5 * 1024 * 1024) { alert('图片大小不能超过5MB'); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const base64 = evt.target?.result as string;
      try {
        await mindseaAPI.updateNpc(npcId, { background_image: base64 });
        await fetchAll();
      } catch { alert('上传图片失败，请重试'); }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleConfirmGenerate = async () => {
    const npcId = generateTargetId;
    if (!npcId) return;
    setShowGenerateModal(false);
    setImageLoading(prev => ({ ...prev, [npcId]: true }));
    try {
      await mindseaAPI.generateImage(npcId, extraPromptText.trim() || undefined);
      await fetchAll();
    } catch (err) {
      const apiError = err as { response?: { data?: { can_retry?: boolean; prompt?: string } } };
      if (apiError.response?.data?.can_retry && apiError.response?.data?.prompt) {
        try {
          await mindseaAPI.retryImage(npcId, apiError.response.data.prompt);
          await fetchAll();
        } catch { alert('AI生成图像失败（已自动重试），请稍后再试'); }
      } else {
        alert('AI生成图像失败，请稍后重试');
      }
    } finally {
      setImageLoading(prev => ({ ...prev, [npcId]: false }));
    }
  };

  const handleSaveNpc = async (data: Record<string, unknown>) => {
    try {
      await mindseaAPI.createNpc({ ...data, scene_id: sceneId });
      await fetchAll();
      setShowAddNpcModal(false);
    } catch (err) {
      console.error('Failed to save NPC:', err);
    }
  };

  const handleSavePlayerChar = async () => {
    if (!pcName.trim() || !sceneId) return;
    setPcSaving(true);
    try {
      const data = await mindseaAPI.savePlayerCharacter(sceneId, {
        name: pcName.trim(),
        age: pcAge.trim(),
        occupation: pcOccupation.trim(),
        background: pcBackground.trim(),
        personality: pcPersonality.split(/[,，、]/).map(s => s.trim()).filter(Boolean),
        goals: pcGoals.trim(),
        abilities: pcAbilities.trim(),
        appearance: pcAppearance.trim(),
      });
      setPlayerChar(data.character);
      setShowPlayerCharModal(false);
    } catch (err) {
      alert('保存失败，请重试');
      console.error(err);
    } finally {
      setPcSaving(false);
    }
  };

  const openPlayerCharModal = () => {
    if (playerChar) {
      setPcName(playerChar.name || '');
      setPcAge('');
      setPcOccupation(playerChar.occupation || '');
      setPcBackground(playerChar.background || '');
      setPcPersonality((playerChar.personality || []).join('、'));
      setPcGoals('');
      setPcAbilities('');
      setPcAppearance(playerChar.appearance || '');
    } else {
      setPcName(''); setPcAge(''); setPcOccupation(''); setPcBackground('');
      setPcPersonality(''); setPcGoals(''); setPcAbilities(''); setPcAppearance('');
    }
    setShowPlayerCharModal(true);
  };

  const orbits = buildOrbits(npcs);

  // Connection lines: draw lines between NPCs that have relationship
  // We draw simple SVG lines to show NPC-to-NPC connections
  const renderConnections = () => {
    if (npcs.length < 2) return null;
    const center = { x: 50, y: 50 };
    const R = 34; // radius in percentage units

    return (
      <svg className="scene-connections" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        {orbits.map((o, i) => {
          const angle = (o.angle - 90) * (Math.PI / 180);
          const x = center.x + R * Math.cos(angle);
          const y = center.y + R * Math.sin(angle);
          return orbits.slice(i + 1).map((o2) => {
            const angle2 = (o2.angle - 90) * (Math.PI / 180);
            const x2 = center.x + R * Math.cos(angle2);
            const y2 = center.y + R * Math.sin(angle2);
            const intimacy = o.npc.relationship?.intimacy ?? 0;
            if (intimacy < 40) return null;
            const opacity = Math.min((intimacy - 40) / 60, 1) * 0.6;
            const strokeWidth = intimacy >= 80 ? 0.8 : 0.4;
            return (
              <line
                key={`${o.npc._id}-${o2.npc._id}`}
                x1={x} y1={y} x2={x2} y2={y2}
                stroke="rgba(167,139,250,1)"
                strokeWidth={strokeWidth}
                strokeOpacity={opacity}
                strokeDasharray={intimacy >= 80 ? undefined : '2 2'}
              />
            );
          });
        })}
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="scene-view-page">
        <div className="scene-loading">加载中…</div>
      </div>
    );
  }

  if (error || !scene) {
    return (
      <div className="scene-view-page">
        <div className="scene-error">{error || '场景不存在'}</div>
        <button className="btn" onClick={() => navigate('/mindsea')}>返回</button>
      </div>
    );
  }

  return (
    <div
      className="scene-view-page"
      style={scene.background_image
        ? { backgroundImage: `url(${scene.background_image})` }
        : { background: `linear-gradient(160deg, rgb(${scene.color[0]},${scene.color[1]},${scene.color[2]}) 0%, #0f0f1a 100%)` }
      }
    >
      {/* Header */}
      <header className="scene-view-header">
        <div className="scene-view-header-left">
          <button className="btn btn-icon scene-back-btn" onClick={() => navigate('/mindsea')} title="返回场景列表">←</button>
          <div>
            <h1 className="scene-view-title">{scene.name}</h1>
            <p className="scene-view-era">{scene.era}</p>
          </div>
        </div>
        <div className="scene-view-header-right">
          <button
            className="btn scene-player-btn"
            onClick={openPlayerCharModal}
            title={playerChar ? '编辑我的角色' : '创建我的角色'}
          >
            {playerChar ? `👤 ${playerChar.name}` : '👤 创建角色'}
          </button>
          <button className="btn btn-icon" onClick={toggleTheme} title="切换主题">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {/* Star-pattern NPC layout */}
      <div className="scene-orbit-container">
        {/* SVG connection lines */}
        {renderConnections()}

        {/* Center: player character or scene info */}
        <div className="scene-orbit-center">
          {playerChar ? (
            <div
              className="scene-player-avatar"
              onClick={openPlayerCharModal}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') openPlayerCharModal(); }}
              title="点击编辑我的角色"
            >
              {playerChar.avatar
                ? <img src={playerChar.avatar} alt={playerChar.name} />
                : <span className="scene-player-initials">{playerChar.name.slice(0, 1)}</span>
              }
              <span className="scene-player-name">{playerChar.name}</span>
              <span className="scene-player-label">{playerChar.occupation}</span>
            </div>
          ) : (
            <div
              className="scene-player-empty"
              onClick={openPlayerCharModal}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') openPlayerCharModal(); }}
            >
              <span className="scene-player-empty-icon">👤</span>
              <span className="scene-player-empty-text">创建<br />我的角色</span>
            </div>
          )}
        </div>

        {/* NPC nodes */}
        {orbits.map((orbit) => {
          const { npc, angle } = orbit;
          const R = 34; // orbit radius percentage
          const rad = (angle - 90) * (Math.PI / 180);
          const x = 50 + R * Math.cos(rad);
          const y = 50 + R * Math.sin(rad);
          const isHovered = hoveredNpc === npc._id;
          const stage = getRelationshipStage(npc.relationship?.intimacy ?? 10);
          const hasUnread = unreadNpcs.has(npc._id);
          const isLoading = imageLoading[npc._id];

          return (
            <div
              key={npc._id}
              className={`scene-npc-node${isHovered ? ' hovered' : ''}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              onClick={() => handleNpcClick(npc)}
              onMouseEnter={() => setHoveredNpc(npc._id)}
              onMouseLeave={() => setHoveredNpc(null)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNpcClick(npc); } }}
              role="button"
              tabIndex={0}
              aria-label={`与${npc.name}对话`}
            >
              {/* Avatar */}
              <div
                className="scene-npc-avatar"
                style={npc.background_image
                  ? { backgroundImage: `url(${npc.background_image})` }
                  : { background: colorToCss(npc.color) }
                }
              >
                {isLoading && <div className="scene-npc-avatar-loading"><div className="spinner-sm" /></div>}
                {hasUnread && <span className="scene-npc-unread-dot" />}
              </div>

              {/* Name + stage below avatar */}
              <div className="scene-npc-label">
                <span className="scene-npc-name">{npc.name}</span>
                <span className="scene-npc-stage">{stage}</span>
              </div>

              {/* Hover card */}
              {isHovered && (
                <div className="scene-npc-hover-card" onClick={e => e.stopPropagation()}>
                  <div className="scene-npc-hover-name">{npc.name}</div>
                  <div className="scene-npc-hover-occ">{npc.occupation}</div>
                  {npc.current_action && (
                    <div className="scene-npc-hover-action">💬 {npc.current_action}</div>
                  )}
                  <div className="scene-npc-hover-btns">
                    <button
                      className="btn-xs"
                      onClick={(e) => { e.stopPropagation(); handleUploadImage(npc._id); }}
                    >🖼 上传</button>
                    <button
                      className="btn-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setGenerateTargetId(npc._id);
                        setExtraPromptText('');
                        setShowGenerateModal(true);
                      }}
                    >✨ AI生成</button>
                  </div>
                  <button
                    className="btn-xs btn-primary-xs"
                    style={{ marginTop: 6, width: '100%' }}
                    onClick={() => handleNpcClick(npc)}
                  >开始对话 →</button>
                </div>
              )}
            </div>
          );
        })}

        {/* Add NPC button */}
        <button
          className="scene-add-npc-btn"
          onClick={() => setShowAddNpcModal(true)}
          title="添加角色"
          aria-label="添加新角色"
        >
          +
        </button>
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* NPC count & scene info footer */}
      <div className="scene-footer-info">
        <span>{npcs.length} 位角色 · {scene.theme}</span>
      </div>

      {/* Add NPC Modal */}
      {showAddNpcModal && (
        <AddNpcModal
          npc={null}
          onClose={() => setShowAddNpcModal(false)}
          onSave={handleSaveNpc}
        />
      )}

      {/* Generate image modal */}
      {showGenerateModal && (
        <div className="generate-modal-backdrop" onClick={() => setShowGenerateModal(false)}>
          <div className="generate-modal" onClick={e => e.stopPropagation()}>
            <h3 className="generate-modal-title">✨ AI生成形象图</h3>
            <p className="generate-modal-desc">可补充形象描述（可选），留空则自动生成：</p>
            <textarea
              className="generate-modal-textarea"
              placeholder="例如：穿着锦袍，背景是宫廷庭院…"
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

      {/* Player character modal */}
      {showPlayerCharModal && (
        <div className="modal-backdrop" onClick={() => setShowPlayerCharModal(false)}>
          <div className="modal-box player-char-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {playerChar ? '✏️ 编辑我的角色' : '👤 创建我的角色'}
              </h2>
              <button className="modal-close" onClick={() => setShowPlayerCharModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="player-char-modal-hint">
                在「{scene.name}」中，你将扮演谁？请设定你的角色信息，AI将根据此生成各NPC对你的初始印象。
              </p>
              <div className="form-row">
                <label className="form-label">角色名称 <span className="required">*</span></label>
                <input className="form-input" value={pcName} onChange={e => setPcName(e.target.value)} placeholder="角色名称" />
              </div>
              <div className="form-row-two">
                <div className="form-row">
                  <label className="form-label">年龄</label>
                  <input className="form-input" value={pcAge} onChange={e => setPcAge(e.target.value)} placeholder="如：25" />
                </div>
                <div className="form-row">
                  <label className="form-label">身份/职业</label>
                  <input className="form-input" value={pcOccupation} onChange={e => setPcOccupation(e.target.value)} placeholder="如：皇帝、游侠" />
                </div>
              </div>
              <div className="form-row">
                <label className="form-label">背景经历</label>
                <textarea className="form-textarea" value={pcBackground} onChange={e => setPcBackground(e.target.value)} placeholder="角色的背景故事、经历…" rows={3} />
              </div>
              <div className="form-row">
                <label className="form-label">性格特点</label>
                <input className="form-input" value={pcPersonality} onChange={e => setPcPersonality(e.target.value)} placeholder="如：睿智、果断、仁慈（逗号分隔）" />
              </div>
              <div className="form-row">
                <label className="form-label">目标与动机</label>
                <input className="form-input" value={pcGoals} onChange={e => setPcGoals(e.target.value)} placeholder="角色的目标或追求" />
              </div>
              <div className="form-row">
                <label className="form-label">能力特长</label>
                <input className="form-input" value={pcAbilities} onChange={e => setPcAbilities(e.target.value)} placeholder="角色擅长的领域或技能" />
              </div>
              <div className="form-row">
                <label className="form-label">外貌描述</label>
                <input className="form-input" value={pcAppearance} onChange={e => setPcAppearance(e.target.value)} placeholder="外貌特征描述（用于AI生成头像）" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowPlayerCharModal(false)}>取消</button>
              <button
                className="btn btn-primary"
                onClick={handleSavePlayerChar}
                disabled={!pcName.trim() || pcSaving}
              >
                {pcSaving ? '保存中…' : '确认创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MindSeaScene;
