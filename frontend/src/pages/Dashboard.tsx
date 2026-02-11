import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import type { Tool } from '../types/index';
import { toolsAPI } from '../api';
import ToolCard from '../components/ToolCard';
import AddToolModal from '../components/AddToolModal';
import Avatar from '../components/Avatar';
import AvatarSelector from '../components/AvatarSelector';
import '../styles/Dashboard.css';

const Dashboard: React.FC = () => {
  const [tools, setTools] = useState<Tool[]>([]);
  const [filteredTools, setFilteredTools] = useState<Tool[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
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

    // Filter tools by selected tags
    if (selectedTags.length === 0) {
      setFilteredTools(tools);
    } else {
      setFilteredTools(
        tools.filter((tool) =>
          selectedTags.some((tag) => tool.tags.includes(tag))
        )
      );
    }
  }, [tools, selectedTags]);

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
          <div className="tool-card add-tool-card" onClick={() => setShowAddModal(true)}>
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
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddTool}
          existingTools={tools}
        />
      )}
    </div>
  );
};

export default Dashboard;
