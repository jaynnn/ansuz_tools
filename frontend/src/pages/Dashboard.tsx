import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Tool } from '../types';
import { toolsAPI } from '../api';
import ToolCard from '../components/ToolCard';
import AddToolModal from '../components/AddToolModal';
import '../styles/Dashboard.css';

const Dashboard: React.FC = () => {
  const [tools, setTools] = useState<Tool[]>([]);
  const [filteredTools, setFilteredTools] = useState<Tool[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newNickname, setNewNickname] = useState('');
  const { user, logout, updateNickname } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
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

  const handleAddTool = async (tool: Omit<Tool, 'id' | 'user_id' | 'created_at'>) => {
    try {
      await toolsAPI.create(tool);
      await fetchTools();
      setShowAddModal(false);
    } catch (error) {
      console.error('Failed to add tool:', error);
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

  const handleUpdateNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateNickname(newNickname);
      setNewNickname('');
      alert('昵称更新成功！');
    } catch (error) {
      console.error('Failed to update nickname:', error);
      alert('更新昵称失败');
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>工具箱</h1>
        <div className="header-actions">
          <button onClick={toggleTheme} className="btn btn-icon" title="切换主题">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button onClick={() => setShowSettings(!showSettings)} className="btn btn-icon" title="设置">
            ⚙️
          </button>
          <button onClick={logout} className="btn btn-secondary">退出</button>
        </div>
      </header>

      {showSettings && (
        <div className="settings-panel">
          <h2>设置</h2>
          <div className="settings-content">
            <form onSubmit={handleUpdateNickname}>
              <div className="form-group">
                <label>修改昵称</label>
                <div className="nickname-input">
                  <input
                    type="text"
                    value={newNickname}
                    onChange={(e) => setNewNickname(e.target.value)}
                    placeholder={user?.nickname}
                  />
                  <button type="submit" className="btn btn-primary">更新</button>
                </div>
              </div>
            </form>
            <div className="form-group">
              <label>工具管理</label>
              <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
                添加工具
              </button>
            </div>
          </div>
        </div>
      )}

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
          {filteredTools.length === 0 ? (
            <div className="empty-state">
              <p>还没有工具，点击右上角的设置添加工具吧！</p>
            </div>
          ) : (
            filteredTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} onDelete={handleDeleteTool} />
            ))
          )}
        </div>
      </div>

      {showAddModal && (
        <AddToolModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddTool}
        />
      )}
    </div>
  );
};

export default Dashboard;
