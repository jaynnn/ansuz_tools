import React from 'react';
import type { Tool } from '../types/index';
import { PREDEFINED_TOOLS } from '../data/tools';
import '../styles/Modal.css';

interface AddToolModalProps {
  onClose: () => void;
  onAdd: (tool: Omit<Tool, 'id' | 'user_id' | 'created_at'>) => void;
  existingTools?: Tool[];
}

const AddToolModal: React.FC<AddToolModalProps> = ({ onClose, onAdd, existingTools = [] }) => {
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>添加工具</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="predefined-tools-section">
          {availablePredefinedTools.length > 0 ? (
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
          ) : (
            <p className="no-tools-tip">暂无未添加工具</p>
          )}
        </div>

        <div className="modal-actions" style={{ padding: '1rem 1.5rem' }}>
          <button onClick={onClose} className="btn btn-secondary">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddToolModal;
