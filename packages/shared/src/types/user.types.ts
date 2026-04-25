import type { UserRole, UserStatus } from './enums';
import type { Address } from './api.types';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone?: string;
  cpf?: string;
  avatar?: string;
  role: UserRole;
  status: UserStatus;
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TechnicianProfile extends UserProfile {
  crea?: string;          // Registro CREA
  specialties: string[];  // Ex.: hidráulica, elétrica, civil
  rating?: number;        // 0-5
  totalServices?: number;
  availableForCall: boolean;
  currentLocation?: { latitude: number; longitude: number };
}

export interface OwnerProfile extends UserProfile {
  properties: string[]; // IDs das propriedades
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginPayload {
  email: string;
  password: string;
  totpCode?: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  phone: string;
  cpf: string;
  role: UserRole;
  address?: Address;
}

export interface JwtPayload {
  sub: string;       // userId
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
  jti: string;       // JWT ID para revogação
}
