import React, { useState } from 'react';
import type { Tool } from '../types/index';
import '../styles/Modal.css';

interface AddToolModalProps {
  onClose: () => void;
  onAdd: (tool: Omit<Tool, 'id' | 'user_id' | 'created_at'>) => void;
}

// Predefined tools that users can quickly add
const PREDEFINED_TOOLS = [
  {
    name: '股票预测',
    description: '记录和分析股票预测结果，提供准确率统计和可视化分析',
    url: '/stock-prediction',
    tags: ['投资', '分析', '数据'],
  },
];

const AddToolModal: React.FC<AddToolModalProps> = ({ onClose, onAdd }) => {
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

  const handleSelectPredefined = (predefinedTool: typeof PREDEFINED_TOOLS[0]) => {
    setName(predefinedTool.name);
    setDescription(predefinedTool.description);
    setUrl(predefinedTool.url);
    setTags(predefinedTool.tags);
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
        
        {PREDEFINED_TOOLS.length > 0 && (
          <div className="predefined-tools-section">
            <h3>快速添加内置工具</h3>
            <div className="predefined-tools-list">
              {PREDEFINED_TOOLS.map((tool, index) => (
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
