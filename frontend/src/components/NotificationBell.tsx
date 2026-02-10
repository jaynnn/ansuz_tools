import React, { useState, useEffect, useCallback } from 'react';
import { friendMatchAPI } from '../api';
import '../styles/NotificationBell.css';

interface NotificationBellProps {
  onClick: () => void;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ onClick }) => {
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = useCallback(async () => {
    try {
      const data = await friendMatchAPI.getUnreadCount();
      setUnreadCount(data.count);
    } catch {
      // Silently fail - notifications are non-critical
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    friendMatchAPI.getUnreadCount().then((data) => {
      if (!cancelled) setUnreadCount(data.count);
    }).catch(() => {});
    const interval = setInterval(fetchUnread, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [fetchUnread]);

  return (
    <button className="btn btn-icon notification-bell" onClick={onClick} title="通知">
      🔔
      {unreadCount > 0 && <span className="notification-dot" />}
    </button>
  );
};

export default NotificationBell;
