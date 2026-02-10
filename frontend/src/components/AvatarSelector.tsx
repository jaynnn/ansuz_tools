import React from 'react';
import Avatar, { AVATAR_LIST } from './Avatar';
import '../styles/AvatarSelector.css';

interface AvatarSelectorProps {
  currentAvatar: string;
  onSelect: (avatarId: string) => void;
  onClose: () => void;
}

const AvatarSelector: React.FC<AvatarSelectorProps> = ({ currentAvatar, onSelect, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="avatar-selector-modal" onClick={(e) => e.stopPropagation()}>
        <h3>选择头像</h3>
        <p className="avatar-subtitle">Q版海洋生物</p>
        <div className="avatar-grid">
          {AVATAR_LIST.map((avatar) => (
            <button
              key={avatar.id}
              className={`avatar-option ${currentAvatar === avatar.id ? 'selected' : ''}`}
              onClick={() => onSelect(avatar.id)}
              title={avatar.name}
            >
              <Avatar avatarId={avatar.id} size={64} />
              <span className="avatar-name">{avatar.name}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-secondary avatar-close-btn" onClick={onClose}>关闭</button>
      </div>
    </div>
  );
};

export default AvatarSelector;
