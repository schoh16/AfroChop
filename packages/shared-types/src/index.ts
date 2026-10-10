export type UserRole = 'customer' | 'chef' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AuthPayload {
  user: AuthUser;
  token: string;
}
