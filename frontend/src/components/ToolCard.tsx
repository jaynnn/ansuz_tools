import React from 'react';
import { Tool } from '../types';
import '../styles/ToolCard.css';

interface ToolCardProps {
  tool: Tool;
  onDelete: (id: number) => void;
}

const ToolCard: React.FC<ToolCardProps> = ({ tool, onDelete }) => {
  const handleClick = () => {
    if (tool.url) {
      window.open(tool.url, '_blank');
    }
  };

  return (
    <div className="tool-card">
      <div className="tool-card-header">
        <h3>{tool.name}</h3>
        <button
          className="delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(tool.id);
          }}
          title="删除"
        >
          🗑️
        </button>
      </div>
      <p className="tool-description">{tool.description}</p>
      <div className="tool-tags">
        {tool.tags.map((tag, index) => (
          <span key={index} className="tool-tag">
            {tag}
          </span>
        ))}
      </div>
      {tool.url && (
        <button className="tool-action-btn" onClick={handleClick}>
          打开工具
        </button>
      )}
    </div>
  );
};

export default ToolCard;
