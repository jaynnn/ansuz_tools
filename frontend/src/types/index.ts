export interface User {
  id: string;
  username: string;
  nickname: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Tool {
  _id: string;
  name: string;
  description: string;
  tags: string[];
  icon?: string;
  userId: string;
  createdAt: string;
}
