import { Request } from 'express';

export type IdentityReputationSummary = null;

export interface AuthenticatedUserProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string | null;
  timeZone: string | null;
  birthDate: Date | null;
  age: number | null;
  gender: string | null;
  bio: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  approximateLocation: {
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    precision: 'approximate';
    distanceReady: boolean;
  } | null;
  avatarVectorProcessing: {
    status:
      | 'idle'
      | 'queued'
      | 'processing'
      | 'retrying'
      | 'completed'
      | 'failed';
    requestedAt: Date | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    retryCount: number;
    lastError: string | null;
    lastErrorCode: string | null;
  };
  avatarValidationProcessing: {
    status:
      | 'idle'
      | 'queued'
      | 'processing'
      | 'retrying'
      | 'completed'
      | 'failed';
    requestedAt: Date | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    retryCount: number;
    lastError: string | null;
    lastErrorCode: string | null;
  };
  avatarUrl: string | null;
  verificationStatus:
    | 'missing_avatar'
    | 'pending_vectorization'
    | 'ready_for_validation'
    | 'verified'
    | 'rejected';
  isAvatarVerified: boolean;
  avatarVectorUpdatedAt: Date | null;
  avatarVerifiedAt: Date | null;
  lastAvatarValidationScore: number | null;
  lastAvatarValidationAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  phone: string | null;
  documentNumber: string | null;
  status: string;
  accountCreatedAt: Date;
  accountAgeDays: number | null;
  createdAt: Date;
  updatedAt: Date;
  profile: AuthenticatedUserProfile | null;
}

export interface IdentitySignals {
  isPremium: boolean;
  verificationStatus: AuthenticatedUserProfile['verificationStatus'];
  avatarVerifiedAt: Date | null;
  accountCreatedAt: Date;
  accountAgeDays: number | null;
  approximateLocation: AuthenticatedUserProfile['approximateLocation'];
  city: string | null;
  // Future reputation will be sourced from Catalog once completed trades exist.
  reputationSummary: IdentityReputationSummary;
}

export interface AuthenticatedRequestUser {
  userId: string;
  sessionId: string;
  email?: string;
  tokenType: 'access' | 'refresh';
  refreshToken?: string;
}

export interface RequestWithValidatedUser extends Request {
  user: AuthenticatedUser;
}

export interface RequestWithAuthUser extends Request {
  user: AuthenticatedRequestUser;
}
