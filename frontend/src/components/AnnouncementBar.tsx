import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../styles/AnnouncementBar.css';

const AnnouncementBar: React.FC = () => {
  const [message, setMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch latest announcement on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const apiBase = import.meta.env.DEV ? 'http://localhost:4000/api' : '/api';
    fetch(`${apiBase}/announcements/latest`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.announcement?.message) {
          setMessage(data.announcement.message);
          setDismissed(false);
        }
      })
      .catch(() => {
        // Non-critical: announcement will still show via WebSocket
      });
  }, []);

  // WebSocket connection for real-time announcements
  const connectWs = useCallback(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = import.meta.env.DEV ? 'localhost:4000' : window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'announcement' && parsed.data?.message) {
          setMessage(parsed.data.message);
          setDismissed(false);
        }
      } catch {
        // ignore invalid messages
      }
    };

    ws.onclose = () => {
      // Reconnect after 5 seconds
      reconnectTimer.current = setTimeout(connectWs, 5000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connectWs();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  if (!message || dismissed) return null;

  return (
    <div className="announcement-bar">
      <div className="announcement-content">
        <span className="announcement-icon">📢</span>
        <div className="announcement-scroll">
          <span className="announcement-text">{message}</span>
        </div>
      </div>
      <button className="announcement-close" onClick={() => setDismissed(true)} title="关闭">
        ✕
      </button>
    </div>
  );
};

export default AnnouncementBar;
