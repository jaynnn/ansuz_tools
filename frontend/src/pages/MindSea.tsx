import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { mindseaAPI } from '../api';
import '../styles/MindSea.css';

interface SceneDoc {
  _id: string;
  name: string;
  description: string;
  era: string;
  theme: string;
  color: number[];
  background_image: string | null;
  is_preset: boolean;
}

function colorToCss(color: number[]): string {
  if (!color || color.length < 3) return 'linear-gradient(135deg, #a78bfa, #ec4899)';
  const [r, g, b] = color;
  return `linear-gradient(135deg, rgb(${r},${g},${b}), rgb(${Math.min(r + 40, 255)},${Math.min(g + 20, 255)},${Math.min(b + 60, 255)}))`;
}

const MindSea: React.FC = () => {
  const [scenes, setScenes] = useState<SceneDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    document.title = '心语 · 场景选择';
    fetchScenes();
  }, []);

  const fetchScenes = async () => {
    try {
      setLoading(true);
      const data = await mindseaAPI.getScenes();
      setScenes(data.scenes || []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error || '加载场景失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSceneClick = (scene: SceneDoc) => {
    navigate(`/mindsea/scene/${scene._id}`);
  };

  return (
    <div className="mindsea-page">
      <header className="mindsea-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-icon" onClick={() => navigate('/')} title="返回">←</button>
          <div>
            <h1 className="mindsea-title">心语</h1>
            <p className="mindsea-subtitle">选择你的世界，开启角色扮演之旅</p>
          </div>
        </div>
        <div className="mindsea-header-actions">
          <button className="btn btn-icon" onClick={toggleTheme} title="切换主题">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      <div className="mindsea-content">
        {loading && <div className="mindsea-loading">加载中…</div>}
        {error && <div className="mindsea-error">{error}</div>}
        {!loading && !error && (
          <div className="scene-grid">
            {scenes.map(scene => (
              <div
                key={scene._id}
                className="scene-card"
                onClick={() => handleSceneClick(scene)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSceneClick(scene);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`进入${scene.name}`}
              >
                <div
                  className="scene-card-bg"
                  style={
                    scene.background_image
                      ? { backgroundImage: `url(${scene.background_image})` }
                      : { background: colorToCss(scene.color) }
                  }
                />
                <div className="scene-card-overlay" />
                <div className="scene-card-body">
                  <div className="scene-card-era">{scene.era}</div>
                  <div className="scene-card-name">{scene.name}</div>
                  <div className="scene-card-desc">{scene.description}</div>
                  <div className="scene-card-theme"># {scene.theme}</div>
                </div>
                <div className="scene-card-enter">进入场景 →</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MindSea;
