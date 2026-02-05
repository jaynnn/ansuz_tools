import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './Header.css';

const Header: React.FC = () => {
  const { logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="header">
      <div className="header-content">
        <Link to="/dashboard" className="header-logo">
          🛠️ Ansuz Tools
        </Link>
        
        <div className="header-actions">
          <button className="theme-toggle" onClick={toggleTheme} title="切换主题">
            {isDark ? '☀️' : '🌙'}
          </button>
          
          <Link to="/settings" className="header-link">
            ⚙️ 设置
          </Link>
          
          <button className="btn-logout" onClick={handleLogout}>
            退出
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
