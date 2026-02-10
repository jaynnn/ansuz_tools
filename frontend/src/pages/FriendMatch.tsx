import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { impressionAPI, friendMatchAPI } from '../api';
import type { UserImpression, MatchedUser, UserProfile, Notification, PrivateInfo, StructuredPrivateInfo } from '../types/index';
import Avatar from '../components/Avatar';
import NotificationBell from '../components/NotificationBell';
import '../styles/FriendMatch.css';

type ViewMode = 'main' | 'user-detail' | 'notifications' | 'private-info';

const FriendMatch: React.FC = () => {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [myImpression, setMyImpression] = useState<UserImpression | null>(null);
  const [matches, setMatches] = useState<MatchedUser[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [privateInfo, setPrivateInfo] = useState<StructuredPrivateInfo>({
    appearance: {}, contact: {}, location: '', hobbies: '', extraItems: [],
  });
  const [loading, setLoading] = useState(true);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [savingPrivateInfo, setSavingPrivateInfo] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [impressionData, matchData] = await Promise.all([
        impressionAPI.getMyImpression(),
        friendMatchAPI.getTopMatches(),
      ]);
      setMyImpression(impressionData);
      setMatches(matchData.matches);
    } catch (error) {
      console.error('Failed to fetch friend match data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewUser = async (userId: number) => {
    try {
      const profile = await impressionAPI.getUserImpression(userId);
      setSelectedUser(profile);
      setSelectedUserId(userId);
      setViewMode('user-detail');
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
    }
  };

  const handleSendWantToKnow = async () => {
    if (!selectedUserId) return;
    setSendingRequest(true);
    try {
      await friendMatchAPI.sendWantToKnow(selectedUserId);
      alert('已发送认识请求！');
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      const msg = axiosError?.response?.data?.error || '发送失败';
      alert(msg);
    } finally {
      setSendingRequest(false);
    }
  };

  const handleShowNotifications = async () => {
    try {
      const data = await friendMatchAPI.getNotifications();
      setNotifications(data.notifications);
      await friendMatchAPI.markNotificationsRead();
      setViewMode('notifications');
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  const parsePrivateInfo = (raw: PrivateInfo): StructuredPrivateInfo => {
    let appearance = {};
    let contact = {};
    let location = '';
    let hobbies = '';
    let extraItems: Array<{ field: string; detail: string }> = [];

    try { appearance = JSON.parse(raw.appearance || '{}'); } catch { appearance = raw.appearance ? { other: raw.appearance } : {}; }
    try { contact = JSON.parse(raw.contact || '{}'); } catch { contact = raw.contact ? { other: raw.contact } : {}; }
    try {
      const extra = JSON.parse(raw.extra || '{}');
      location = extra.location || '';
      hobbies = extra.hobbies || '';
      extraItems = Array.isArray(extra.items) ? extra.items : [];
    } catch {
      if (raw.extra) extraItems = [{ field: '其他', detail: raw.extra }];
    }
    return { appearance, contact, location, hobbies, extraItems };
  };

  const serializePrivateInfo = (info: StructuredPrivateInfo): PrivateInfo => ({
    appearance: JSON.stringify(info.appearance),
    contact: JSON.stringify(info.contact),
    extra: JSON.stringify({ location: info.location, hobbies: info.hobbies, items: info.extraItems }),
  });

  const handleShowPrivateInfo = async () => {
    try {
      const raw = await friendMatchAPI.getPrivateInfo();
      setPrivateInfo(parsePrivateInfo(raw));
      setViewMode('private-info');
    } catch (error) {
      console.error('Failed to fetch private info:', error);
    }
  };

  const handleSavePrivateInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrivateInfo(true);
    try {
      await friendMatchAPI.updatePrivateInfo(serializePrivateInfo(privateInfo));
      alert('隐私信息已保存');
    } catch {
      alert('保存失败');
    } finally {
      setSavingPrivateInfo(false);
    }
  };

  const goBack = () => {
    setViewMode('main');
    setSelectedUser(null);
    setSelectedUserId(null);
  };

  if (loading) {
    return (
      <div className="friend-match">
        <div className="loading-state">加载中...</div>
      </div>
    );
  }

  // User Detail View (shared for matches & notification clicks)
  if (viewMode === 'user-detail' && selectedUser) {
    return (
      <div className="friend-match">
        <header className="fm-header">
          <button className="btn btn-secondary" onClick={goBack}>← 返回</button>
          <h1>用户印象</h1>
          <div />
        </header>
        <div className="fm-content">
          <div className="user-detail-card">
            <div className="user-detail-avatar">
              <Avatar avatarId={selectedUser.user.avatar} size={80} />
              <h2>{selectedUser.user.nickname}</h2>
            </div>
            {selectedUser.overview && (
              <div className="user-detail-overview">
                <h3>印象概览</h3>
                <p>{selectedUser.overview}</p>
              </div>
            )}
            {selectedUser.contact && (
              <div className="user-detail-contact">
                <h3>联系方式</h3>
                <p>{selectedUser.contact}</p>
              </div>
            )}
            <button
              className="btn btn-primary want-to-know-btn"
              onClick={handleSendWantToKnow}
              disabled={sendingRequest}
            >
              {sendingRequest ? '发送中...' : '💌 我想认识你'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Notifications View
  if (viewMode === 'notifications') {
    return (
      <div className="friend-match">
        <header className="fm-header">
          <button className="btn btn-secondary" onClick={goBack}>← 返回</button>
          <h1>想认识你的人</h1>
          <div />
        </header>
        <div className="fm-content">
          {notifications.length === 0 ? (
            <div className="empty-state"><p>暂无通知</p></div>
          ) : (
            <div className="notification-list">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notification-item ${n.is_read ? '' : 'unread'}`}
                  onClick={() => handleViewUser(n.from_user_id)}
                >
                  <Avatar avatarId={n.avatar || 'seal'} size={48} />
                  <div className="notification-info">
                    <span className="notification-name">{n.nickname}</span>
                    <span className="notification-text">想认识你</span>
                    <span className="notification-time">{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Private Info View
  if (viewMode === 'private-info') {
    return (
      <div className="friend-match">
        <header className="fm-header">
          <button className="btn btn-secondary" onClick={goBack}>← 返回</button>
          <h1>隐私信息</h1>
          <div />
        </header>
        <div className="fm-content">
          <div className="privacy-warning">
            ⚠️ 注意隐私安全：以下信息将对想认识你的用户可见。请谨慎填写个人信息，不要透露敏感信息（如家庭住址、身份证号等）。
          </div>
          <form className="private-info-form" onSubmit={handleSavePrivateInfo}>
            {/* Appearance Section */}
            <div className="form-section">
              <h3>外貌信息</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>身高</label>
                  <input
                    type="text"
                    value={privateInfo.appearance.height || ''}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, appearance: { ...privateInfo.appearance, height: e.target.value } })}
                    placeholder="如：175cm"
                  />
                </div>
                <div className="form-group">
                  <label>体重</label>
                  <input
                    type="text"
                    value={privateInfo.appearance.weight || ''}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, appearance: { ...privateInfo.appearance, weight: e.target.value } })}
                    placeholder="如：65kg"
                  />
                </div>
                <div className="form-group">
                  <label>肤色</label>
                  <input
                    type="text"
                    value={privateInfo.appearance.skin || ''}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, appearance: { ...privateInfo.appearance, skin: e.target.value } })}
                    placeholder="如：白皙、小麦色"
                  />
                </div>
                <div className="form-group">
                  <label>体型</label>
                  <input
                    type="text"
                    value={privateInfo.appearance.bodyType || ''}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, appearance: { ...privateInfo.appearance, bodyType: e.target.value } })}
                    placeholder="如：偏瘦、匀称、健壮"
                  />
                </div>
                <div className="form-group">
                  <label>脸型</label>
                  <input
                    type="text"
                    value={privateInfo.appearance.faceShape || ''}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, appearance: { ...privateInfo.appearance, faceShape: e.target.value } })}
                    placeholder="如：圆脸、瓜子脸"
                  />
                </div>
                <div className="form-group">
                  <label>其他外貌</label>
                  <input
                    type="text"
                    value={privateInfo.appearance.other || ''}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, appearance: { ...privateInfo.appearance, other: e.target.value } })}
                    placeholder="其他外貌特征"
                  />
                </div>
              </div>
            </div>

            {/* Location & Hobbies Section */}
            <div className="form-section">
              <h3>基本信息</h3>
              <div className="form-group">
                <label>所在地</label>
                <input
                  type="text"
                  value={privateInfo.location}
                  onChange={(e) => setPrivateInfo({ ...privateInfo, location: e.target.value })}
                  placeholder="如：北京、上海"
                />
              </div>
              <div className="form-group">
                <label>兴趣爱好</label>
                <input
                  type="text"
                  value={privateInfo.hobbies}
                  onChange={(e) => setPrivateInfo({ ...privateInfo, hobbies: e.target.value })}
                  placeholder="如：读书、编程、旅行、摄影"
                />
              </div>
            </div>

            {/* Contact Section */}
            <div className="form-section">
              <h3>联系方式</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>微信</label>
                  <input
                    type="text"
                    value={privateInfo.contact.wechat || ''}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, contact: { ...privateInfo.contact, wechat: e.target.value } })}
                    placeholder="微信号"
                  />
                </div>
                <div className="form-group">
                  <label>QQ</label>
                  <input
                    type="text"
                    value={privateInfo.contact.qq || ''}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, contact: { ...privateInfo.contact, qq: e.target.value } })}
                    placeholder="QQ号"
                  />
                </div>
                <div className="form-group">
                  <label>手机号</label>
                  <input
                    type="text"
                    value={privateInfo.contact.phone || ''}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, contact: { ...privateInfo.contact, phone: e.target.value } })}
                    placeholder="手机号"
                  />
                </div>
                <div className="form-group">
                  <label>邮箱</label>
                  <input
                    type="text"
                    value={privateInfo.contact.email || ''}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, contact: { ...privateInfo.contact, email: e.target.value } })}
                    placeholder="邮箱地址"
                  />
                </div>
                <div className="form-group form-group-full">
                  <label>其他联系方式</label>
                  <input
                    type="text"
                    value={privateInfo.contact.other || ''}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, contact: { ...privateInfo.contact, other: e.target.value } })}
                    placeholder="其他联系方式"
                  />
                </div>
              </div>
            </div>

            {/* Extra Items Section */}
            <div className="form-section">
              <h3>其他信息（想被别人知道的）</h3>
              {privateInfo.extraItems.map((item, index) => (
                <div key={index} className="extra-item-row">
                  <input
                    type="text"
                    value={item.field}
                    onChange={(e) => {
                      const items = [...privateInfo.extraItems];
                      items[index] = { ...items[index], field: e.target.value };
                      setPrivateInfo({ ...privateInfo, extraItems: items });
                    }}
                    placeholder="字段名"
                    className="extra-field-input"
                  />
                  <input
                    type="text"
                    value={item.detail}
                    onChange={(e) => {
                      const items = [...privateInfo.extraItems];
                      items[index] = { ...items[index], detail: e.target.value };
                      setPrivateInfo({ ...privateInfo, extraItems: items });
                    }}
                    placeholder="详情"
                    className="extra-detail-input"
                  />
                  <button
                    type="button"
                    className="btn btn-icon extra-remove-btn"
                    onClick={() => {
                      const items = privateInfo.extraItems.filter((_, i) => i !== index);
                      setPrivateInfo({ ...privateInfo, extraItems: items });
                    }}
                    title="删除"
                  >✕</button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-secondary extra-add-btn"
                onClick={() => setPrivateInfo({
                  ...privateInfo,
                  extraItems: [...privateInfo.extraItems, { field: '', detail: '' }],
                })}
              >
                + 添加一项
              </button>
            </div>

            <button type="submit" className="btn btn-primary" disabled={savingPrivateInfo}>
              {savingPrivateInfo ? '保存中...' : '保存'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Main View
  return (
    <div className="friend-match">
      <header className="fm-header">
        <a href="/" className="btn btn-secondary">← 首页</a>
        <h1>交友匹配</h1>
        <div className="fm-header-actions">
          <button className="btn btn-icon" onClick={handleShowPrivateInfo} title="隐私信息">📝</button>
          <NotificationBell onClick={handleShowNotifications} />
        </div>
      </header>

      <div className="fm-content">
        {/* My Impression Section */}
        <section className="my-impression-section">
          <div className="impression-header">
            <Avatar avatarId={user?.avatar || 'seal'} size={64} />
            <div className="impression-user-info">
              <h2>{user?.nickname || user?.username}</h2>
              {myImpression?.overview ? (
                <p className="impression-overview">{myImpression.overview}</p>
              ) : (
                <p className="impression-placeholder">完成MBTI测试后将生成你的印象概览</p>
              )}
            </div>
          </div>
          {myImpression && Object.keys(myImpression.dimensions).length > 0 && (
            <div className="impression-dimensions">
              <h3>我的印象维度</h3>
              <div className="dimension-tags">
                {Object.entries(myImpression.dimensions).map(([key, value]) => (
                  <span key={key} className="dimension-tag">
                    <strong>{key}</strong>：{value}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Top Matches Section */}
        <section className="matches-section">
          <h2>匹配推荐</h2>
          {matches.length === 0 ? (
            <div className="empty-state">
              <p>暂无匹配结果。完成MBTI测试后将自动进行匹配。</p>
            </div>
          ) : (
            <div className="matches-list">
              {matches.map((match) => (
                <div
                  key={match.userId}
                  className="match-card"
                  onClick={() => handleViewUser(match.userId)}
                >
                  <Avatar avatarId={match.avatar} size={48} />
                  <div className="match-info">
                    <span className="match-name">{match.nickname}</span>
                    <span className="match-overview">{match.overview || '暂无印象'}</span>
                  </div>
                  <div className="match-score">
                    <span className="score-value">{Math.round(match.score)}</span>
                    <span className="score-label">匹配分</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default FriendMatch;
