export interface User {
  id: number;
  username: string;
  nickname: string;
  avatar?: string;
}

export interface Tool {
  id: number;
  user_id: number;
  name: string;
  description: string;
  tags: string[];
  url?: string;
  created_at?: string;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, nickname?: string) => Promise<void>;
  logout: () => void;
  updateNickname: (nickname: string) => Promise<void>;
  updateAvatar: (avatar: string) => Promise<void>;
}

export interface UserImpression {
  dimensions: Record<string, string>;
  overview: string | null;
  overview_self: string | null;
  updated_at: string | null;
}

export interface MatchedUser {
  userId: number;
  nickname: string;
  avatar: string;
  score: number;
  overview: string | null;
  matchDimensions: {
    scores?: Record<string, number>;
    total?: number;
    summary?: string;
  };
  updatedAt: string;
}

export interface UserProfile {
  user: {
    id: number;
    nickname: string;
    avatar: string;
  };
  overview: string | null;
  contact: string | null;
}

export interface Notification {
  id: number;
  from_user_id: number;
  is_read: number;
  created_at: string;
  nickname: string;
  avatar: string;
}

export interface PrivateInfoAppearance {
  height?: string;
  weight?: string;
  skin?: string;
  bodyType?: string;
  faceShape?: string;
  other?: string;
}

export interface PrivateInfoContact {
  wechat?: string;
  qq?: string;
  phone?: string;
  email?: string;
  other?: string;
}

export interface PrivateInfoExtra {
  location?: string;
  hobbies?: string;
  items: Array<{ field: string; detail: string }>;
}

export interface PrivateInfo {
  appearance: string;
  contact: string;
  extra: string;
}

// Structured version for frontend use
export interface StructuredPrivateInfo {
  appearance: PrivateInfoAppearance;
  contact: PrivateInfoContact;
  location: string;
  hobbies: string;
  extraItems: Array<{ field: string; detail: string }>;
}
