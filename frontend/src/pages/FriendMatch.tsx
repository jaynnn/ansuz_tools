import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { impressionAPI, friendMatchAPI } from '../api';
import type { UserImpression, MatchedUser, UserProfile, Notification, PrivateInfo, StructuredPrivateInfo, AddedUser, ContactVotes } from '../types/index';
import Avatar from '../components/Avatar';
import NotificationBell from '../components/NotificationBell';
import '../styles/FriendMatch.css';

type ViewMode = 'main' | 'user-detail' | 'notifications' | 'private-info' | 'added-users';

const PROFILE_CACHE_DURATION_MS = 10 * 60 * 1000;

const CONTACT_LABELS: Record<string, string> = {
  wechat: '微信',
  qq: 'QQ',
  phone: '手机',
  email: '邮箱',
  other: '其他',
};

const formatContact = (contactStr: string): Array<{ label: string; value: string }> => {
  try {
    const obj = JSON.parse(contactStr);
    return Object.entries(obj)
      .filter(([, v]) => v)
      .map(([k, v]) => ({ label: CONTACT_LABELS[k] || k, value: String(v) }));
  } catch {
    return contactStr ? [{ label: '联系方式', value: contactStr }] : [];
  }
};

/** Render text with paragraph splitting */
const ParagraphText: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 0);
  if (paragraphs.length <= 1) {
    return <p className={className}>{text}</p>;
  }
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i}>{p.trim()}</p>
      ))}
    </div>
  );
};

const FriendMatch: React.FC = () => {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [myImpression, setMyImpression] = useState<UserImpression | null>(null);
  const [matches, setMatches] = useState<MatchedUser[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedMatchReason, setSelectedMatchReason] = useState<string | null>(null);
  const [privateInfo, setPrivateInfo] = useState<StructuredPrivateInfo>({
    appearance: {}, contact: {}, gender: '', birthDate: '', birthTime: '', location: '', hobbies: '', friendIntention: '',
    education: '', occupation: '', smoking: '', drinking: '', sleepSchedule: '', exercise: '', pets: '',
    gaming: '', tvShows: '', music: '', food: '', travel: '', reading: '', socialStyle: '',
    extraItems: [],
  });
  const [loading, setLoading] = useState(true);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [savingPrivateInfo, setSavingPrivateInfo] = useState(false);
  const [detailedProfile, setDetailedProfile] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const profileCache = useRef<Map<number, { profile: string; timestamp: number }>>(new Map());
  const [addedUsers, setAddedUsers] = useState<AddedUser[]>([]);
  const [contactVotes, setContactVotes] = useState<ContactVotes | null>(null);
  const [votingContact, setVotingContact] = useState(false);

  useEffect(() => {
    document.title = '交友匹配 - 工具箱';
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
      const [profile, votes] = await Promise.all([
        impressionAPI.getUserImpression(userId),
        friendMatchAPI.getContactVotes(userId),
      ]);
      setSelectedUser(profile);
      setSelectedUserId(userId);
      // Carry over match reason from the matches list if available
      const matchEntry = matches.find(m => m.userId === userId);
      setSelectedMatchReason(matchEntry?.matchReason || null);
      setContactVotes(votes);
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
    let gender = '';
    let birthDate = '';
    let birthTime = '';
    let location = '';
    let hobbies = '';
    let friendIntention = '';
    let education = '';
    let occupation = '';
    let smoking = '';
    let drinking = '';
    let sleepSchedule = '';
    let exercise = '';
    let pets = '';
    let gaming = '';
    let tvShows = '';
    let music = '';
    let food = '';
    let travel = '';
    let reading = '';
    let socialStyle = '';
    let extraItems: Array<{ field: string; detail: string }> = [];

    try { appearance = JSON.parse(raw.appearance || '{}'); } catch { appearance = raw.appearance ? { other: raw.appearance } : {}; }
    try { contact = JSON.parse(raw.contact || '{}'); } catch { contact = raw.contact ? { other: raw.contact } : {}; }
    try {
      const extra = JSON.parse(raw.extra || '{}');
      gender = extra.gender || '';
      birthDate = extra.birthDate || '';
      birthTime = extra.birthTime || '';
      location = extra.location || '';
      hobbies = extra.hobbies || '';
      friendIntention = extra.friendIntention || '';
      education = extra.education || '';
      occupation = extra.occupation || '';
      smoking = extra.smoking || '';
      drinking = extra.drinking || '';
      sleepSchedule = extra.sleepSchedule || '';
      exercise = extra.exercise || '';
      pets = extra.pets || '';
      gaming = extra.gaming || '';
      tvShows = extra.tvShows || '';
      music = extra.music || '';
      food = extra.food || '';
      travel = extra.travel || '';
      reading = extra.reading || '';
      socialStyle = extra.socialStyle || '';
      extraItems = Array.isArray(extra.items) ? extra.items : [];
    } catch {
      if (raw.extra) extraItems = [{ field: '其他', detail: raw.extra }];
    }
    return { appearance, contact, gender, birthDate, birthTime, location, hobbies, friendIntention,
      education, occupation, smoking, drinking, sleepSchedule, exercise, pets,
      gaming, tvShows, music, food, travel, reading, socialStyle, extraItems };
  };

  const serializePrivateInfo = (info: StructuredPrivateInfo): PrivateInfo => ({
    appearance: JSON.stringify(info.appearance),
    contact: JSON.stringify(info.contact),
    extra: JSON.stringify({
      gender: info.gender, birthDate: info.birthDate, birthTime: info.birthTime,
      location: info.location, hobbies: info.hobbies, friendIntention: info.friendIntention,
      education: info.education, occupation: info.occupation, smoking: info.smoking,
      drinking: info.drinking, sleepSchedule: info.sleepSchedule, exercise: info.exercise,
      pets: info.pets, gaming: info.gaming, tvShows: info.tvShows, music: info.music,
      food: info.food, travel: info.travel, reading: info.reading, socialStyle: info.socialStyle,
      items: info.extraItems,
    }),
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
      alert('个人信息已保存，需要等待几分钟时间生效。');
    } catch {
      alert('保存失败');
    } finally {
      setSavingPrivateInfo(false);
    }
  };

  const handleViewDetailedProfile = async () => {
    if (!selectedUserId) return;

    // If profile is currently shown, collapse it
    if (detailedProfile) {
      setDetailedProfile(null);
      return;
    }

    // Check cache
    const cached = profileCache.current.get(selectedUserId);
    if (cached && Date.now() - cached.timestamp < PROFILE_CACHE_DURATION_MS) {
      setDetailedProfile(cached.profile);
      return;
    }

    setLoadingProfile(true);
    try {
      const data = await impressionAPI.getUserProfile(selectedUserId);
      setDetailedProfile(data.profile);
      profileCache.current.set(selectedUserId, { profile: data.profile, timestamp: Date.now() });
    } catch (error) {
      console.error('Failed to fetch detailed profile:', error);
      setDetailedProfile('暂无法生成详细资料，请稍后再试');
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleAddUser = async (userId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await friendMatchAPI.addUser(userId);
      setMatches(prev => prev.filter(m => m.userId !== userId));
    } catch (error) {
      console.error('Failed to add user:', error);
    }
  };

  const handleShowAddedUsers = async () => {
    try {
      const data = await friendMatchAPI.getAddedUsers();
      setAddedUsers(data.users);
      setViewMode('added-users');
    } catch (error) {
      console.error('Failed to fetch added users:', error);
    }
  };

  const handleRemoveAddedUser = async (targetUserId: number) => {
    try {
      await friendMatchAPI.removeAddedUser(targetUserId);
      setAddedUsers(prev => prev.filter(u => u.target_user_id !== targetUserId));
    } catch (error) {
      console.error('Failed to remove added user:', error);
    }
  };

  const handleBlockUser = async (targetUserId: number) => {
    try {
      await friendMatchAPI.blockUser(targetUserId);
      setAddedUsers(prev => prev.map(u =>
        u.target_user_id === targetUserId ? { ...u, status: 'blocked' as const } : u
      ));
    } catch (error) {
      console.error('Failed to block user:', error);
    }
  };

  const handleUnblockUser = async (targetUserId: number) => {
    try {
      await friendMatchAPI.unblockUser(targetUserId);
      setAddedUsers(prev => prev.filter(u => u.target_user_id !== targetUserId));
    } catch (error) {
      console.error('Failed to unblock user:', error);
    }
  };

  const handleVoteContact = async (vote: 'true' | 'false') => {
    if (!selectedUserId || votingContact) return;
    setVotingContact(true);
    try {
      await friendMatchAPI.voteContact(selectedUserId, vote);
      const votes = await friendMatchAPI.getContactVotes(selectedUserId);
      setContactVotes(votes);
    } catch (error) {
      console.error('Failed to vote:', error);
    } finally {
      setVotingContact(false);
    }
  };

  const goBack = () => {
    setViewMode('main');
    setSelectedUser(null);
    setSelectedUserId(null);
    setSelectedMatchReason(null);
    setDetailedProfile(null);
    setContactVotes(null);
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
              <h2>
                {selectedUser.user.nickname}
                {selectedUser.user.mbtiType && (
                  <span className="mbti-badge">{selectedUser.user.mbtiType}</span>
                )}
              </h2>
            </div>
            {selectedUser.overview && (
              <div className="user-detail-overview">
                <h3>印象概览</h3>
                <ParagraphText text={selectedUser.overview} />
              </div>
            )}
            {selectedMatchReason && (
              <div className="user-detail-match-reason">
                <h3>💡 配对原因</h3>
                <p>{selectedMatchReason}</p>
              </div>
            )}
            {selectedUser.contact && (
              <div className="user-detail-contact">
                <h3>联系方式</h3>
                <div className="contact-items">
                  {formatContact(selectedUser.contact).map((item, idx) => (
                    <div key={idx} className="contact-item">
                      <span className="contact-label">{item.label}：</span>
                      <span className="contact-value">{item.value}</span>
                    </div>
                  ))}
                </div>
                <div className="contact-vote-section">
                  <button
                    className={`contact-vote-btn vote-true ${contactVotes?.myVote === 'true' ? 'active' : ''}`}
                    onClick={() => handleVoteContact('true')}
                    disabled={votingContact}
                  >
                    真 <sub className="vote-count">{contactVotes?.trueCount || 0}</sub>
                  </button>
                  <button
                    className={`contact-vote-btn vote-false ${contactVotes?.myVote === 'false' ? 'active' : ''}`}
                    onClick={() => handleVoteContact('false')}
                    disabled={votingContact}
                  >
                    假 <sub className="vote-count">{contactVotes?.falseCount || 0}</sub>
                  </button>
                </div>
              </div>
            )}
            {detailedProfile && (
              <div className="user-detail-profile">
                <h3>详细资料</h3>
                <ParagraphText text={detailedProfile} />
              </div>
            )}
            <div className="user-detail-actions">
              <button
                className="btn btn-secondary detail-profile-btn"
                onClick={handleViewDetailedProfile}
                disabled={loadingProfile}
              >
                {loadingProfile ? '查看中...' : detailedProfile ? '📋 收起' : '📋 查看详细资料'}
              </button>
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

  // Added Users / Blacklist View
  if (viewMode === 'added-users') {
    const addedList = addedUsers.filter(u => u.status === 'added');
    const blockedList = addedUsers.filter(u => u.status === 'blocked');
    return (
      <div className="friend-match">
        <header className="fm-header">
          <button className="btn btn-secondary" onClick={goBack}>← 返回</button>
          <h1>已添加用户</h1>
          <div />
        </header>
        <div className="fm-content">
          <section className="added-users-section">
            <h3>已添加 ({addedList.length})</h3>
            {addedList.length === 0 ? (
              <div className="empty-state"><p>暂无已添加用户</p></div>
            ) : (
              <div className="added-users-list">
                {addedList.map((u) => (
                  <div key={u.target_user_id} className="added-user-item">
                    <Avatar avatarId={u.avatar || 'seal'} size={40} />
                    <span className="added-user-name">{u.nickname}</span>
                    <div className="added-user-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRemoveAddedUser(u.target_user_id)}
                        title="移除（重新出现在匹配列表）"
                      >移除</button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleBlockUser(u.target_user_id)}
                        title="拉黑（永不出现在匹配列表）"
                      >拉黑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="added-users-section">
            <h3>黑名单 ({blockedList.length})</h3>
            {blockedList.length === 0 ? (
              <div className="empty-state"><p>暂无黑名单用户</p></div>
            ) : (
              <div className="added-users-list">
                {blockedList.map((u) => (
                  <div key={u.target_user_id} className="added-user-item">
                    <Avatar avatarId={u.avatar || 'seal'} size={40} />
                    <span className="added-user-name">{u.nickname}</span>
                    <div className="added-user-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleUnblockUser(u.target_user_id)}
                        title="解除拉黑"
                      >解除拉黑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
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
          <h1>个人信息</h1>
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
                <label>性别</label>
                <select
                  value={privateInfo.gender}
                  onChange={(e) => setPrivateInfo({ ...privateInfo, gender: e.target.value })}
                >
                  <option value="">请选择</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </div>
              <div className="form-group">
                <label>出生日期</label>
                <input
                  type="date"
                  value={privateInfo.birthDate}
                  onChange={(e) => setPrivateInfo({ ...privateInfo, birthDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>出生时辰</label>
                <select
                  value={privateInfo.birthTime}
                  onChange={(e) => setPrivateInfo({ ...privateInfo, birthTime: e.target.value })}
                >
                  <option value="">请选择（可不填）</option>
                  <option value="23:00">子时（23:00-01:00）</option>
                  <option value="02:00">丑时（01:00-03:00）</option>
                  <option value="04:00">寅时（03:00-05:00）</option>
                  <option value="06:00">卯时（05:00-07:00）</option>
                  <option value="08:00">辰时（07:00-09:00）</option>
                  <option value="10:00">巳时（09:00-11:00）</option>
                  <option value="12:00">午时（11:00-13:00）</option>
                  <option value="14:00">未时（13:00-15:00）</option>
                  <option value="16:00">申时（15:00-17:00）</option>
                  <option value="18:00">酉时（17:00-19:00）</option>
                  <option value="20:00">戌时（19:00-21:00）</option>
                  <option value="22:00">亥时（21:00-23:00）</option>
                </select>
              </div>
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
              <div className="form-group">
                <label>交友意愿</label>
                <textarea
                  value={privateInfo.friendIntention}
                  onChange={(e) => setPrivateInfo({ ...privateInfo, friendIntention: e.target.value })}
                  placeholder="如：希望找到志同道合的朋友、想找对象、寻找技术交流伙伴等"
                  rows={3}
                />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label>学历</label>
                  <select
                    value={privateInfo.education}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, education: e.target.value })}
                  >
                    <option value="">请选择</option>
                    <option value="高中及以下">高中及以下</option>
                    <option value="大专">大专</option>
                    <option value="本科">本科</option>
                    <option value="硕士">硕士</option>
                    <option value="博士">博士</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>职业/行业</label>
                  <input
                    type="text"
                    value={privateInfo.occupation}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, occupation: e.target.value })}
                    placeholder="如：互联网、金融、教师、自由职业"
                  />
                </div>
              </div>
            </div>

            {/* Lifestyle Section */}
            <div className="form-section">
              <h3>生活偏好</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>作息习惯</label>
                  <select
                    value={privateInfo.sleepSchedule}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, sleepSchedule: e.target.value })}
                  >
                    <option value="">请选择</option>
                    <option value="早睡早起">早睡早起</option>
                    <option value="晚睡晚起">晚睡晚起</option>
                    <option value="晚睡早起">晚睡早起</option>
                    <option value="不固定">不固定</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>社交风格</label>
                  <select
                    value={privateInfo.socialStyle}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, socialStyle: e.target.value })}
                  >
                    <option value="">请选择</option>
                    <option value="喜欢热闹，经常社交">喜欢热闹，经常社交</option>
                    <option value="偏好小圈子">偏好小圈子</option>
                    <option value="享受独处，偶尔社交">享受独处，偶尔社交</option>
                    <option value="宅家为主">宅家为主</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>吸烟习惯</label>
                  <select
                    value={privateInfo.smoking}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, smoking: e.target.value })}
                  >
                    <option value="">请选择</option>
                    <option value="不吸烟">不吸烟</option>
                    <option value="偶尔吸烟">偶尔吸烟</option>
                    <option value="经常吸烟">经常吸烟</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>饮酒习惯</label>
                  <select
                    value={privateInfo.drinking}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, drinking: e.target.value })}
                  >
                    <option value="">请选择</option>
                    <option value="不喝酒">不喝酒</option>
                    <option value="偶尔小酌">偶尔小酌</option>
                    <option value="经常喝酒">经常喝酒</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>运动健身</label>
                  <input
                    type="text"
                    value={privateInfo.exercise}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, exercise: e.target.value })}
                    placeholder="如：跑步、健身、游泳、不运动"
                  />
                </div>
                <div className="form-group">
                  <label>饮食偏好</label>
                  <input
                    type="text"
                    value={privateInfo.food}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, food: e.target.value })}
                    placeholder="如：不挑食、素食主义、无辣不欢"
                  />
                </div>
                <div className="form-group">
                  <label>宠物偏好</label>
                  <input
                    type="text"
                    value={privateInfo.pets}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, pets: e.target.value })}
                    placeholder="如：养猫、养狗、喜欢但没养、不喜欢宠物"
                  />
                </div>
                <div className="form-group">
                  <label>旅行偏好</label>
                  <input
                    type="text"
                    value={privateInfo.travel}
                    onChange={(e) => setPrivateInfo({ ...privateInfo, travel: e.target.value })}
                    placeholder="如：喜欢自由行、跟团游、宅家不爱出门"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>游戏偏好</label>
                <input
                  type="text"
                  value={privateInfo.gaming}
                  onChange={(e) => setPrivateInfo({ ...privateInfo, gaming: e.target.value })}
                  placeholder="如：不玩游戏、王者荣耀、原神、Steam党、主机玩家"
                />
              </div>
              <div className="form-group">
                <label>追剧/观影偏好</label>
                <input
                  type="text"
                  value={privateInfo.tvShows}
                  onChange={(e) => setPrivateInfo({ ...privateInfo, tvShows: e.target.value })}
                  placeholder="如：不怎么看剧、喜欢看悬疑剧、日韩剧、美剧、电影"
                />
              </div>
              <div className="form-group">
                <label>音乐偏好</label>
                <input
                  type="text"
                  value={privateInfo.music}
                  onChange={(e) => setPrivateInfo({ ...privateInfo, music: e.target.value })}
                  placeholder="如：流行、摇滚、古典、说唱、民谣、什么都听"
                />
              </div>
              <div className="form-group">
                <label>阅读偏好</label>
                <input
                  type="text"
                  value={privateInfo.reading}
                  onChange={(e) => setPrivateInfo({ ...privateInfo, reading: e.target.value })}
                  placeholder="如：不怎么读书、科幻小说、历史、心理学、技术书籍"
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
          <button className="btn btn-icon" onClick={handleShowPrivateInfo} title="个人信息">📝</button>
          <button className="btn btn-icon" onClick={handleShowAddedUsers} title="已添加用户">👥</button>
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
              {myImpression?.overview_self ? (
                <ParagraphText text={myImpression.overview_self} className="impression-overview" />
              ) : myImpression?.overview ? (
                <ParagraphText text={myImpression.overview} className="impression-overview" />
              ) : (
                <p className="impression-placeholder">完成MBTI测试后将生成你的印象概览</p>
              )}
              <p className="impression-hint">🔮 MBTI人格 × 星座能量 × 八字命理 三重融合匹配！点击右上角 📝 填写生辰信息，解锁专属星座命理配对分析，看看谁是你命中注定的灵魂搭档 ✨</p>
            </div>
          </div>
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
                    <span className="match-name">
                      {match.nickname}
                      {match.mbtiType && (
                        <span className="mbti-badge mbti-badge-sm">{match.mbtiType}</span>
                      )}
                    </span>
                    <span className="match-overview">{match.overview || '暂无印象'}</span>
                    {match.matchReason && (
                      <span className="match-reason">💡 {match.matchReason}</span>
                    )}
                  </div>
                  <div className="match-card-right">
                    <div className="match-score">
                      <span className="score-value">{Math.round(match.score)}</span>
                      <span className="score-label">匹配分</span>
                    </div>
                    <button
                      className="btn btn-sm btn-added"
                      onClick={(e) => handleAddUser(match.userId, e)}
                      title="已添加（从列表中收起）"
                    >已添加</button>
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
