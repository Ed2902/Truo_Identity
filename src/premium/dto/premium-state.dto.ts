import {
  FREE_MEMBERSHIP_TYPE,
  PREMIUM_MEMBERSHIP_TYPE,
  PremiumBillingCycle,
  PremiumSource,
  PremiumStatus,
} from '../premium.constants';

export class PremiumStateDto {
  membershipType!: typeof FREE_MEMBERSHIP_TYPE | typeof PREMIUM_MEMBERSHIP_TYPE;
  isPremium!: boolean;
  billingCycle!: PremiumBillingCycle | null;
  status!: PremiumStatus | null;
  startsAt!: string | null;
  endsAt!: string | null;
  startsAtUtc!: string | null;
  endsAtUtc!: string | null;
  source!: PremiumSource | null;
  timeZone!: string;
  showAds!: boolean;
  premiumFeaturesEnabled!: boolean;
}
