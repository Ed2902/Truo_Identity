import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentAuthUser } from '../auth/decorators/current-auth-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequestUser } from '../auth/interfaces/authenticated-request.interface';
import { SensitiveRateLimit } from '../common/decorators/sensitive-rate-limit.decorator';
import { UserAccountAccessGuard } from '../users/guards/user-account-access.guard';
import { ActivatePremiumDto } from './dto/activate-premium.dto';
import { PremiumService } from './premium.service';

@Controller('users/premium')
@UseGuards(JwtAuthGuard, UserAccountAccessGuard)
export class PremiumController {
  constructor(private readonly premiumService: PremiumService) {}

  @Post('activate')
  @SensitiveRateLimit()
  activatePremium(
    @CurrentAuthUser() authUser: AuthenticatedRequestUser,
    @Body() activatePremiumDto: ActivatePremiumDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.premiumService.activatePremium(
      authUser.userId,
      activatePremiumDto,
      idempotencyKey,
    );
  }

  @Get('me')
  getMyPremiumState(@CurrentAuthUser() authUser: AuthenticatedRequestUser) {
    return this.premiumService.buildPremiumState(authUser.userId);
  }

  @Get('history')
  getPremiumHistory(@CurrentAuthUser() authUser: AuthenticatedRequestUser) {
    return this.premiumService.getPremiumHistory(authUser.userId);
  }

  @Post('cancel')
  @SensitiveRateLimit()
  cancelActivePremium(@CurrentAuthUser() authUser: AuthenticatedRequestUser) {
    return this.premiumService.cancelActivePremium(authUser.userId);
  }
}
