export const PREMIUM_MEMBERSHIP_TYPE = 'premium' as const;
export const FREE_MEMBERSHIP_TYPE = 'free' as const;

export enum PremiumBillingCycle {
  MONTHLY = 'monthly',
  SEMIANNUAL = 'semiannual',
  ANNUAL = 'annual',
}

export enum PremiumStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum PremiumSource {
  MANUAL = 'manual',
  PAYMENT = 'payment',
  PROMO = 'promo',
  TRIAL = 'trial',
}

export const ACTIVE_PREMIUM_CONFLICT_POLICY =
  'reject_existing_active_membership' as const;

export const ACTIVE_PREMIUM_CONFLICT_MESSAGE =
  'User already has an active premium membership. Cancel or wait for it to expire before activating a new one.';

export const PREMIUM_IDEMPOTENCY_KEY_MAX_LENGTH = 255;
