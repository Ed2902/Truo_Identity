import { IsEnum, IsOptional } from 'class-validator';
import {
  PremiumBillingCycle,
  PremiumSource,
} from '../premium.constants';

export class ActivatePremiumDto {
  @IsEnum(PremiumBillingCycle)
  billingCycle!: PremiumBillingCycle;

  @IsOptional()
  @IsEnum(PremiumSource)
  source?: PremiumSource;
}
