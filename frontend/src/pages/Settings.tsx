import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import type { Tool } from '../types/index';
import { toolsAPI } from '../api';
import AddToolModal from '../components/AddToolModal';
import Avatar from '../components/Avatar';
import AvatarSelector from '../components/AvatarSelector';
import '../styles/Settings.css';

type SettingsTab = 'profile' | 'tools' | 'donate';

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [newNickname, setNewNickname] = useState('');
  const [qrLoadError, setQrLoadError] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [tools, setTools] = useState<Tool[]>([]);
  const { user, logout, updateNickname, updateAvatar, deleteAccount } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = '设置 - 工具箱';
    fetchTools();
  }, []);

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

  const handleSelectAvatar = async (avatarId: string) => {
    try {
      await updateAvatar(avatarId);
      setShowAvatarSelector(false);
    } catch (error) {
      console.error('Failed to update avatar:', error);
      alert('更新头像失败');
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm('确定要销号吗？此操作不可撤销，所有数据将被永久删除！')) {
      return;
    }
    try {
      await deleteAccount(deletePassword);
      alert('账号已删除');
      navigate('/login');
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      const msg = axiosError?.response?.data?.error || '销号失败';
      alert(msg);
    }
  };

  const renderProfileTab = () => (
    <div className="settings-tab-content">
      <h2>个人设置</h2>

      <div className="settings-section">
        <h3>头像</h3>
        <div className="avatar-setting">
          <button className="avatar-btn" onClick={() => setShowAvatarSelector(true)} title="更换头像">
            <Avatar avatarId={user?.avatar || 'seal'} size={64} />
          </button>
          <span className="avatar-hint">点击头像更换</span>
        </div>
      </div>

      <div className="settings-section">
        <h3>修改昵称</h3>
        <form onSubmit={handleUpdateNickname} className="settings-form">
          <input
            type="text"
            value={newNickname}
            onChange={(e) => setNewNickname(e.target.value)}
            placeholder={user?.nickname || '请输入新昵称'}
            className="settings-input"
          />
          <button type="submit" className="btn btn-primary">更新昵称</button>
        </form>
      </div>

      <div className="settings-section">
        <h3>主题</h3>
        <button onClick={toggleTheme} className="btn btn-secondary">
          {theme === 'light' ? '🌙 切换暗色主题' : '☀️ 切换亮色主题'}
        </button>
      </div>

      <div className="settings-section settings-danger-zone">
        <h3>危险操作</h3>
        {!showDeleteConfirm ? (
          <button onClick={() => setShowDeleteConfirm(true)} className="btn btn-danger">
            删除账号（销号）
          </button>
        ) : (
          <form onSubmit={handleDeleteAccount} className="settings-form">
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="请输入密码确认"
              required
              className="settings-input"
            />
            <div className="settings-form-actions">
              <button type="submit" className="btn btn-danger">确认删除</button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }}>取消</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  const renderToolsTab = () => (
    <div className="settings-tab-content">
      <h2>工具管理</h2>
      <div className="settings-section">
        <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
          添加工具
        </button>
      </div>
      {tools.length > 0 && (
        <div className="settings-section">
          <h3>已有工具</h3>
          <div className="settings-tool-list">
            {tools.map((tool) => (
              <div key={tool.id} className="settings-tool-item">
                <div className="settings-tool-info">
                  <span className="settings-tool-name">{tool.name}</span>
                  <span className="settings-tool-desc">{tool.description}</span>
                </div>
                <button
                  onClick={() => handleDeleteTool(tool.id)}
                  className="btn btn-danger btn-sm"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderDonateTab = () => (
    <div className="settings-tab-content">
      <h2>捐赠支持</h2>
      <div className="settings-section donate-section">
        <p className="donate-text">
          本工具箱的 AI 功能（如 MBTI 分析、交友匹配等）所使用的 Token 均为站长自费购买。
          如果你觉得好用，且有余力的话，可以扫码支持一下，在此谢过 🙏
        </p>
        <div className="donate-qr">
          {!qrLoadError ? (
            <img
              src="/donate.png"
              alt="捐赠二维码"
              onError={() => setQrLoadError(true)}
            />
          ) : (
            <p className="donate-no-qr">捐赠二维码暂未上传</p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="settings-page">
      <header className="settings-header">
        <button className="btn btn-secondary" onClick={() => navigate('/')}>← 返回首页</button>
        <h1>设置</h1>
        <button onClick={logout} className="btn btn-secondary">退出</button>
      </header>

      <div className="settings-layout">
        <nav className="settings-sidebar">
          <button
            className={`sidebar-item ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            👤 个人设置
          </button>
          <button
            className={`sidebar-item ${activeTab === 'tools' ? 'active' : ''}`}
            onClick={() => setActiveTab('tools')}
          >
            🔧 工具管理
          </button>
          <button
            className={`sidebar-item ${activeTab === 'donate' ? 'active' : ''}`}
            onClick={() => setActiveTab('donate')}
          >
            ❤️ 捐赠
          </button>
        </nav>

        <main className="settings-main">
          {activeTab === 'profile' && renderProfileTab()}
          {activeTab === 'tools' && renderToolsTab()}
          {activeTab === 'donate' && renderDonateTab()}
        </main>
      </div>

      {showAddModal && (
        <AddToolModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddTool}
          existingTools={tools}
        />
      )}

      {showAvatarSelector && (
        <AvatarSelector
          currentAvatar={user?.avatar || 'seal'}
          onSelect={handleSelectAvatar}
          onClose={() => setShowAvatarSelector(false)}
        />
      )}
    </div>
  );
};

export default Settings;
