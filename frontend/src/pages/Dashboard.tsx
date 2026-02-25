import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import type { Tool } from '../types/index';
import { toolsAPI, llmAPI, messagesAPI } from '../api';
import ToolCard from '../components/ToolCard';
import AddToolModal from '../components/AddToolModal';
import Avatar from '../components/Avatar';
import AvatarSelector from '../components/AvatarSelector';
import '../styles/Dashboard.css';

// Predefined tools list (must match AddToolModal's PREDEFINED_TOOLS)
const PREDEFINED_TOOLS = [
  { name: '股票预测', description: '记录和分析股票预测结果，提供准确率统计和可视化分析', url: '/stock-prediction', tags: ['投资', '分析', '数据'] },
  { name: 'AI+MBTI性格测试', description: 'AI驱动的MBTI人格类型测试，64道专业题目，支持滑动条评分，提供基于分值和AI双重分析', url: '/mbti-test', tags: ['AI', '心理', '测试', 'MBTI'] },
  { name: '缘分罗盘', description: 'MBTI人格 × 星座能量 × 八字命理 三重融合匹配，发现你命中注定的灵魂搭档', url: '/friend-match', tags: ['社交', '交友', 'AI'] },
  { name: '数独游戏', description: '经典数独益智游戏，支持简单/中等/困难三种难度，提供笔记模式和计时功能', url: '/sudoku', tags: ['游戏', '益智', '数独'] },
  { name: '斗地主', description: '经典斗地主扑克牌游戏，支持叫地主、抢地主，与AI对手智能对战', url: '/doudizhu', tags: ['游戏', '扑克', '斗地主'] },
  { name: '目标任务', description: 'AI驱动的目标拆分与训练计划生成工具，输入目标后自动评估当前水平并逐步生成可执行的训练任务', url: '/goal-task', tags: ['AI', '目标', '任务', '训练'] },
];

type SearchStatus = 'idle' | 'searching' | 'found_added' | 'found_not_added' | 'not_found';

interface SearchState {
  status: SearchStatus;
  matchedTool?: typeof PREDEFINED_TOOLS[0];
}

const Dashboard: React.FC = () => {
  const [tools, setTools] = useState<Tool[]>([]);
  const [filteredTools, setFilteredTools] = useState<Tool[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [highlightToolName, setHighlightToolName] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchState, setSearchState] = useState<SearchState>({ status: 'idle' });
  const [messageContent, setMessageContent] = useState('');
  const [messageSent, setMessageSent] = useState(false);
  const { user, logout, updateAvatar } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = '工具箱';
    fetchTools();
  }, []);

  useEffect(() => {
    // Extract all unique tags
    const tags = new Set<string>();
    tools.forEach((tool) => {
      tool.tags.forEach((tag) => tags.add(tag));
    });
    setAllTags(Array.from(tags));

    // Filter tools by selected tags (only when not in search mode)
    if (searchState.status !== 'found_added') {
      if (selectedTags.length === 0) {
        setFilteredTools(tools);
      } else {
        setFilteredTools(
          tools.filter((tool) =>
            selectedTags.some((tag) => tool.tags.includes(tag))
          )
        );
      }
    }
  }, [tools, selectedTags, searchState.status]);

  const fetchTools = async () => {
    try {
      const data = await toolsAPI.getAll();
      setTools(data.tools);
    } catch (error) {
      console.error('Failed to fetch tools:', error);
    }
  };

  const handleDeleteTool = async (id: number) => {
    if (window.confirm('确定要删除这个工具吗？')) {
      try {
        await toolsAPI.delete(id);
        await fetchTools();
      } catch (error) {
        console.error('Failed to delete tool:', error);
      }
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleAddTool = async (tool: Omit<Tool, 'id' | 'user_id' | 'created_at'>) => {
    try {
      await toolsAPI.create(tool);
      await fetchTools();
      setShowAddModal(false);
    } catch (error) {
      console.error('Failed to add tool:', error);
    }
  };

  const handleSelectAvatar = async (avatarId: string) => {
    try {
      await updateAvatar(avatarId);
      setShowAvatarSelector(false);
    } catch (error) {
      console.error('Failed to update avatar:', error);
      alert('更新头像失败');
    }
  };

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) return;

    setSearchState({ status: 'searching' });
    setMessageSent(false);
    setMessageContent('');

    const allToolsContext = PREDEFINED_TOOLS.map(t => `- ${t.name}: ${t.description}`).join('\n');
    const prompt = `用户想解决的问题：${query}\n\n工具箱中现有的工具列表：\n${allToolsContext}\n\n请判断哪个工具最能解决用户的问题。只能返回JSON格式，不要有任何其他文字。格式如下：\n{"found": true, "toolName": "工具名称"} 或 {"found": false}`;

    try {
      const result = await llmAPI.chat([{ role: 'user', content: prompt }]);
      const text = result.choices?.[0]?.message?.content || '';
      let parsed: { found: boolean; toolName?: string } = { found: false };
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        parsed = { found: false };
      }

      if (parsed.found && parsed.toolName) {
        const toolName = parsed.toolName;
        // Check if it's in user's added tools
        const addedMatch = tools.find(t => t.name === toolName);
        if (addedMatch) {
          setFilteredTools([addedMatch]);
          setSearchState({ status: 'found_added' });
        } else {
          // Check if it's in predefined tools
          const predefMatch = PREDEFINED_TOOLS.find(t => t.name === toolName);
          if (predefMatch) {
            setSearchState({ status: 'found_not_added', matchedTool: predefMatch });
          } else {
            setSearchState({ status: 'not_found' });
          }
        }
      } else {
        setSearchState({ status: 'not_found' });
      }
    } catch (error) {
      console.error('Search failed:', error);
      setSearchState({ status: 'not_found' });
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchState({ status: 'idle' });
    setMessageSent(false);
    setMessageContent('');
    // Restore normal filtered tools
    if (selectedTags.length === 0) {
      setFilteredTools(tools);
    } else {
      setFilteredTools(tools.filter(tool => selectedTags.some(tag => tool.tags.includes(tag))));
    }
  };

  const handleAddSuggestedTool = async () => {
    if (searchState.matchedTool) {
      await handleAddTool({
        name: searchState.matchedTool.name,
        description: searchState.matchedTool.description,
        url: searchState.matchedTool.url,
        tags: searchState.matchedTool.tags,
      });
      handleClearSearch();
    }
  };

  const handleOpenAddModal = () => {
    if (searchState.matchedTool) {
      setHighlightToolName(searchState.matchedTool.name);
    }
    setShowAddModal(true);
    handleClearSearch();
  };

  const handleSendMessage = async () => {
    const content = messageContent.trim();
    if (!content) return;
    try {
      await messagesAPI.create('tool_request', `搜索"${searchQuery}"未找到对应工具，用户留言：${content}`);
      setMessageSent(true);
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('留言发送失败，请稍后重试');
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <button className="avatar-btn" onClick={() => setShowAvatarSelector(true)} title="更换头像">
            <Avatar avatarId={user?.avatar || 'seal'} size={36} />
          </button>
          <h1>工具箱</h1>
        </div>
        <div className="header-actions">
          <button onClick={toggleTheme} className="btn btn-icon" title="切换主题">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button onClick={() => navigate('/settings')} className="btn btn-icon" title="设置">
            ⚙️
          </button>
          <button onClick={logout} className="btn btn-secondary">退出</button>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="search-section">
          <div className="search-bar">
            <input
              type="text"
              className="search-input"
              placeholder="输入你想解决的问题，AI 为你推荐合适的工具…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            />
            <button
              className="btn btn-primary search-btn"
              onClick={handleSearch}
              disabled={searchState.status === 'searching' || !searchQuery.trim()}
            >
              {searchState.status === 'searching' ? '搜索中…' : '搜索'}
            </button>
            {searchState.status !== 'idle' && searchState.status !== 'searching' && (
              <button className="btn btn-secondary search-clear-btn" onClick={handleClearSearch}>清除</button>
            )}
          </div>

          {searchState.status === 'found_added' && (
            <div className="search-result-tip search-result-found">
              🎯 已为你筛选出相关工具，点击"清除"可恢复全部工具列表。
            </div>
          )}

          {searchState.status === 'found_not_added' && searchState.matchedTool && (
            <div className="search-result-tip search-result-suggest">
              <span>💡 推荐工具：<strong>{searchState.matchedTool.name}</strong> — {searchState.matchedTool.description}</span>
              <div className="search-result-actions">
                <button className="btn btn-primary" onClick={handleAddSuggestedTool}>一键添加</button>
                <button className="btn btn-secondary" onClick={handleOpenAddModal}>查看添加工具</button>
              </div>
            </div>
          )}

          {searchState.status === 'not_found' && (
            <div className="search-result-tip search-result-notfound">
              <p>😔 暂时没有找到相关工具，你可以给站长留言，告诉我们你的需求：</p>
              {messageSent ? (
                <p className="message-sent-tip">✅ 留言已发送，感谢你的反馈！</p>
              ) : (
                <div className="search-message-form">
                  <textarea
                    className="search-message-input"
                    placeholder="描述你的需求…"
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    rows={3}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleSendMessage}
                    disabled={!messageContent.trim()}
                  >
                    发送留言
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="filter-section">
          <h3>标签筛选</h3>
          <div className="tags">
            {allTags.map((tag) => (
              <button
                key={tag}
                className={`tag ${selectedTags.includes(tag) ? 'active' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
            {selectedTags.length > 0 && (
              <button className="tag clear" onClick={() => setSelectedTags([])}>
                清除筛选
              </button>
            )}
          </div>
        </div>

        <div className="tools-grid">
          {filteredTools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} onDelete={handleDeleteTool} />
          ))}
          <div
            className="tool-card add-tool-card"
            onClick={() => { setHighlightToolName(undefined); setShowAddModal(true); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHighlightToolName(undefined); setShowAddModal(true); } }}
            role="button"
            tabIndex={0}
            aria-label="添加新工具"
          >
            <div className="add-tool-cross">＋</div>
          </div>
        </div>
      </div>

      {showAvatarSelector && (
        <AvatarSelector
          currentAvatar={user?.avatar || 'seal'}
          onSelect={handleSelectAvatar}
          onClose={() => setShowAvatarSelector(false)}
        />
      )}

      {showAddModal && (
        <AddToolModal
          onClose={() => { setShowAddModal(false); setHighlightToolName(undefined); }}
          onAdd={handleAddTool}
          existingTools={tools}
          highlightToolName={highlightToolName}
        />
      )}
    </div>
  );
};

export default Dashboard;
