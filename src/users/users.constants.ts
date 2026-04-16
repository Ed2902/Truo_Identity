export const USER_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  BLOCKED: 'blocked',
  DELETED: 'deleted',
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export const USER_RESTRICTION_TYPE = {
  SUSPENSION: 'suspension',
  BLOCK: 'block',
} as const;

export type UserRestrictionType =
  (typeof USER_RESTRICTION_TYPE)[keyof typeof USER_RESTRICTION_TYPE];
