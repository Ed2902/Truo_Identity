import {
  AVATAR_PROCESSING_STATUS,
  type AvatarProcessingStatus,
} from './avatar-processing.constants';
import type { IdentitySignals } from '../auth/interfaces/authenticated-request.interface';

const SOCIAL_PHONE_PREFIX = 'social:';
const SOCIAL_EMAIL_DOMAIN = '@social.identity.local';
export const MINIMUM_REGISTER_AGE = 18;
const APPROXIMATE_LOCATION_DECIMALS = 3;

export const buildSocialPlaceholderPhone = (
  provider: string,
  uniqueValue: string,
) => `${SOCIAL_PHONE_PREFIX}${provider}:${uniqueValue}`;

export const isPlaceholderPhone = (phone: string | null | undefined) =>
  typeof phone === 'string' && phone.startsWith(SOCIAL_PHONE_PREFIX);

export const normalizePhoneForOutput = (phone: string | null | undefined) =>
  isPlaceholderPhone(phone) ? null : phone ?? null;

export const isPlaceholderEmail = (email: string | null | undefined) =>
  typeof email === 'string' && email.endsWith(SOCIAL_EMAIL_DOMAIN);

export const buildSocialPlaceholderEmail = (
  provider: string,
  providerUserId: string,
) => `${provider}.${providerUserId}${SOCIAL_EMAIL_DOMAIN}`;

export const isProfileCompleted = (input: {
  phone: string | null | undefined;
  firstName?: string | null | undefined;
  city?: string | null | undefined;
}) =>
  Boolean(input.firstName?.trim()) &&
  Boolean(input.city?.trim()) &&
  !isPlaceholderPhone(input.phone);

export const calculateAgeFromBirthDate = (
  birthDate: Date | string | null | undefined,
  referenceDate: Date = new Date(),
) => {
  if (!birthDate) {
    return null;
  }

  const parsedBirthDate =
    birthDate instanceof Date ? birthDate : new Date(birthDate);

  if (Number.isNaN(parsedBirthDate.getTime())) {
    return null;
  }

  let age = referenceDate.getFullYear() - parsedBirthDate.getFullYear();
  const monthDifference =
    referenceDate.getMonth() - parsedBirthDate.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 &&
      referenceDate.getDate() < parsedBirthDate.getDate())
  ) {
    age -= 1;
  }

  return age;
};

export const isAdultBirthDate = (
  birthDate: Date | string | null | undefined,
  minimumAge = MINIMUM_REGISTER_AGE,
) => {
  const age = calculateAgeFromBirthDate(birthDate);

  return typeof age === 'number' && age >= minimumAge;
};

export const calculateAccountAgeDays = (
  value: Date | string | null | undefined,
  referenceDate: Date = new Date(),
) => {
  if (!value) {
    return null;
  }

  const parsedValue = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsedValue.getTime())) {
    return null;
  }

  const millisecondsDifference =
    referenceDate.getTime() - parsedValue.getTime();

  if (millisecondsDifference < 0) {
    return 0;
  }

  return Math.floor(millisecondsDifference / (1000 * 60 * 60 * 24));
};

export const normalizeApproximateCoordinate = (
  value: number | null | undefined,
  decimals = APPROXIMATE_LOCATION_DECIMALS,
) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  return Number(value.toFixed(decimals));
};

export const buildApproximateLocation = (input: {
  city?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
}) => {
  const latitude = normalizeApproximateCoordinate(input.latitude);
  const longitude = normalizeApproximateCoordinate(input.longitude);
  const city = input.city?.trim() || null;

  if (!city && latitude === null && longitude === null) {
    return null;
  }

  return {
    city,
    latitude,
    longitude,
    precision: 'approximate' as const,
    distanceReady: latitude !== null && longitude !== null,
  };
};

export const buildAvatarTechnicalState = (input: {
  status: string | null | undefined;
  requestedAt: Date | null | undefined;
  startedAt: Date | null | undefined;
  finishedAt: Date | null | undefined;
  retryCount: number | null | undefined;
  lastError: string | null | undefined;
  lastErrorCode: string | null | undefined;
}) => ({
  status: (
    [
      AVATAR_PROCESSING_STATUS.IDLE,
      AVATAR_PROCESSING_STATUS.QUEUED,
      AVATAR_PROCESSING_STATUS.PROCESSING,
      AVATAR_PROCESSING_STATUS.RETRYING,
      AVATAR_PROCESSING_STATUS.COMPLETED,
      AVATAR_PROCESSING_STATUS.FAILED,
    ] as string[]
  ).includes(input.status ?? '')
    ? (input.status as AvatarProcessingStatus)
    : AVATAR_PROCESSING_STATUS.IDLE,
  requestedAt: input.requestedAt ?? null,
  startedAt: input.startedAt ?? null,
  finishedAt: input.finishedAt ?? null,
  retryCount: input.retryCount ?? 0,
  lastError: input.lastError ?? null,
  lastErrorCode: input.lastErrorCode ?? null,
});

export const buildIdentitySignals = (input: {
  isPremium: boolean;
  verificationStatus:
    | 'missing_avatar'
    | 'pending_vectorization'
    | 'ready_for_validation'
    | 'verified'
    | 'rejected';
  avatarVerifiedAt: Date | null;
  accountCreatedAt: Date;
  accountAgeDays: number | null;
  approximateLocation: IdentitySignals['approximateLocation'];
  city: string | null;
}): IdentitySignals => ({
  isPremium: input.isPremium,
  verificationStatus: input.verificationStatus,
  avatarVerifiedAt: input.avatarVerifiedAt,
  accountCreatedAt: input.accountCreatedAt,
  accountAgeDays: input.accountAgeDays,
  approximateLocation: input.approximateLocation,
  city: input.city,
  // Identity keeps the contract slot, but Catalog will own the future data.
  reputationSummary: null,
});

export const resolveAvatarVerificationStatus = (input: {
  avatarUrl?: string | null | undefined;
  isAvatarVerified?: boolean | null | undefined;
  avatarVectorUpdatedAt?: Date | null | undefined;
  lastAvatarValidationAt?: Date | null | undefined;
}) => {
  if (!input.avatarUrl) {
    return 'missing_avatar' as const;
  }

  if (input.isAvatarVerified) {
    return 'verified' as const;
  }

  if (!input.avatarVectorUpdatedAt) {
    return 'pending_vectorization' as const;
  }

  if (!input.lastAvatarValidationAt) {
    return 'ready_for_validation' as const;
  }

  return 'rejected' as const;
};

export const calculateDistanceInKilometers = (
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
) => {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const haversineValue =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(fromLatitude)) *
      Math.cos(toRadians(toLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  const angularDistance =
    2 * Math.atan2(Math.sqrt(haversineValue), Math.sqrt(1 - haversineValue));

  return earthRadiusKm * angularDistance;
};
