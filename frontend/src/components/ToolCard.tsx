import React from 'react';
import type { Tool } from '../types';
import './ToolCard.css';

interface ToolCardProps {
  tool: Tool;
  onDelete: (id: string) => void;
}

const ToolCard: React.FC<ToolCardProps> = ({ tool, onDelete }) => {
  return (
    <div className="tool-card">
      <div className="tool-card-header">
        <span className="tool-icon">{tool.icon || '🛠️'}</span>
        <button
          className="btn-delete"
          onClick={() => onDelete(tool._id)}
          title="删除"
        >
          ✕
        </button>
      </div>
      
      <h3 className="tool-name">{tool.name}</h3>
      <p className="tool-description">{tool.description}</p>
      
      {tool.tags.length > 0 && (
        <div className="tool-tags">
          {tool.tags.map((tag, index) => (
            <span key={index} className="tool-tag">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default ToolCard;
