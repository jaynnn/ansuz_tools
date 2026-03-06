import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { notesAPI } from '../api';
import type { NoteBlock, NoteBlockType } from '../types/index';
import '../styles/Notes.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NoteSummary {
  id: number;
  user_id: number;
  title: string;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

interface NoteDetail extends NoteSummary {
  content: NoteBlock[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BLOCK_TYPE_OPTIONS: Array<{ type: NoteBlockType; icon: string; label: string }> = [
  { type: 'text', icon: '¶', label: '正文' },
  { type: 'heading1', icon: 'H1', label: '一级标题' },
  { type: 'heading2', icon: 'H2', label: '二级标题' },
  { type: 'heading3', icon: 'H3', label: '三级标题' },
  { type: 'bulleted_list', icon: '•', label: '无序列表' },
  { type: 'numbered_list', icon: '1.', label: '有序列表' },
  { type: 'todo', icon: '☑', label: '待办事项' },
  { type: 'quote', icon: '"', label: '引用' },
  { type: 'divider', icon: '─', label: '分割线' },
];

const ICON_OPTIONS = [
  '📝', '📄', '📋', '🗒️', '🗓️', '📅', '📌', '📍',
  '💡', '🔑', '⭐', '🎯', '🚀', '💼', '🎓', '🏠',
  '🌟', '❤️', '🎵', '🌿', '🔥', '💬', '🔒', '🌈',
  '🍎', '🎨', '📚', '✅', '⚡', '🧩', '🌙', '☀️',
];

const newBlockId = () => Math.random().toString(36).slice(2);

const createBlock = (type: NoteBlockType = 'text'): NoteBlock => ({
  id: newBlockId(),
  type,
  content: '',
  checked: false,
});

// ─── Block Textarea ───────────────────────────────────────────────────────────

interface BlockProps {
  block: NoteBlock;
  index: number;
  numberedIndex: number;
  onChange: (id: string, patch: Partial<NoteBlock>) => void;
  onEnter: (id: string, caretPos: number, currentContent: string) => void;
  onBackspace: (id: string, isEmpty: boolean) => void;
  onFocus: (id: string) => void;
  onArrowUp: (id: string) => void;
  onArrowDown: (id: string) => void;
  onTypeMenuOpen: (id: string) => void;
  isFocused: boolean;
  inputRef: (el: HTMLTextAreaElement | null) => void;
}

const BlockItem: React.FC<BlockProps> = ({
  block, numberedIndex, onChange, onEnter, onBackspace, onFocus, onArrowUp, onArrowDown, onTypeMenuOpen, isFocused, inputRef,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const setRef = (el: HTMLTextAreaElement | null) => {
    textareaRef.current = el;
    inputRef(el);
  };

  // Auto-resize textarea
  const autoResize = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  };

  useEffect(() => {
    autoResize();
  }, [block.content]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const pos = e.currentTarget.selectionStart ?? block.content.length;
      onEnter(block.id, pos, block.content);
    } else if (e.key === 'Backspace' && block.content === '') {
      e.preventDefault();
      onBackspace(block.id, true);
    } else if (e.key === 'ArrowUp') {
      const el = e.currentTarget;
      if (el.selectionStart === 0) {
        e.preventDefault();
        onArrowUp(block.id);
      }
    } else if (e.key === 'ArrowDown') {
      const el = e.currentTarget;
      if (el.selectionStart === el.value.length) {
        e.preventDefault();
        onArrowDown(block.id);
      }
    } else if (e.key === '/') {
      // Slash command
      if (block.content === '') {
        e.preventDefault();
        onTypeMenuOpen(block.id);
      }
    }
  };

  const BLOCK_TYPE_CLASS: Partial<Record<NoteBlockType, string>> = {
    heading1: 'heading1',
    heading2: 'heading2',
    heading3: 'heading3',
    quote: 'quote-text',
  };
  const blockClassName = `notes-block-text${BLOCK_TYPE_CLASS[block.type] ? ` notes-block-${BLOCK_TYPE_CLASS[block.type]}` : ''}`;

  const BLOCK_PLACEHOLDERS: Partial<Record<NoteBlockType, string>> = {
    heading1: '一级标题',
    heading2: '二级标题',
    heading3: '三级标题',
    quote: '引用内容...',
  };
  const placeholder = BLOCK_PLACEHOLDERS[block.type] ?? (isFocused ? "输入 '/' 选择块类型" : '');

  if (block.type === 'divider') {
    return (
      <div className="notes-block-wrapper">
        <hr className="notes-block-divider" />
      </div>
    );
  }

  const textarea = (
    <textarea
      ref={setRef}
      className={`${blockClassName}${block.type === 'todo' && block.checked ? ' checked' : ''}`}
      value={block.content}
      placeholder={placeholder}
      rows={1}
      onChange={(e) => {
        onChange(block.id, { content: e.target.value });
        autoResize();
      }}
      onKeyDown={handleKeyDown}
      onFocus={() => onFocus(block.id)}
    />
  );

  if (block.type === 'bulleted_list') {
    return (
      <div className="notes-block-wrapper">
        <div className="notes-block-content">
          <div className="notes-block-bullet-wrapper">
            <div className="notes-block-bullet-dot" />
            {textarea}
          </div>
        </div>
      </div>
    );
  }

  if (block.type === 'numbered_list') {
    return (
      <div className="notes-block-wrapper">
        <div className="notes-block-content">
          <div className="notes-block-number-wrapper">
            <span className="notes-block-number-label">{numberedIndex}.</span>
            {textarea}
          </div>
        </div>
      </div>
    );
  }

  if (block.type === 'quote') {
    return (
      <div className="notes-block-wrapper">
        <div className="notes-block-content">
          <div className="notes-block-quote-wrapper">
            <div className="notes-block-quote-bar" />
            {textarea}
          </div>
        </div>
      </div>
    );
  }

  if (block.type === 'todo') {
    return (
      <div className="notes-block-wrapper">
        <div className="notes-block-content">
          <div className="notes-block-todo-wrapper">
            <input
              type="checkbox"
              className="notes-block-todo-checkbox"
              checked={!!block.checked}
              onChange={(e) => onChange(block.id, { checked: e.target.checked })}
            />
            {textarea}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="notes-block-wrapper">
      <div className="notes-block-content">{textarea}</div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const Notes: React.FC = () => {
  const navigate = useNavigate();

  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [activeNote, setActiveNote] = useState<NoteDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [typeMenuBlockId, setTypeMenuBlockId] = useState<string | null>(null);
  const [typeMenuSelectedIdx, setTypeMenuSelectedIdx] = useState(0);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const blockRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeNoteRef = useRef<NoteDetail | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    activeNoteRef.current = activeNote;
  }, [activeNote]);

  useEffect(() => {
    document.title = '笔记 - 工具箱';
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const data = await notesAPI.getAll();
      setNotes(data.notes);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const openNote = async (id: number) => {
    // Save current note first
    flushSave();
    try {
      const data = await notesAPI.getById(id);
      const note = data.note;
      if (!note.content || note.content.length === 0) {
        note.content = [createBlock()];
      }
      setActiveNote(note);
      setSaveStatus('saved');
      setSidebarOpen(false);
    } catch {
      alert('加载笔记失败');
    }
  };

  const createNote = async () => {
    flushSave();
    try {
      const data = await notesAPI.create({ title: '无标题', content: [createBlock()], icon: '📝' });
      const note = data.note;
      setNotes((prev) => [note, ...prev]);
      setActiveNote(note);
      setSaveStatus('saved');
      setSidebarOpen(false);
      // Focus title after render
      setTimeout(() => {
        const titleEl = document.querySelector('.notes-title-input') as HTMLTextAreaElement;
        if (titleEl) {
          titleEl.focus();
          titleEl.select();
        }
      }, 50);
    } catch {
      alert('创建笔记失败');
    }
  };

  const scheduleSave = useCallback((note: NoteDetail) => {
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await notesAPI.update(note.id, { title: note.title, content: note.content, icon: note.icon || undefined });
        setNotes((prev) =>
          prev.map((n) => (n.id === note.id ? { ...n, title: note.title, icon: note.icon, updated_at: new Date().toISOString() } : n))
        );
        setSaveStatus('saved');
      } catch {
        setSaveStatus('unsaved');
      }
    }, 800);
  }, []);

  const flushSave = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const note = activeNoteRef.current;
    if (!note) return;
    notesAPI.update(note.id, { title: note.title, content: note.content, icon: note.icon || undefined }).catch(() => {});
  };

  const updateNote = (patch: Partial<NoteDetail>) => {
    setActiveNote((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      scheduleSave(next);
      return next;
    });
  };

  const handleTitleChange = (value: string) => {
    updateNote({ title: value });
  };

  const handleBlockChange = (id: string, blockPatch: Partial<NoteBlock>) => {
    setActiveNote((prev) => {
      if (!prev) return prev;
      const content = prev.content.map((b) => (b.id === id ? { ...b, ...blockPatch } : b));
      const next = { ...prev, content };
      scheduleSave(next);
      return next;
    });
  };

  const handleEnter = (id: string, caretPos: number, currentContent: string) => {
    setActiveNote((prev) => {
      if (!prev) return prev;
      const idx = prev.content.findIndex((b) => b.id === id);
      if (idx === -1) return prev;

      const currentBlock = prev.content[idx];
      const before = currentContent.slice(0, caretPos);
      const after = currentContent.slice(caretPos);

      // Update current block with text before caret
      const updatedBlock = { ...currentBlock, content: before };

      // Determine new block type: lists continue their type, others default to text
      const continuedTypes: NoteBlockType[] = ['bulleted_list', 'numbered_list', 'todo'];
      const newType: NoteBlockType = continuedTypes.includes(currentBlock.type) ? currentBlock.type : 'text';
      const newBlock: NoteBlock = { ...createBlock(newType), content: after };

      const content = [
        ...prev.content.slice(0, idx),
        updatedBlock,
        newBlock,
        ...prev.content.slice(idx + 1),
      ];
      const next = { ...prev, content };
      scheduleSave(next);

      // Focus new block
      setTimeout(() => {
        const el = blockRefs.current[newBlock.id];
        if (el) { el.focus(); el.setSelectionRange(0, 0); }
      }, 10);

      return next;
    });
  };

  const handleBackspace = (id: string, isEmpty: boolean) => {
    setActiveNote((prev) => {
      if (!prev) return prev;
      const idx = prev.content.findIndex((b) => b.id === id);
      if (idx === -1 || (!isEmpty && idx === 0)) return prev;

      if (prev.content.length === 1) {
        // Keep at least one block
        const content = [createBlock()];
        const next = { ...prev, content };
        scheduleSave(next);
        return next;
      }

      const content = prev.content.filter((b) => b.id !== id);
      const next = { ...prev, content };
      scheduleSave(next);

      // Focus previous block
      const prevBlock = prev.content[idx - 1];
      if (prevBlock) {
        setTimeout(() => {
          const el = blockRefs.current[prevBlock.id];
          if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
        }, 10);
      }

      return next;
    });
  };

  const handleArrowUp = (id: string) => {
    const note = activeNoteRef.current;
    if (!note) return;
    const idx = note.content.findIndex((b) => b.id === id);
    if (idx > 0) {
      const prevBlock = note.content[idx - 1];
      const el = blockRefs.current[prevBlock.id];
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }
  };

  const handleArrowDown = (id: string) => {
    const note = activeNoteRef.current;
    if (!note) return;
    const idx = note.content.findIndex((b) => b.id === id);
    if (idx < note.content.length - 1) {
      const nextBlock = note.content[idx + 1];
      const el = blockRefs.current[nextBlock.id];
      if (el) { el.focus(); el.setSelectionRange(0, 0); }
    }
  };

  const changeBlockType = (blockId: string, newType: NoteBlockType) => {
    setActiveNote((prev) => {
      if (!prev) return prev;
      const content = prev.content.map((b) =>
        b.id === blockId ? { ...b, type: newType, content: newType === 'divider' ? '' : b.content } : b
      );
      const next = { ...prev, content };
      scheduleSave(next);
      return next;
    });
    setTypeMenuBlockId(null);
    // Re-focus the block
    setTimeout(() => {
      const el = blockRefs.current[blockId];
      if (el) el.focus();
    }, 10);
  };

  const handleDeleteNote = async () => {
    if (!activeNote) return;
    if (!window.confirm('确定要删除这篇笔记吗？')) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    try {
      await notesAPI.delete(activeNote.id);
      setNotes((prev) => prev.filter((n) => n.id !== activeNote.id));
      setActiveNote(null);
    } catch {
      alert('删除失败');
    }
  };

  // Calculate numbered list indices
  const getNumberedIndex = (blocks: NoteBlock[], targetIdx: number) => {
    let count = 0;
    for (let i = 0; i <= targetIdx; i++) {
      if (blocks[i].type === 'numbered_list') count++;
      else count = 0;
    }
    return count;
  };

  // Type menu keyboard navigation
  useEffect(() => {
    if (!typeMenuBlockId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setTypeMenuSelectedIdx((i) => (i + 1) % BLOCK_TYPE_OPTIONS.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setTypeMenuSelectedIdx((i) => (i - 1 + BLOCK_TYPE_OPTIONS.length) % BLOCK_TYPE_OPTIONS.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        changeBlockType(typeMenuBlockId, BLOCK_TYPE_OPTIONS[typeMenuSelectedIdx].type);
      } else if (e.key === 'Escape') {
        setTypeMenuBlockId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [typeMenuBlockId, typeMenuSelectedIdx]);

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.notes-block-type-menu')) setTypeMenuBlockId(null);
      if (!target.closest('.notes-icon-picker') && !target.closest('.notes-note-icon')) setShowIconPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      flushSave();
    };
  }, []);

  const titleRows = activeNote ? Math.max(1, Math.ceil(activeNote.title.length / 28)) : 1;

  return (
    <div className="notes-page">
      {/* Sidebar */}
      <aside className={`notes-sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="notes-sidebar-header">
          <button className="notes-back-btn" onClick={() => navigate('/')}>
            ← 返回
          </button>
          <span className="notes-sidebar-title">我的笔记</span>
          <button className="notes-new-btn" title="新建笔记" onClick={createNote}>＋</button>
        </div>

        <div className="notes-list">
          {loading ? (
            <div className="notes-list-empty">加载中...</div>
          ) : notes.length === 0 ? (
            <div className="notes-list-empty">暂无笔记，点击 ＋ 新建</div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className={`notes-list-item${activeNote?.id === note.id ? ' active' : ''}`}
                onClick={() => openNote(note.id)}
              >
                <span className="notes-list-item-icon">{note.icon || '📄'}</span>
                <span className="notes-list-item-title">{note.title || '无标题'}</span>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="notes-main">
        {!activeNote ? (
          <div className="notes-empty-state">
            <span className="notes-empty-state-icon">📝</span>
            <span>从左侧选择笔记，或新建一篇</span>
            <span className="notes-empty-state-hint">
              {notes.length === 0 ? '还没有笔记' : `共 ${notes.length} 篇笔记`}
            </span>
            <button className="notes-toolbar-btn" style={{ marginTop: 8 }} onClick={createNote}>
              ＋ 新建笔记
            </button>
            <button
              className="notes-toolbar-btn"
              style={{ marginTop: 4 }}
              onClick={() => setSidebarOpen(true)}
            >
              ☰ 打开侧边栏
            </button>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="notes-toolbar">
              <div className="notes-toolbar-left">
                <button
                  className="notes-toolbar-btn"
                  onClick={() => setSidebarOpen((v) => !v)}
                  title="切换侧边栏"
                >
                  ☰
                </button>
                <button className="notes-toolbar-btn danger" onClick={handleDeleteNote} title="删除笔记">
                  🗑️ 删除
                </button>
              </div>
              <div className="notes-save-indicator">
                {saveStatus === 'saving' ? '保存中...' : saveStatus === 'unsaved' ? '未保存' : '已保存'}
              </div>
            </div>

            {/* Editor */}
            <div className="notes-editor" onClick={() => setTypeMenuBlockId(null)}>
              {/* Icon */}
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <span
                  className="notes-note-icon"
                  title="点击更改图标"
                  onClick={(e) => { e.stopPropagation(); setShowIconPicker((v) => !v); }}
                >
                  {activeNote.icon || '📄'}
                </span>
                {showIconPicker && (
                  <div className="notes-icon-picker" onClick={(e) => e.stopPropagation()}>
                    {ICON_OPTIONS.map((icon) => (
                      <span
                        key={icon}
                        className="notes-icon-option"
                        onClick={() => {
                          updateNote({ icon });
                          setShowIconPicker(false);
                        }}
                      >
                        {icon}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Title */}
              <textarea
                className="notes-title-input"
                placeholder="无标题"
                value={activeNote.title}
                rows={titleRows}
                onChange={(e) => handleTitleChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    // Focus first block
                    const first = activeNote.content[0];
                    if (first) {
                      const el = blockRefs.current[first.id];
                      if (el) el.focus();
                    }
                  }
                }}
              />

              {/* Blocks */}
              <div className="notes-blocks">
                {activeNote.content.map((block, idx) => (
                  <div key={block.id} style={{ position: 'relative' }}>
                    <BlockItem
                      block={block}
                      index={idx}
                      numberedIndex={getNumberedIndex(activeNote.content, idx)}
                      onChange={handleBlockChange}
                      onEnter={handleEnter}
                      onBackspace={handleBackspace}
                      onFocus={(id) => { setFocusedBlockId(id); setTypeMenuBlockId(null); }}
                      onArrowUp={handleArrowUp}
                      onArrowDown={handleArrowDown}
                      onTypeMenuOpen={(id) => { setTypeMenuBlockId(id); setTypeMenuSelectedIdx(0); }}
                      isFocused={focusedBlockId === block.id}
                      inputRef={(el) => { blockRefs.current[block.id] = el; }}
                    />
                    {/* Type menu */}
                    {typeMenuBlockId === block.id && (
                      <div
                        className="notes-block-type-menu"
                        onClick={(e) => e.stopPropagation()}
                        style={{ left: 24 }}
                      >
                        {BLOCK_TYPE_OPTIONS.map((opt, optIdx) => (
                          <div
                            key={opt.type}
                            className={`notes-block-type-item${typeMenuSelectedIdx === optIdx ? ' selected' : ''}`}
                            onMouseEnter={() => setTypeMenuSelectedIdx(optIdx)}
                            onClick={() => changeBlockType(block.id, opt.type)}
                          >
                            <span className="notes-block-type-item-icon">{opt.icon}</span>
                            <span>{opt.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Notes;
