import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestWithAuthUser } from '../auth/interfaces/authenticated-request.interface';
import { PremiumService } from './premium.service';

@Injectable()
export class PremiumGuard implements CanActivate {
  constructor(private readonly premiumService: PremiumService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request =
      context.switchToHttp().getRequest<RequestWithAuthUser>();
    const userId = request.user?.userId;

    if (!userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    // Premium access must always be validated on the backend.
    if (!(await this.premiumService.isUserPremium(userId))) {
      throw new ForbiddenException('Premium membership is required');
    }

    return true;
  }
}
