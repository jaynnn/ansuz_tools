import React, { useState } from 'react';
import { Tool } from '../types';
import './AddToolModal.css';

interface AddToolModalProps {
  onClose: () => void;
  onAdd: (tool: Omit<Tool, '_id' | 'userId' | 'createdAt'>) => void;
}

const AddToolModal: React.FC<AddToolModalProps> = ({ onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [icon, setIcon] = useState('🛠️');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const tagArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    
    onAdd({
      name,
      description,
      tags: tagArray,
      icon
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>添加新工具</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>图标</label>
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="输入 emoji 图标"
            />
          </div>
          
          <div className="form-group">
            <label>工具名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="例如：时间转换器"
            />
          </div>
          
          <div className="form-group">
            <label>工具描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              placeholder="简单描述这个工具的功能"
              rows={3}
            />
          </div>
          
          <div className="form-group">
            <label>标签（用逗号分隔）</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="例如：开发,工具,转换"
            />
          </div>
          
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn-submit">
              添加
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddToolModal;
