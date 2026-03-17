import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { notesAPI, llmAPI } from '../api';
import type { NoteBlock, NoteBlockType } from '../types/index';
import '../styles/Notes.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NoteSummary {
  id: number;
  user_id: number;
  parent_id: number | null;
  title: string;
  icon: string | null;
  share_id: string | null;
  is_published: number;
  created_at: string;
  updated_at: string;
}

interface NoteDetail extends NoteSummary {
  content: NoteBlock[];
  share_id: string | null;
  is_published: number;
}

interface TreeNode extends NoteSummary {
  children: TreeNode[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BLOCK_TYPE_OPTIONS: Array<{ type: NoteBlockType; icon: string; label: string; desc: string }> = [
  { type: 'text', icon: '¶', label: '正文', desc: '普通文本块' },
  { type: 'heading1', icon: 'H₁', label: '一级标题', desc: '大号标题' },
  { type: 'heading2', icon: 'H₂', label: '二级标题', desc: '中号标题' },
  { type: 'heading3', icon: 'H₃', label: '三级标题', desc: '小号标题' },
  { type: 'bulleted_list', icon: '•', label: '无序列表', desc: '项目符号列表' },
  { type: 'numbered_list', icon: '1.', label: '有序列表', desc: '编号列表' },
  { type: 'todo', icon: '☑', label: '待办事项', desc: '任务清单' },
  { type: 'quote', icon: '❝', label: '引用', desc: '引用文本' },
  { type: 'divider', icon: '─', label: '分割线', desc: '水平分隔' },
  { type: 'image', icon: '🖼', label: '图片', desc: '插入图片' },
  { type: 'columns', icon: '▥', label: '分栏', desc: '网格布局（2列）' },
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
  ...(type === 'columns' ? { columns: [[{ id: newBlockId(), type: 'text', content: '' }], [{ id: newBlockId(), type: 'text', content: '' }]] } : {}),
});

// ─── Markdown shortcut patterns ───────────────────────────────────────────────

const MARKDOWN_SHORTCUTS: Array<{ pattern: RegExp; type: NoteBlockType }> = [
  { pattern: /^# $/, type: 'heading1' },
  { pattern: /^## $/, type: 'heading2' },
  { pattern: /^### $/, type: 'heading3' },
  { pattern: /^[-*] $/, type: 'bulleted_list' },
  { pattern: /^\d+\. $/, type: 'numbered_list' },
  { pattern: /^[a-zA-Z]\. $/, type: 'numbered_list' },
  { pattern: /^> $/, type: 'quote' },
  { pattern: /^\[\] $/, type: 'todo' },
  { pattern: /^\[ \] $/, type: 'todo' },
  { pattern: /^--- $/, type: 'divider' },
  { pattern: /^---$/, type: 'divider' },
];

// ─── Build tree from flat list ────────────────────────────────────────────────

function buildTree(notes: NoteSummary[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  const roots: TreeNode[] = [];

  for (const n of notes) {
    map.set(n.id, { ...n, children: [] });
  }
  for (const n of notes) {
    const node = map.get(n.id)!;
    if (n.parent_id && map.has(n.parent_id)) {
      map.get(n.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);

  return roots;
}

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
  onImageUpload: (id: string, file: File) => void;
  isFocused: boolean;
  isTypeMenuOpen: boolean;
  inputRef: (el: HTMLTextAreaElement | null) => void;
}

const BlockItem: React.FC<BlockProps> = ({
  block, numberedIndex, onChange, onEnter, onBackspace, onFocus, onArrowUp, onArrowDown, onTypeMenuOpen, onImageUpload, isFocused, isTypeMenuOpen, inputRef,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const setRef = (el: HTMLTextAreaElement | null) => {
    textareaRef.current = el;
    inputRef(el);
  };

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
    // When type menu is open, let the global handler manage arrow/enter/escape
    if (isTypeMenuOpen) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        return;
      }
    }

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
      if (block.content === '') {
        e.preventDefault();
        onTypeMenuOpen(block.id);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;

    // Check markdown shortcuts
    for (const shortcut of MARKDOWN_SHORTCUTS) {
      if (shortcut.pattern.test(val)) {
        onChange(block.id, { content: '', type: shortcut.type });
        autoResize();
        return;
      }
    }

    onChange(block.id, { content: val });
    autoResize();
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
      <div className="notes-block-wrapper" tabIndex={0} onKeyDown={(e) => {
        if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); onBackspace(block.id, true); }
      }} onFocus={() => onFocus(block.id)}>
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
      onChange={handleChange}
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

  if (block.type === 'image') {
    const fileInputRef = React.createRef<HTMLInputElement>();
    return (
      <div className="notes-block-wrapper" tabIndex={0} onKeyDown={(e) => {
        if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); onBackspace(block.id, true); }
      }} onFocus={() => onFocus(block.id)}>
        <div className="notes-block-content">
          {block.imageUrl ? (
            <div className="notes-block-image-container">
              <img src={block.imageUrl} alt={block.caption || '图片'} className="notes-block-image" />
              <input
                type="text"
                className="notes-block-image-caption"
                placeholder="添加图片说明..."
                value={block.caption || ''}
                onChange={(e) => onChange(block.id, { caption: e.target.value })}
              />
            </div>
          ) : (
            <div className="notes-block-image-upload" onClick={() => fileInputRef.current?.click()}>
              <span className="notes-block-image-upload-icon">🖼</span>
              <span>点击上传图片</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImageUpload(block.id, file);
                }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (block.type === 'columns') {
    const cols = block.columns || [[], []];
    return (
      <div className="notes-block-wrapper" tabIndex={0} onKeyDown={(e) => {
        if ((e.key === 'Backspace' || e.key === 'Delete') && e.target === e.currentTarget) { e.preventDefault(); onBackspace(block.id, true); }
      }} onFocus={() => onFocus(block.id)}>
        <div className="notes-block-content">
          <div className="notes-block-columns">
            {cols.map((col, colIdx) => (
              <div key={colIdx} className="notes-block-column">
                {col.map((innerBlock) => (
                  <textarea
                    key={innerBlock.id}
                    className="notes-block-text"
                    value={innerBlock.content}
                    placeholder={`第 ${colIdx + 1} 列内容...`}
                    rows={1}
                    onChange={(e) => {
                      const newCols = cols.map((c, ci) =>
                        ci === colIdx
                          ? c.map((b) => (b.id === innerBlock.id ? { ...b, content: e.target.value } : b))
                          : c
                      );
                      onChange(block.id, { columns: newCols });
                    }}
                    onFocus={() => onFocus(block.id)}
                    ref={(el) => {
                      if (el) {
                        el.style.height = 'auto';
                        el.style.height = el.scrollHeight + 'px';
                      }
                    }}
                  />
                ))}
                <button
                  className="notes-column-add-btn"
                  onClick={() => {
                    const newCols = cols.map((c, ci) =>
                      ci === colIdx ? [...c, { id: newBlockId(), type: 'text' as NoteBlockType, content: '' }] : c
                    );
                    onChange(block.id, { columns: newCols });
                  }}
                >
                  ＋
                </button>
              </div>
            ))}
          </div>
          <button
            className="notes-columns-add-col-btn"
            onClick={() => {
              const newCols = [...cols, [{ id: newBlockId(), type: 'text' as NoteBlockType, content: '' }]];
              onChange(block.id, { columns: newCols });
            }}
          >
            ＋ 添加列
          </button>
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

// ─── Sidebar Tree Item ────────────────────────────────────────────────────────

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  activeId: number | null;
  expandedIds: Set<number>;
  onToggle: (id: number) => void;
  onClick: (id: number) => void;
  onContextMenu: (e: React.MouseEvent, noteId: number) => void;
}

const TreeItem: React.FC<TreeItemProps> = ({ node, depth, activeId, expandedIds, onToggle, onClick, onContextMenu }) => {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);

  return (
    <>
      <div
        className={`notes-tree-item${activeId === node.id ? ' active' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => onClick(node.id)}
        onContextMenu={(e) => onContextMenu(e, node.id)}
      >
        <span
          className={`notes-tree-toggle ${hasChildren ? '' : 'invisible'}`}
          onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
        >
          {isExpanded ? '▾' : '▸'}
        </span>
        <span className="notes-tree-icon">{node.icon || '📄'}</span>
        <span className="notes-tree-title">{node.title || '无标题'}</span>
      </div>
      {isExpanded && node.children.map((child) => (
        <TreeItem
          key={child.id}
          node={child}
          depth={depth + 1}
          activeId={activeId}
          expandedIds={expandedIds}
          onToggle={onToggle}
          onClick={onClick}
          onContextMenu={onContextMenu}
        />
      ))}
    </>
  );
};

// ─── Floating Toolbar ─────────────────────────────────────────────────────────

interface FloatingToolbarProps {
  position: { top: number; left: number } | null;
  selectedText: string;
  blockId: string | null;
  onFormat: (prefix: string, suffix: string) => void;
  onExplain: () => void;
  explainLoading: boolean;
  explainResult: string | null;
  onCloseExplain: () => void;
  blockUpdatedAt: string | null;
}

const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  position, selectedText, onFormat, onExplain, explainLoading, explainResult, onCloseExplain, blockUpdatedAt,
}) => {
  if (!position || !selectedText) return null;

  return (
    <div className="notes-floating-toolbar" style={{ top: position.top, left: position.left }}>
      <div className="notes-floating-toolbar-row">
        <button className="notes-ft-btn" title="加粗" onClick={() => onFormat('**', '**')}>
          <strong>B</strong>
        </button>
        <button className="notes-ft-btn" title="斜体" onClick={() => onFormat('*', '*')}>
          <em>I</em>
        </button>
        <button className="notes-ft-btn" title="删除线" onClick={() => onFormat('~~', '~~')}>
          <s>S</s>
        </button>
        <button className="notes-ft-btn" title="行内代码" onClick={() => onFormat('`', '`')}>
          {'</>'}
        </button>
        <span className="notes-ft-divider" />
        <button className="notes-ft-btn" title="复制区块链接" onClick={() => {
          navigator.clipboard.writeText(window.location.href);
        }}>
          🔗
        </button>
        <button
          className="notes-ft-btn notes-ft-btn-ai"
          title="AI 释义"
          onClick={onExplain}
          disabled={explainLoading}
        >
          {explainLoading ? '⏳' : '✨'} 释义
        </button>
        {blockUpdatedAt && (
          <>
            <span className="notes-ft-divider" />
            <span className="notes-ft-info" title="最近编辑时间">
              🕐 {new Date(blockUpdatedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </>
        )}
      </div>
      {explainResult && (
        <div className="notes-ft-explain-panel">
          <div className="notes-ft-explain-header">
            <span>✨ AI 释义</span>
            <button className="notes-ft-explain-close" onClick={onCloseExplain}>✕</button>
          </div>
          <div className="notes-ft-explain-content">{explainResult}</div>
        </div>
      )}
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
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; noteId: number | null } | null>(null);

  // Floating toolbar state
  const [floatingToolbar, setFloatingToolbar] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainResult, setExplainResult] = useState<string | null>(null);
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState(false);

  // Settings & Trash state
  const [showSettings, setShowSettings] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [trashItems, setTrashItems] = useState<Array<{ id: number; title: string; icon: string | null; content: NoteBlock[]; deletedAt: string }>>([]);
  const [autoCleanDays, setAutoCleanDays] = useState<number>(() => {
    const stored = localStorage.getItem('notes-auto-clean-days');
    return stored ? parseInt(stored, 10) : 30;
  });

  const blockRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeNoteRef = useRef<NoteDetail | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeNoteRef.current = activeNote;
  }, [activeNote]);

  useEffect(() => {
    document.title = '笔记 - 工具箱';
    fetchNotes();
    // Load trash from localStorage and auto-clean expired items
    try {
      const storedTrash = localStorage.getItem('notes-trash');
      if (storedTrash) {
        const items = JSON.parse(storedTrash) as Array<{ id: number; title: string; icon: string | null; content: NoteBlock[]; deletedAt: string }>;
        const storedDays = localStorage.getItem('notes-auto-clean-days');
        const days = storedDays ? parseInt(storedDays, 10) : 30;
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        const filtered = days > 0 ? items.filter((item) => new Date(item.deletedAt).getTime() > cutoff) : items;
        setTrashItems(filtered);
        if (filtered.length !== items.length) {
          localStorage.setItem('notes-trash', JSON.stringify(filtered));
        }
      }
    } catch { /* ignore */ }
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

  const createNote = async (parentId?: number | null) => {
    flushSave();
    try {
      const data = await notesAPI.create({ title: '无标题', content: [createBlock()], icon: '📝', parent_id: parentId ?? null });
      const note = data.note;
      setNotes((prev) => [note, ...prev]);
      if (parentId) {
        setExpandedIds((prev) => new Set([...prev, parentId]));
      }
      setActiveNote(note);
      setSaveStatus('saved');
      setSidebarOpen(false);
      setContextMenu(null);
      setTimeout(() => {
        const titleEl = document.querySelector('.notes-title-input') as HTMLTextAreaElement;
        if (titleEl) { titleEl.focus(); titleEl.select(); }
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
      const continuedTypes: NoteBlockType[] = ['bulleted_list', 'numbered_list', 'todo'];

      // If the block is a list type and the content is empty, convert to plain text
      if (continuedTypes.includes(currentBlock.type) && currentContent === '') {
        const content = prev.content.map((b) =>
          b.id === id ? { ...b, type: 'text' as NoteBlockType, content: '' } : b
        );
        const next = { ...prev, content };
        scheduleSave(next);
        setTimeout(() => {
          const el = blockRefs.current[id];
          if (el) el.focus();
        }, 10);
        return next;
      }

      const before = currentContent.slice(0, caretPos);
      const after = currentContent.slice(caretPos);

      const updatedBlock = { ...currentBlock, content: before };
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
        const content = [createBlock()];
        const next = { ...prev, content };
        scheduleSave(next);
        return next;
      }

      const content = prev.content.filter((b) => b.id !== id);
      const next = { ...prev, content };
      scheduleSave(next);

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

  const changeBlockType = useCallback((blockId: string, newType: NoteBlockType) => {
    setActiveNote((prev) => {
      if (!prev) return prev;
      const content = prev.content.map((b) => {
        if (b.id !== blockId) return b;
        const patch: Partial<NoteBlock> = { type: newType };
        if (newType === 'divider') patch.content = '';
        if (newType === 'columns') patch.columns = [[{ id: newBlockId(), type: 'text', content: '' }], [{ id: newBlockId(), type: 'text', content: '' }]];
        return { ...b, ...patch };
      });
      const next = { ...prev, content };
      scheduleSave(next);
      return next;
    });
    setTypeMenuBlockId(null);
    setTimeout(() => {
      const el = blockRefs.current[blockId];
      if (el) el.focus();
    }, 10);
  }, [scheduleSave]);

  const addToTrash = (note: { id: number; title: string; icon: string | null; content: NoteBlock[] }) => {
    const trashItem = { ...note, deletedAt: new Date().toISOString() };
    setTrashItems((prev) => {
      const next = [trashItem, ...prev];
      localStorage.setItem('notes-trash', JSON.stringify(next));
      return next;
    });
  };

  const handleDeleteNote = async () => {
    if (!activeNote) return;
    if (!window.confirm('确定要删除这篇笔记吗？子笔记也会一同删除。')) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    // Save to trash before deleting
    addToTrash({ id: activeNote.id, title: activeNote.title, icon: activeNote.icon, content: activeNote.content });
    try {
      await notesAPI.delete(activeNote.id);
      setActiveNote(null);
      // Re-fetch to get accurate list after cascade delete
      const data = await notesAPI.getAll();
      setNotes(data.notes);
    } catch {
      alert('删除失败');
    }
  };

  const handleImageUpload = async (blockId: string, file: File) => {
    try {
      const { url } = await notesAPI.uploadImage(file);
      handleBlockChange(blockId, { imageUrl: url });
    } catch {
      alert('图片上传失败');
    }
  };

  const handlePublish = async () => {
    if (!activeNote) return;
    try {
      const result = await notesAPI.publish(activeNote.id);
      setActiveNote((prev) => prev ? { ...prev, is_published: result.is_published, share_id: result.share_id } : prev);
      setNotes((prev) => prev.map((n) => n.id === activeNote.id ? { ...n, is_published: result.is_published, share_id: result.share_id } : n));
      if (result.is_published) {
        const url = `${window.location.origin}/p/${result.share_id}`;
        await navigator.clipboard.writeText(url).catch(() => {});
        alert(`已发布！链接已复制到剪贴板：\n${url}`);
      } else {
        alert('已取消发布');
      }
    } catch {
      alert('操作失败');
    }
  };

  const getNumberedIndex = (blocks: NoteBlock[], targetIdx: number) => {
    let count = 0;
    for (let i = 0; i <= targetIdx; i++) {
      if (blocks[i].type === 'numbered_list') count++;
      else count = 0;
    }
    return count;
  };

  // Type menu keyboard navigation
  useLayoutEffect(() => {
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
  }, [typeMenuBlockId, typeMenuSelectedIdx, changeBlockType]);

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.notes-block-type-menu')) setTypeMenuBlockId(null);
      if (!target.closest('.notes-icon-picker') && !target.closest('.notes-note-icon')) setShowIconPicker(false);
      if (!target.closest('.notes-context-menu')) setContextMenu(null);
      if (!target.closest('.notes-toolbar-dropdown') && !target.closest('.notes-toolbar-menu-btn')) setToolbarMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Ctrl+A to select all blocks
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        const editorEl = editorRef.current;
        if (!editorEl) return;
        // Check if the active element is a textarea within the editor
        const activeEl = document.activeElement as HTMLTextAreaElement | null;
        if (activeEl && activeEl.tagName === 'TEXTAREA' && editorEl.contains(activeEl)) {
          // If all text in the current textarea is already selected, select the entire editor
          if (activeEl.selectionStart === 0 && activeEl.selectionEnd === activeEl.value.length) {
            e.preventDefault();
            const sel = window.getSelection();
            if (sel) {
              const range = document.createRange();
              range.selectNodeContents(editorEl);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
          // Otherwise, let the browser handle the native Ctrl+A (selects text in the textarea)
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      flushSave();
    };
  }, []);

  // Selection / floating toolbar
  useEffect(() => {
    const checkTextareaSelection = () => {
      const editorEl = editorRef.current;
      if (!editorEl) return;

      const activeEl = document.activeElement as HTMLTextAreaElement | null;
      if (activeEl && activeEl.tagName === 'TEXTAREA' && editorEl.contains(activeEl)) {
        const start = activeEl.selectionStart;
        const end = activeEl.selectionEnd;
        if (start !== end) {
          const text = activeEl.value.slice(start, end).trim();
          if (text) {
            const rect = activeEl.getBoundingClientRect();
            const editorRect = editorEl.getBoundingClientRect();

            // Estimate selection position within the textarea
            const lineHeight = parseFloat(getComputedStyle(activeEl).lineHeight) || 26;
            const linesBeforeStart = activeEl.value.slice(0, start).split('\n').length - 1;

            setFloatingToolbar({
              top: rect.top - editorRect.top + linesBeforeStart * lineHeight - 48 + editorEl.scrollTop,
              left: rect.left - editorRect.left + rect.width / 2,
            });
            setSelectedText(text);

            // Find block id
            const blockId = Object.entries(blockRefs.current).find(([, el]) => el === activeEl)?.[0];
            if (blockId) setSelectedBlockId(blockId);
            return;
          }
        }
      }

      // Fallback: check window.getSelection() for non-textarea selections
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount) {
        const text = sel.toString().trim();
        if (text) {
          const range = sel.getRangeAt(0);
          if (editorEl.contains(range.commonAncestorContainer)) {
            const rect = range.getBoundingClientRect();
            const editorRect = editorEl.getBoundingClientRect();
            setFloatingToolbar({
              top: rect.top - editorRect.top - 48 + editorEl.scrollTop,
              left: rect.left - editorRect.left + rect.width / 2,
            });
            setSelectedText(text);

            const ancestor = range.commonAncestorContainer;
            const ancestorEl = ancestor.nodeType === Node.ELEMENT_NODE
              ? (ancestor as HTMLElement)
              : ancestor.parentElement;
            const textarea = ancestorEl?.closest?.('textarea');
            if (textarea) {
              const blockId = Object.entries(blockRefs.current).find(([, el]) => el === textarea)?.[0];
              if (blockId) setSelectedBlockId(blockId);
            }
            return;
          }
        }
      }

      // No selection
      setFloatingToolbar(null);
      setSelectedText('');
      setExplainResult(null);
    };

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleSelectionChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(checkTextareaSelection, 100);
    };

    // Listen to both selectionchange and mouse/keyboard events for textarea selection
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mouseup', handleSelectionChange);
    document.addEventListener('keyup', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mouseup', handleSelectionChange);
      document.removeEventListener('keyup', handleSelectionChange);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, []);

  const handleFormat = (prefix: string, suffix: string) => {
    if (!selectedBlockId) return;
    const textarea = blockRefs.current[selectedBlockId];
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const newText = text.slice(0, start) + prefix + text.slice(start, end) + suffix + text.slice(end);

    handleBlockChange(selectedBlockId, { content: newText });
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 10);
  };

  const handleExplain = async () => {
    if (!selectedText) return;
    setExplainLoading(true);
    setExplainResult(null);
    try {
      const result = await llmAPI.chat([
        { role: 'system', content: '你是一个知识渊博的助手。请对用户选中的文本进行简明扼要的释义和解释。回答使用中文，控制在200字以内。' },
        { role: 'user', content: `请释义以下文本：\n\n"${selectedText}"` },
      ]);
      setExplainResult(result.content || '无法获取释义');
    } catch {
      setExplainResult('请求失败，请稍后再试');
    } finally {
      setExplainLoading(false);
    }
  };

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, noteId: number | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, noteId });
  };

  const handleSidebarContextMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.notes-tree-item')) return;
    handleContextMenu(e, null);
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tree = buildTree(notes);

  const titleRows = activeNote ? Math.max(1, Math.ceil(activeNote.title.length / 28)) : 1;

  return (
    <div className="notes-page">
      {/* Sidebar */}
      <aside className={`notes-sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="notes-sidebar-header">
          <button className="notes-back-btn" onClick={() => navigate('/')} title="返回首页">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M11 1L4 8l7 7" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
          </button>
          <span className="notes-sidebar-title">笔记</span>
          <button className="notes-new-btn" title="新建笔记" onClick={() => createNote()}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="7" y1="1" x2="7" y2="13"/><line x1="1" y1="7" x2="13" y2="7"/></svg>
          </button>
        </div>

        <div className="notes-list" onContextMenu={handleSidebarContextMenu}>
          {loading ? (
            <div className="notes-list-empty">加载中...</div>
          ) : notes.length === 0 ? (
            <div className="notes-list-empty">
              <span style={{ fontSize: 28, lineHeight: 1 }}>📝</span>
              <span>暂无笔记</span>
              <span style={{ fontSize: 12, opacity: 0.6 }}>右键创建新笔记</span>
            </div>
          ) : (
            tree.map((node) => (
              <TreeItem
                key={node.id}
                node={node}
                depth={0}
                activeId={activeNote?.id ?? null}
                expandedIds={expandedIds}
                onToggle={toggleExpand}
                onClick={openNote}
                onContextMenu={handleContextMenu}
              />
            ))
          )}
        </div>

        {/* Sidebar footer */}
        <div className="notes-sidebar-footer">
          <button className="notes-sidebar-footer-btn" onClick={() => setShowTrash(true)} title="垃圾箱">
            🗑️ 垃圾箱{trashItems.length > 0 && <span className="notes-sidebar-badge">{trashItems.length}</span>}
          </button>
          <button className="notes-sidebar-footer-btn" onClick={() => setShowSettings(true)} title="设置">
            ⚙️ 设置
          </button>
        </div>
      </aside>

      {/* Settings Modal */}
      {showSettings && (
        <div className="notes-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="notes-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notes-modal-header">
              <span>⚙️ 设置</span>
              <button className="notes-modal-close" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="notes-modal-body">
              <div className="notes-setting-item">
                <label className="notes-setting-label">垃圾箱自动清除（天）</label>
                <div className="notes-setting-desc">设为 0 则不自动清除，需手动清除</div>
                <input
                  type="number"
                  className="notes-setting-input"
                  min={0}
                  max={365}
                  value={autoCleanDays}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(365, parseInt(e.target.value, 10) || 0));
                    setAutoCleanDays(val);
                    localStorage.setItem('notes-auto-clean-days', String(val));
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trash Modal */}
      {showTrash && (
        <div className="notes-modal-overlay" onClick={() => setShowTrash(false)}>
          <div className="notes-modal notes-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="notes-modal-header">
              <span>🗑️ 垃圾箱</span>
              <button className="notes-modal-close" onClick={() => setShowTrash(false)}>✕</button>
            </div>
            <div className="notes-modal-body">
              {trashItems.length === 0 ? (
                <div className="notes-trash-empty">垃圾箱为空</div>
              ) : (
                <>
                  <div className="notes-trash-actions">
                    <button
                      className="notes-trash-clear-btn"
                      onClick={() => {
                        if (window.confirm('确定要清空垃圾箱吗？此操作不可撤销。')) {
                          setTrashItems([]);
                          localStorage.setItem('notes-trash', '[]');
                        }
                      }}
                    >
                      🧹 清空垃圾箱
                    </button>
                  </div>
                  <div className="notes-trash-list">
                    {trashItems.map((item, idx) => (
                      <div key={`${item.id}-${idx}`} className="notes-trash-item">
                        <span className="notes-trash-item-icon">{item.icon || '📄'}</span>
                        <div className="notes-trash-item-info">
                          <span className="notes-trash-item-title">{item.title || '无标题'}</span>
                          <span className="notes-trash-item-date">
                            删除于 {new Date(item.deletedAt).toLocaleString('zh-CN')}
                          </span>
                        </div>
                        <button
                          className="notes-trash-item-delete"
                          title="永久删除"
                          onClick={() => {
                            setTrashItems((prev) => {
                              const next = prev.filter((_, i) => i !== idx);
                              localStorage.setItem('notes-trash', JSON.stringify(next));
                              return next;
                            });
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="notes-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div className="notes-context-item" onClick={() => createNote(contextMenu.noteId)}>
            {contextMenu.noteId ? '📄 新建子笔记' : '📄 新建笔记'}
          </div>
          {contextMenu.noteId && (
            <div className="notes-context-item danger" onClick={async () => {
              if (!window.confirm('确定要删除这篇笔记吗？')) return;
              try {
                // Try to save to trash with current info
                const noteInfo = notes.find((n) => n.id === contextMenu.noteId);
                if (noteInfo) {
                  try {
                    const detail = await notesAPI.getById(contextMenu.noteId!);
                    addToTrash({ id: detail.note.id, title: detail.note.title, icon: detail.note.icon, content: detail.note.content });
                  } catch {
                    addToTrash({ id: noteInfo.id, title: noteInfo.title, icon: noteInfo.icon, content: [] });
                  }
                }
                await notesAPI.delete(contextMenu.noteId!);
                if (activeNote?.id === contextMenu.noteId) setActiveNote(null);
                // Re-fetch to get accurate list after cascade delete
                const data = await notesAPI.getAll();
                setNotes(data.notes);
              } catch { alert('删除失败'); }
              setContextMenu(null);
            }}>
              🗑️ 删除笔记
            </div>
          )}
        </div>
      )}

      {/* Main */}
      <main className="notes-main">
        {!activeNote ? (
          <div className="notes-empty-state">
            <div className="notes-empty-state-icon">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <rect x="12" y="8" width="40" height="48" rx="4" stroke="#d0cfc9" strokeWidth="2"/>
                <line x1="20" y1="20" x2="44" y2="20" stroke="#d0cfc9" strokeWidth="2" strokeLinecap="round"/>
                <line x1="20" y1="28" x2="40" y2="28" stroke="#d0cfc9" strokeWidth="2" strokeLinecap="round"/>
                <line x1="20" y1="36" x2="36" y2="36" stroke="#d0cfc9" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="notes-empty-state-text">从左侧选择笔记，或新建一篇</span>
            <span className="notes-empty-state-hint">
              {notes.length === 0 ? '还没有笔记' : `共 ${notes.length} 篇笔记`}
            </span>
            <button className="notes-empty-create-btn" onClick={() => createNote()}>
              ＋ 新建笔记
            </button>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="notes-toolbar">
              <div className="notes-toolbar-left">
                <button
                  className="notes-toolbar-btn notes-mobile-menu"
                  onClick={() => setSidebarOpen((v) => !v)}
                  title="切换侧边栏"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect y="2" width="16" height="1.5" rx="0.75"/><rect y="7.25" width="16" height="1.5" rx="0.75"/><rect y="12.5" width="16" height="1.5" rx="0.75"/></svg>
                </button>
                {activeNote.parent_id && (
                  <div className="notes-breadcrumb">
                    {(() => {
                      const parent = notes.find((n) => n.id === activeNote.parent_id);
                      if (!parent) return null;
                      return (
                        <>
                          <span className="notes-breadcrumb-item" onClick={() => openNote(parent.id)}>
                            {parent.icon || '📄'} {parent.title || '无标题'}
                          </span>
                          <span className="notes-breadcrumb-sep">/</span>
                        </>
                      );
                    })()}
                    <span className="notes-breadcrumb-current">{activeNote.icon || '📄'} {activeNote.title || '无标题'}</span>
                  </div>
                )}
              </div>
              <div className="notes-toolbar-right">
                <span className="notes-save-indicator">
                  {saveStatus === 'saving' ? '保存中...' : saveStatus === 'unsaved' ? '未保存' : '✓ 已保存'}
                </span>
                <div style={{ position: 'relative' }}>
                  <button
                    className="notes-toolbar-btn notes-toolbar-menu-btn"
                    onClick={() => setToolbarMenuOpen((v) => !v)}
                    title="更多操作"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg>
                  </button>
                  {toolbarMenuOpen && (
                    <div className="notes-toolbar-dropdown">
                      <div
                        className={`notes-toolbar-dropdown-item${activeNote.is_published ? ' published' : ''}`}
                        onClick={() => { handlePublish(); setToolbarMenuOpen(false); }}
                      >
                        {activeNote.is_published ? '🌐 取消发布' : '🔗 发布为网页'}
                      </div>
                      {activeNote.is_published && activeNote.share_id && (
                        <div
                          className="notes-toolbar-dropdown-item"
                          onClick={() => {
                            const url = `${window.location.origin}/p/${activeNote.share_id}`;
                            navigator.clipboard.writeText(url).catch(() => {});
                            alert(`链接已复制：\n${url}`);
                            setToolbarMenuOpen(false);
                          }}
                        >
                          📋 复制分享链接
                        </div>
                      )}
                      <div className="notes-toolbar-dropdown-divider" />
                      <div
                        className="notes-toolbar-dropdown-item danger"
                        onClick={() => { handleDeleteNote(); setToolbarMenuOpen(false); }}
                      >
                        🗑️ 删除笔记
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Editor */}
            <div className="notes-editor" ref={editorRef} onClick={() => setTypeMenuBlockId(null)}>
              {/* Icon + Title row */}
              <div className="notes-title-row">
                <div style={{ position: 'relative' }}>
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
                <textarea
                  className="notes-title-input"
                  placeholder="无标题"
                  value={activeNote.title}
                  rows={titleRows}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const first = activeNote.content[0];
                      if (first) {
                        const el = blockRefs.current[first.id];
                        if (el) el.focus();
                      }
                    }
                  }}
                />
              </div>

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
                      onImageUpload={handleImageUpload}
                      isFocused={focusedBlockId === block.id}
                      isTypeMenuOpen={typeMenuBlockId === block.id}
                      inputRef={(el) => { blockRefs.current[block.id] = el; }}
                    />
                    {/* Type menu */}
                    {typeMenuBlockId === block.id && (
                      <div
                        className="notes-block-type-menu"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="notes-type-menu-header">块类型</div>
                        {BLOCK_TYPE_OPTIONS.map((opt, optIdx) => (
                          <div
                            key={opt.type}
                            className={`notes-block-type-item${typeMenuSelectedIdx === optIdx ? ' selected' : ''}`}
                            onMouseEnter={() => setTypeMenuSelectedIdx(optIdx)}
                            onClick={() => changeBlockType(block.id, opt.type)}
                          >
                            <span className="notes-block-type-item-icon">{opt.icon}</span>
                            <div className="notes-block-type-item-text">
                              <span className="notes-block-type-item-label">{opt.label}</span>
                              <span className="notes-block-type-item-desc">{opt.desc}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Floating toolbar */}
              <FloatingToolbar
                position={floatingToolbar}
                selectedText={selectedText}
                blockId={selectedBlockId}
                onFormat={handleFormat}
                onExplain={handleExplain}
                explainLoading={explainLoading}
                explainResult={explainResult}
                onCloseExplain={() => setExplainResult(null)}
                blockUpdatedAt={activeNote.updated_at}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Notes;
