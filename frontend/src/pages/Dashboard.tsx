import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { toolsAPI } from '../services/api';
import { Tool } from '../types';
import ToolCard from '../components/ToolCard';
import Header from '../components/Header';
import AddToolModal from '../components/AddToolModal';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [tools, setTools] = useState<Tool[]>([]);
  const [filteredTools, setFilteredTools] = useState<Tool[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadTools = async () => {
    try {
      const response = await toolsAPI.getTools();
      setTools(response.data);
      
      // Extract all unique tags
      const tags = new Set<string>();
      response.data.forEach(tool => {
        tool.tags.forEach(tag => tags.add(tag));
      });
      setAllTags(Array.from(tags));
    } catch (error) {
      console.error('Failed to load tools:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTools();
  }, []);

  useEffect(() => {
    if (selectedTags.length === 0) {
      setFilteredTools(tools);
    } else {
      setFilteredTools(
        tools.filter(tool =>
          tool.tags.some(tag => selectedTags.includes(tag))
        )
      );
    }
  }, [tools, selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handleAddTool = async (tool: Omit<Tool, '_id' | 'userId' | 'createdAt'>) => {
    try {
      await toolsAPI.createTool(tool);
      await loadTools();
      setShowAddModal(false);
    } catch (error) {
      console.error('Failed to add tool:', error);
    }
  };

  const handleDeleteTool = async (id: string) => {
    if (window.confirm('确定要删除这个工具吗？')) {
      try {
        await toolsAPI.deleteTool(id);
        await loadTools();
      } catch (error) {
        console.error('Failed to delete tool:', error);
      }
    }
  };

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="dashboard">
      <Header />
      
      <div className="dashboard-content">
        <div className="dashboard-header">
          <h1>欢迎, {user?.nickname}！</h1>
          <button className="btn-add" onClick={() => setShowAddModal(true)}>
            + 添加工具
          </button>
        </div>

        {allTags.length > 0 && (
          <div className="tag-filter">
            <span className="filter-label">筛选标签：</span>
            {allTags.map(tag => (
              <button
                key={tag}
                className={`tag-button ${selectedTags.includes(tag) ? 'active' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
            {selectedTags.length > 0 && (
              <button className="clear-filter" onClick={() => setSelectedTags([])}>
                清除筛选
              </button>
            )}
          </div>
        )}

        <div className="tools-grid">
          {filteredTools.length === 0 ? (
            <div className="empty-state">
              <p>还没有工具，点击"添加工具"开始创建吧！</p>
            </div>
          ) : (
            filteredTools.map(tool => (
              <ToolCard
                key={tool._id}
                tool={tool}
                onDelete={handleDeleteTool}
              />
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
