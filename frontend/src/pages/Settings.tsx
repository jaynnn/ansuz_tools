import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import './Settings.css';

const Settings: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      await updateUser(nickname);
      setMessage('昵称更新成功！');
    } catch (error) {
      setMessage('更新失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings">
      <Header />
      
      <div className="settings-content">
        <h1>设置</h1>
        
        <div className="settings-section">
          <h2>个人信息</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>用户名</label>
              <input type="text" value={user?.username} disabled />
            </div>
            <div className="form-group">
              <label>昵称</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                required
              />
            </div>
            {message && (
              <div className={`message ${message.includes('成功') ? 'success' : 'error'}`}>
                {message}
              </div>
            )}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? '保存中...' : '保存更改'}
            </button>
          </form>
        </div>

        <div className="settings-section">
          <h2>工具管理</h2>
          <p className="settings-info">
            在主界面可以添加、编辑和删除工具。每个工具可以添加多个标签进行分类。
          </p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
