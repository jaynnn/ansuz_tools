import React, { useState } from 'react';
import type { Tool } from '../types/index';
import '../styles/Modal.css';

interface AddToolModalProps {
  onClose: () => void;
  onAdd: (tool: Omit<Tool, 'id' | 'user_id' | 'created_at'>) => void;
  existingTools?: Tool[];
}

// Predefined tools that users can quickly add
const PREDEFINED_TOOLS = [
  {
    name: '股票预测',
    description: '记录和分析股票预测结果，提供准确率统计和可视化分析',
    url: '/stock-prediction',
    tags: ['投资', '分析', '数据'],
  },
  {
    name: 'AI+MBTI性格测试',
    description: 'AI驱动的MBTI人格类型测试，64道专业题目，支持滑动条评分，提供基于分值和AI双重分析',
    url: '/mbti-test',
    tags: ['AI', '心理', '测试', 'MBTI'],
  },
  {
    name: '缘分罗盘',
    description: 'MBTI人格 × 星座能量 × 八字命理 三重融合匹配，发现你命中注定的灵魂搭档',
    url: '/friend-match',
    tags: ['社交', '交友', 'AI'],
  },
  {
    name: '数独游戏',
    description: '经典数独益智游戏，支持简单/中等/困难三种难度，提供笔记模式和计时功能',
    url: '/sudoku',
    tags: ['游戏', '益智', '数独'],
  },
];

const AddToolModal: React.FC<AddToolModalProps> = ({ onClose, onAdd, existingTools = [] }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  // Filter out predefined tools that the user has already added
  const availablePredefinedTools = PREDEFINED_TOOLS.filter(
    (pt) => !existingTools.some((et) => et.name === pt.name && et.url === pt.url)
  );

  const handleSelectPredefined = (predefinedTool: typeof PREDEFINED_TOOLS[0]) => {
    onAdd({
      name: predefinedTool.name,
      description: predefinedTool.description,
      url: predefinedTool.url,
      tags: predefinedTool.tags,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({ name, description, tags, url });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>添加工具</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        {availablePredefinedTools.length > 0 && (
          <div className="predefined-tools-section">
            <h3>快速添加内置工具</h3>
            <div className="predefined-tools-list">
              {availablePredefinedTools.map((tool, index) => (
                <div
                  key={index}
                  className="predefined-tool-item"
                  onClick={() => handleSelectPredefined(tool)}
                >
                  <h4>{tool.name}</h4>
                  <p>{tool.description}</p>
                  <div className="tool-tags-preview">
                    {tool.tags.map((tag, idx) => (
                      <span key={idx} className="tag-preview">{tag}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="section-divider">
              <span>或</span>
            </div>
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>工具名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label>URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com 或 /internal-route"
            />
          </div>
          <div className="form-group">
            <label>标签</label>
            <div className="tag-input">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="输入标签后按回车"
              />
              <button type="button" onClick={handleAddTag} className="btn btn-secondary">
                添加
              </button>
            </div>
            <div className="tags-list">
              {tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                  <button type="button" onClick={() => handleRemoveTag(tag)}>×</button>
                </span>
              ))}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              取消
            </button>
            <button type="submit" className="btn btn-primary">
              添加
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddToolModal;
