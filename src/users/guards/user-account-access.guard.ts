import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestWithAuthUser } from '../../auth/interfaces/authenticated-request.interface';
import { UsersAccountStateService } from '../users-account-state.service';

@Injectable()
export class UserAccountAccessGuard implements CanActivate {
  constructor(
    private readonly usersAccountStateService: UsersAccountStateService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request =
      context.switchToHttp().getRequest<RequestWithAuthUser>();
    const userId = request.user?.userId;

    if (!userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    const accountState =
      await this.usersAccountStateService.getUserAccountState(userId);

    if (!accountState.canOperate) {
      throw new ForbiddenException(accountState.reason);
    }

    return true;
  }
}
