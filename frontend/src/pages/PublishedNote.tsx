import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { notesAPI } from '../api';
import type { NoteBlock } from '../types/index';
import '../styles/PublishedNote.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublishedTreeNode {
  id: number;
  parent_id: number | null;
  title: string;
  icon: string | null;
  children: PublishedTreeNode[];
}

interface PublishedNoteDetail {
  id: number;
  title: string;
  icon: string | null;
  content: NoteBlock[];
  created_at: string;
  updated_at: string;
}

// ─── Build tree from flat list ────────────────────────────────────────────────

function buildPublishedTree(
  root: { id: number; parent_id: number | null; title: string; icon: string | null },
  descendants: Array<{ id: number; parent_id: number | null; title: string; icon: string | null }>
): PublishedTreeNode {
  const all = [root, ...descendants];
  const map = new Map<number, PublishedTreeNode>();
  for (const n of all) {
    map.set(n.id, { ...n, children: [] });
  }
  for (const n of all) {
    if (n.parent_id && map.has(n.parent_id)) {
      map.get(n.parent_id)!.children.push(map.get(n.id)!);
    }
  }
  return map.get(root.id)!;
}

// ─── Sidebar Tree ─────────────────────────────────────────────────────────────

const SidebarItem: React.FC<{
  node: PublishedTreeNode;
  depth: number;
  activeId: number | null;
  expandedIds: Set<number>;
  onToggle: (id: number) => void;
  onClick: (id: number) => void;
}> = ({ node, depth, activeId, expandedIds, onToggle, onClick }) => {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);

  return (
    <>
      <div
        className={`pub-tree-item${activeId === node.id ? ' active' : ''}`}
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={() => onClick(node.id)}
      >
        <span
          className={`pub-tree-toggle ${hasChildren ? '' : 'invisible'}`}
          onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
        >
          {isExpanded ? '▾' : '▸'}
        </span>
        <span className="pub-tree-icon">{node.icon || '📄'}</span>
        <span className="pub-tree-title">{node.title || '无标题'}</span>
      </div>
      {isExpanded && node.children.map((child) => (
        <SidebarItem
          key={child.id}
          node={child}
          depth={depth + 1}
          activeId={activeId}
          expandedIds={expandedIds}
          onToggle={onToggle}
          onClick={onClick}
        />
      ))}
    </>
  );
};

// ─── Block Renderer (read-only) ───────────────────────────────────────────────

const RenderBlock: React.FC<{ block: NoteBlock; numberedIndex: number }> = ({ block, numberedIndex }) => {
  if (block.type === 'divider') {
    return <hr className="pub-block-divider" />;
  }

  if (block.type === 'image') {
    return block.imageUrl ? (
      <figure className="pub-block-image-figure">
        <img src={block.imageUrl} alt={block.caption || '图片'} className="pub-block-image" />
        {block.caption && <figcaption className="pub-block-image-caption">{block.caption}</figcaption>}
      </figure>
    ) : null;
  }

  if (block.type === 'columns') {
    const cols = block.columns || [];
    return (
      <div className="pub-block-columns">
        {cols.map((col, colIdx) => (
          <div key={colIdx} className="pub-block-column">
            {col.map((innerBlock) => (
              <div key={innerBlock.id} className="pub-block-column-text">
                {renderInlineContent(innerBlock.content)}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  const content = renderInlineContent(block.content);

  if (block.type === 'heading1') return <h1 className="pub-block-h1">{content}</h1>;
  if (block.type === 'heading2') return <h2 className="pub-block-h2">{content}</h2>;
  if (block.type === 'heading3') return <h3 className="pub-block-h3">{content}</h3>;

  if (block.type === 'bulleted_list') {
    return (
      <div className="pub-block-bullet">
        <span className="pub-block-bullet-dot" />
        <span>{content}</span>
      </div>
    );
  }

  if (block.type === 'numbered_list') {
    return (
      <div className="pub-block-numbered">
        <span className="pub-block-number-label">{numberedIndex}.</span>
        <span>{content}</span>
      </div>
    );
  }

  if (block.type === 'quote') {
    return (
      <blockquote className="pub-block-quote">
        {content}
      </blockquote>
    );
  }

  if (block.type === 'todo') {
    return (
      <div className="pub-block-todo">
        <input type="checkbox" checked={!!block.checked} readOnly className="pub-block-todo-check" />
        <span className={block.checked ? 'pub-block-todo-done' : ''}>{content}</span>
      </div>
    );
  }

  return <p className="pub-block-text">{content}</p>;
};

// ─── Inline Markdown Rendering ────────────────────────────────────────────────

function renderInlineContent(text: string): React.ReactNode {
  if (!text) return null;

  const parts: React.ReactNode[] = [];
  // Simple inline markdown: **bold**, *italic*, ~~strike~~, `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) parts.push(<strong key={match.index}>{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={match.index}>{match[3]}</em>);
    else if (match[4]) parts.push(<s key={match.index}>{match[4]}</s>);
    else if (match[5]) parts.push(<code key={match.index} className="pub-inline-code">{match[5]}</code>);
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

// ─── Main Component ───────────────────────────────────────────────────────────

const PublishedNote: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const [tree, setTree] = useState<PublishedTreeNode | null>(null);
  const [activeNote, setActiveNote] = useState<PublishedNoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!shareId) return;
    loadPublishedData(shareId);
  }, [shareId]);

  const loadPublishedData = async (sid: string) => {
    setLoading(true);
    setError(null);
    try {
      const [treeData, noteData] = await Promise.all([
        notesAPI.getPublicTree(sid),
        notesAPI.getPublicNote(sid),
      ]);
      const rootTree = buildPublishedTree(treeData.root, treeData.descendants);
      setTree(rootTree);
      setActiveNote(noteData.note);
      // Auto-expand root
      setExpandedIds(new Set([treeData.root.id]));
      document.title = `${noteData.note.title} - 发布页`;
    } catch {
      setError('页面不存在或未发布');
    } finally {
      setLoading(false);
    }
  };

  const openNote = async (noteId: number) => {
    if (!shareId) return;
    try {
      const data = await notesAPI.getPublicTreeNote(shareId, noteId);
      setActiveNote(data.note);
      document.title = `${data.note.title} - 发布页`;
      setSidebarOpen(false);
    } catch {
      alert('加载失败');
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getNumberedIndex = (blocks: NoteBlock[], targetIdx: number) => {
    let count = 0;
    for (let i = 0; i <= targetIdx; i++) {
      if (blocks[i].type === 'numbered_list') count++;
      else count = 0;
    }
    return count;
  };

  if (loading) {
    return (
      <div className="pub-loading">
        <div className="pub-loading-spinner" />
        <span>加载中...</span>
      </div>
    );
  }

  if (error || !tree || !activeNote) {
    return (
      <div className="pub-error">
        <div className="pub-error-icon">📄</div>
        <h2>{error || '页面不存在'}</h2>
        <p>该笔记可能已被取消发布或不存在。</p>
      </div>
    );
  }

  const hasSubtree = tree.children.length > 0;

  return (
    <div className="pub-page">
      {/* Sidebar - only show when there are child pages */}
      {hasSubtree && (
        <aside className={`pub-sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="pub-sidebar-header">
            <span className="pub-sidebar-title">{tree.icon || '📄'} {tree.title || '无标题'}</span>
          </div>
          <div className="pub-sidebar-tree">
            <SidebarItem
              node={tree}
              depth={0}
              activeId={activeNote.id}
              expandedIds={expandedIds}
              onToggle={toggleExpand}
              onClick={openNote}
            />
          </div>
        </aside>
      )}

      {/* Main content */}
      <main className={`pub-main${hasSubtree ? '' : ' full-width'}`}>
        {/* Header bar */}
        <div className="pub-header">
          {hasSubtree && (
            <button className="pub-menu-btn" onClick={() => setSidebarOpen((v) => !v)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect y="2" width="16" height="1.5" rx="0.75"/><rect y="7.25" width="16" height="1.5" rx="0.75"/><rect y="12.5" width="16" height="1.5" rx="0.75"/></svg>
            </button>
          )}
          <div className="pub-header-info">
            <span className="pub-header-title">{activeNote.icon || '📄'} {activeNote.title || '无标题'}</span>
          </div>
        </div>

        {/* Article */}
        <article className="pub-article">
          <div className="pub-article-header">
            <span className="pub-article-icon">{activeNote.icon || '📄'}</span>
            <h1 className="pub-article-title">{activeNote.title || '无标题'}</h1>
          </div>

          <div className="pub-article-meta">
            <time>
              发布于 {new Date(activeNote.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
            </time>
            {activeNote.updated_at !== activeNote.created_at && (
              <time>
                · 更新于 {new Date(activeNote.updated_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
              </time>
            )}
          </div>

          <div className="pub-article-body">
            {activeNote.content.map((block, idx) => (
              <RenderBlock
                key={block.id}
                block={block}
                numberedIndex={getNumberedIndex(activeNote.content, idx)}
              />
            ))}
          </div>
        </article>

        <footer className="pub-footer">
          <span>由 Ansuz 工具箱 提供技术支持</span>
        </footer>
      </main>
    </div>
  );
};

export default PublishedNote;
