export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RefreshInput {
  refreshToken: string;
}

export interface UserRecord {
  email: string;
  name: string;
  password_hash: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  failedLoginCount: number;
  lockoutUntil?: string;
}

export interface RefreshTokenRecord {
  tokenId: string;
  userEmail: string;
  expiresAt: number;
}
