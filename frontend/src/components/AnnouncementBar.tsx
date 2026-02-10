import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../styles/AnnouncementBar.css';

const AnnouncementBar: React.FC = () => {
  const [message, setMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDurationTimer = () => {
    if (durationTimer.current) {
      clearTimeout(durationTimer.current);
      durationTimer.current = null;
    }
  };

  const showAnnouncement = (msg: string, duration?: number | null) => {
    clearDurationTimer();
    setMessage(msg);
    setDismissed(false);
    if (duration && duration > 0) {
      durationTimer.current = setTimeout(() => {
        setDismissed(true);
      }, duration * 1000);
    }
  };

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
          showAnnouncement(data.announcement.message, data.announcement.duration);
        }
      })
      .catch(() => {
        // Non-critical: announcement will still show via WebSocket
      });
  }, []);

  // WebSocket connection for real-time announcements
  const connectWs = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = import.meta.env.DEV ? 'localhost:4000' : window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'announcement' && parsed.data?.message) {
            showAnnouncement(parsed.data.message, parsed.data.duration);
          }
        } catch {
          // ignore invalid messages
        }
      };

      ws.onclose = () => {
        // Reconnect after 5 seconds only if user is still logged in
        if (localStorage.getItem('token')) {
          reconnectTimer.current = setTimeout(connectWs, 5000);
        }
      };

      ws.onerror = () => {
        // Silently close on error to avoid console noise
        try { ws.close(); } catch { /* ignore */ }
      };
    } catch {
      // Ignore WebSocket construction errors
    }
  }, []);

  useEffect(() => {
    connectWs();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      clearDurationTimer();
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
      <button className="announcement-close" onClick={() => { clearDurationTimer(); setDismissed(true); }} title="关闭">
        ✕
      </button>
    </div>
  );
};

export default AnnouncementBar;
