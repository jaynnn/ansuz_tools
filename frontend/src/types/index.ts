export interface User {
  id: number;
  username: string;
  nickname: string;
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
}
