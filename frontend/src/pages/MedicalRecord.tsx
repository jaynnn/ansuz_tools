import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { medicalRecordAPI } from '../api';
import '../styles/MedicalRecord.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MedicalRecord {
  id: number;
  user_id: number;
  condition: string;
  treatment: string;
  tags: string[];
  is_public: number;
  created_at: string;
  author_nickname?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const collectAllTags = (records: MedicalRecord[]): string[] => {
  const set = new Set<string>();
  records.forEach((r) => r.tags.forEach((t) => set.add(t)));
  return Array.from(set);
};

// ─── Component ────────────────────────────────────────────────────────────────

const MedicalRecord: React.FC = () => {
  const navigate = useNavigate();

  const [tab, setTab] = useState<'mine' | 'public'>('mine');
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [publicRecords, setPublicRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Add modal state
  const [showModal, setShowModal] = useState(false);
  const [formCondition, setFormCondition] = useState('');
  const [formTreatment, setFormTreatment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Fetch records whenever tab / search / activeTag change.
  // The cleanup function sets `cancelled = true` so that a stale response
  // (from a previous, slower request) never overwrites a newer result.
  useEffect(() => {
    let cancelled = false;
    const params: { search?: string; tag?: string } = {};
    if (search.trim()) params.search = search.trim();
    if (activeTag) params.tag = activeTag;

    setLoading(true);
    const fetchFn = tab === 'mine'
      ? medicalRecordAPI.getAll(params)
      : medicalRecordAPI.getPublic(params);

    fetchFn
      .then((data) => {
        if (cancelled) return;
        if (tab === 'mine') setRecords(data.records || []);
        else setPublicRecords(data.records || []);
      })
      .catch(() => {
        if (cancelled) return;
        if (tab === 'mine') setRecords([]);
        else setPublicRecords([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [tab, search, activeTag]);

  // Derive all tags from unfiltered list for sidebar
  const [allMyTags, setAllMyTags] = useState<string[]>([]);
  const [allPublicTags, setAllPublicTags] = useState<string[]>([]);

  useEffect(() => {
    // Fetch all records (no filter) to collect all tags for sidebar
    medicalRecordAPI.getAll({}).then((d) => setAllMyTags(collectAllTags(d.records || []))).catch(() => {});
    medicalRecordAPI.getPublic({}).then((d) => setAllPublicTags(collectAllTags(d.records || []))).catch(() => {});
  }, [tab]);

  const sidebarTags = tab === 'mine' ? allMyTags : allPublicTags;
  const displayRecords = tab === 'mine' ? records : publicRecords;

  const handleDelete = async (id: number) => {
    if (!window.confirm('确认删除这条记录吗？')) return;
    try {
      await medicalRecordAPI.delete(id);
      setRecords((prev) => {
        const updated = prev.filter((r) => r.id !== id);
        setAllMyTags(collectAllTags(updated));
        return updated;
      });
    } catch {
      alert('删除失败，请重试');
    }
  };

  const handleTogglePublish = async (id: number) => {
    try {
      const data = await medicalRecordAPI.togglePublish(id);
      setRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_public: data.is_public } : r))
      );
    } catch {
      alert('操作失败，请重试');
    }
  };

  const handleSubmit = async () => {
    if (!formCondition.trim() || !formTreatment.trim()) {
      setSubmitError('请填写病情和处理方式');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const data = await medicalRecordAPI.create(formCondition.trim(), formTreatment.trim());
      setRecords((prev) => {
        const updated = [data.record, ...prev];
        setAllMyTags(collectAllTags(updated));
        return updated;
      });
      setFormCondition('');
      setFormTreatment('');
      setShowModal(false);
    } catch {
      setSubmitError('添加失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTabSwitch = (t: 'mine' | 'public') => {
    setTab(t);
    setSearch('');
    setActiveTag(null);
  };

  return (
    <div className="mr-page">
      {/* Nav bar */}
      <div className="mr-nav-bar">
        <button className="mr-back-btn" onClick={() => navigate('/')}>← 返回</button>
        <span className="mr-nav-title">病例记录</span>
      </div>

      {/* Tabs */}
      <div className="mr-tabs">
        <button
          className={`mr-tab${tab === 'mine' ? ' active' : ''}`}
          onClick={() => handleTabSwitch('mine')}
        >
          我的记录
        </button>
        <button
          className={`mr-tab${tab === 'public' ? ' active' : ''}`}
          onClick={() => handleTabSwitch('public')}
        >
          公共记录
        </button>
      </div>

      {/* Search bar */}
      <div className="mr-search-bar">
        <input
          className="mr-search-input"
          type="text"
          placeholder="搜索病情或处理方式..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Body */}
      <div className="mr-body">
        {/* Left sidebar - tag filter */}
        <div className="mr-sidebar">
          <button
            className={`mr-sidebar-tag${activeTag === null ? ' active' : ''}`}
            onClick={() => setActiveTag(null)}
          >
            全部
          </button>
          {sidebarTags.map((tag) => (
            <button
              key={tag}
              className={`mr-sidebar-tag${activeTag === tag ? ' active' : ''}`}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Records list */}
        <div className="mr-list">
          {loading ? (
            <div className="mr-loading">加载中...</div>
          ) : displayRecords.length === 0 ? (
            <div className="mr-empty">
              <span className="mr-empty-icon">🩺</span>
              {tab === 'mine' ? '暂无记录，点击右下角添加' : '暂无公共记录'}
            </div>
          ) : (
            displayRecords.map((record) => (
              <div key={record.id} className="mr-card">
                <div className="mr-card-date">{formatDate(record.created_at)}</div>
                {tab === 'public' && record.author_nickname && (
                  <div className="mr-author-badge">来自：{record.author_nickname}</div>
                )}
                <div className="mr-card-condition">{record.condition}</div>
                <div className="mr-card-treatment">{record.treatment}</div>
                {record.tags.length > 0 && (
                  <div className="mr-card-tags">
                    {record.tags.map((tag) => (
                      <span key={tag} className="mr-tag-chip">{tag}</span>
                    ))}
                  </div>
                )}
                {tab === 'mine' && (
                  <div className="mr-card-actions">
                    <button
                      className={`mr-action-btn ${record.is_public ? 'unpublish' : 'publish'}`}
                      onClick={() => handleTogglePublish(record.id)}
                    >
                      {record.is_public ? '取消公开' : '公开分享'}
                    </button>
                    <button
                      className="mr-action-btn danger"
                      onClick={() => handleDelete(record.id)}
                    >
                      删除
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* FAB - only show on "mine" tab */}
      {tab === 'mine' && (
        <button className="mr-fab" onClick={() => setShowModal(true)} title="添加记录">
          +
        </button>
      )}

      {/* Add record modal */}
      {showModal && (
        <div className="mr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="mr-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="mr-modal-title">添加病例记录</h2>
            {submitError && <div className="mr-error">{submitError}</div>}
            <div className="mr-form-group">
              <label className="mr-form-label">病情描述</label>
              <textarea
                className="mr-form-textarea"
                placeholder="请描述病情，如：头痛、发烧38.5°C、持续两天..."
                value={formCondition}
                onChange={(e) => setFormCondition(e.target.value)}
                rows={4}
              />
            </div>
            <div className="mr-form-group">
              <label className="mr-form-label">处理方式</label>
              <textarea
                className="mr-form-textarea"
                placeholder="请描述治疗或处理方式，如：服用布洛芬、多喝水、休息..."
                value={formTreatment}
                onChange={(e) => setFormTreatment(e.target.value)}
                rows={4}
              />
            </div>
            <p className="mr-hint">💡 保存后，AI 将自动为此病例生成分类标签</p>
            <button
              className="mr-submit-btn"
              onClick={handleSubmit}
              disabled={submitting || !formCondition.trim() || !formTreatment.trim()}
            >
              {submitting ? 'AI 分析中...' : '保存记录'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MedicalRecord;
