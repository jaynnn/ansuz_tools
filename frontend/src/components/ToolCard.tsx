import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { Tool } from '../types/index';
import '../styles/ToolCard.css';

interface ToolCardProps {
  tool: Tool;
  onDelete: (id: number) => void;
}

const ToolCard: React.FC<ToolCardProps> = ({ tool, onDelete }) => {
  const navigate = useNavigate();
  
  const handleClick = () => {
    if (tool.url) {
      // Check if URL is an internal route (starts with /)
      if (tool.url.startsWith('/')) {
        navigate(tool.url);
      } else {
        window.open(tool.url, '_blank');
      }
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
