import React, { useState } from 'react';
import { mindseaAPI } from '../api';

interface ImpressionFeature {
  key: string;
  label: string;
  description: string;
  score: number;
  values: Array<{ value: string; score: number; trigger_suitable: boolean }>;
}

interface NpcDoc {
  _id?: string;
  name?: string;
  age?: string;
  occupation?: string;
  background?: string;
  personality?: string[];
  mbti?: string;
  color?: number[];
  location?: string;
  current_action?: string;
  system_prompt?: string;
  specific_rules?: {
    opening_mannerisms: string;
    speech_style: string;
    emotional_expression: string;
  };
  impression_features?: ImpressionFeature[];
}

interface Props {
  npc?: NpcDoc | null;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}

const PRESET_COLORS = [
  [180, 210, 235], [255, 180, 100], [150, 100, 200],
  [100, 200, 180], [255, 150, 150], [180, 230, 150],
  [200, 160, 100], [140, 180, 255], [255, 200, 220],
];

const AddNpcModal: React.FC<Props> = ({ npc, onClose, onSave }) => {
  const isEdit = !!npc?._id;

  const [name, setName] = useState(npc?.name || '');
  const [age, setAge] = useState(npc?.age || '');
  const [occupation, setOccupation] = useState(npc?.occupation || '');
  const [personalityDesc, setPersonalityDesc] = useState(npc?.personality?.join('、') || '');
  const [backgroundBrief, setBackgroundBrief] = useState(npc?.background || '');
  const [color, setColor] = useState<number[]>(npc?.color || [180, 210, 235]);
  const [location, setLocation] = useState(npc?.location || '');
  const [currentAction, setCurrentAction] = useState(npc?.current_action || '');
  const [systemPrompt, setSystemPrompt] = useState(npc?.system_prompt || '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [generatingConfig, setGeneratingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [aiPreview, setAiPreview] = useState<Record<string, unknown> | null>(null);

  const handleGenerateConfig = async () => {
    if (!name) { setError('请先填写角色名称'); return; }
    setGeneratingConfig(true);
    setError('');
    try {
      const data = await mindseaAPI.generateConfig({ name, age, occupation, personality_desc: personalityDesc, background_brief: backgroundBrief });
      setAiPreview(data.config);
      // Auto-fill fields from generated config
      if (data.config.background) setBackgroundBrief(data.config.background as string);
      if (data.config.location) setLocation(data.config.location as string);
      if (data.config.current_action) setCurrentAction(data.config.current_action as string);
      if (data.config.system_prompt) setSystemPrompt(data.config.system_prompt as string);
      if (Array.isArray(data.config.color)) setColor(data.config.color as number[]);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error || 'AI生成失败');
    } finally {
      setGeneratingConfig(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('请填写角色名称'); return; }
    setSaving(true);
    setError('');
    const base = aiPreview || {};
    const data: Record<string, unknown> = {
      ...base,
      name: name.trim(),
      age,
      occupation,
      background: backgroundBrief,
      personality: personalityDesc.split(/[、,，]/).map(s => s.trim()).filter(Boolean),
      color,
      location,
      current_action: currentAction,
      system_prompt: systemPrompt,
    };
    try {
      await onSave(data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-secondary)', borderRadius: 16, padding: 24,
          width: '100%', maxWidth: 520, maxHeight: '85vh', overflow: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{isEdit ? '编辑角色' : '新增角色'}</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-secondary)' }}
          >✕</button>
        </div>

        {error && (
          <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Basic Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={labelStyle}>
              <span>角色名称 *</span>
              <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="如：初雪" />
            </label>
            <label style={labelStyle}>
              <span>年龄</span>
              <input style={inputStyle} value={age} onChange={e => setAge(e.target.value)} placeholder="如：19岁" />
            </label>
          </div>

          <label style={labelStyle}>
            <span>职业</span>
            <input style={inputStyle} value={occupation} onChange={e => setOccupation(e.target.value)} placeholder="如：图书馆管理员" />
          </label>

          <label style={labelStyle}>
            <span>性格描述</span>
            <input style={inputStyle} value={personalityDesc} onChange={e => setPersonalityDesc(e.target.value)} placeholder="如：温柔、内敛、博学" />
          </label>

          <label style={labelStyle}>
            <span>背景简介</span>
            <textarea
              style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
              value={backgroundBrief}
              onChange={e => setBackgroundBrief(e.target.value)}
              placeholder="角色的背景故事（包含外貌描述有助于生成图片）"
            />
          </label>

          {/* Color picker */}
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>角色代表色</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PRESET_COLORS.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: `rgb(${c[0]},${c[1]},${c[2]})`,
                    outline: color[0] === c[0] && color[1] === c[1] ? '3px solid #a78bfa' : 'none',
                    outlineOffset: 2,
                  }}
                />
              ))}
              <input
                type="color"
                value={`#${color.map(v => v.toString(16).padStart(2, '0')).join('')}`}
                onChange={e => {
                  const hex = e.target.value.slice(1);
                  if (hex.length === 6) {
                    const r = parseInt(hex.slice(0,2), 16);
                    const g = parseInt(hex.slice(2,4), 16);
                    const b = parseInt(hex.slice(4,6), 16);
                    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
                      setColor([r, g, b]);
                    }
                  }
                }}
                style={{ width: 28, height: 28, padding: 0, border: 'none', borderRadius: '50%', cursor: 'pointer' }}
                title="自定义颜色"
              />
            </div>
          </div>

          {/* AI Generate Config button */}
          <button
            onClick={handleGenerateConfig}
            disabled={generatingConfig}
            style={{
              padding: '10px 16px',
              background: generatingConfig ? 'rgba(167,139,250,0.4)' : 'linear-gradient(135deg, #7c3aed, #a855f7)',
              color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
            }}
          >
            {generatingConfig ? '✨ AI 生成中…' : '✨ AI 生成完整配置'}
          </button>

          {aiPreview && (
            <div style={{ padding: 10, background: 'rgba(167,139,250,0.1)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              ✅ AI已生成完整配置，你可以在高级配置中查看和编辑
            </div>
          )}

          {/* Advanced Config (collapsible) */}
          <button
            onClick={() => setShowAdvanced(v => !v)}
            style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13 }}
          >
            {showAdvanced ? '▲ 收起高级配置' : '▼ 展开高级配置'}
          </button>

          {showAdvanced && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={labelStyle}>
                <span>场景/地点</span>
                <input style={inputStyle} value={location} onChange={e => setLocation(e.target.value)} placeholder="如：幽静图书馆" />
              </label>
              <label style={labelStyle}>
                <span>当前动作</span>
                <input style={inputStyle} value={currentAction} onChange={e => setCurrentAction(e.target.value)} placeholder="如：整理书架" />
              </label>
              <label style={labelStyle}>
                <span>角色扮演提示词</span>
                <textarea
                  style={{ ...inputStyle, minHeight: 120, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  placeholder="详细描述角色的语气、行为、背景故事…"
                />
              </label>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{ ...btnStyle, background: 'transparent', border: '1px solid var(--border-color)' }}
          >取消</button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...btnStyle, background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff', border: 'none' }}
          >
            {saving ? '保存中…' : (isEdit ? '更新角色' : '创建角色')}
          </button>
        </div>
      </div>
    </div>
  );
};

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  fontSize: 13, color: 'var(--text-secondary)',
};

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
};

const btnStyle: React.CSSProperties = {
  padding: '9px 20px',
  borderRadius: 10,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-primary)',
};

export default AddNpcModal;
