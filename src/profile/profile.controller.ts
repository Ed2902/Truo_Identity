import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentAuthUser } from '../auth/decorators/current-auth-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequestUser } from '../auth/interfaces/authenticated-request.interface';
import { SensitiveRateLimit } from '../common/decorators/sensitive-rate-limit.decorator';
import { UserAccountAccessGuard } from '../users/guards/user-account-access.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  getMe(@CurrentAuthUser() authUser: AuthenticatedRequestUser) {
    return this.profileService.getMe(authUser.userId);
  }

  @Patch('me')
  @SensitiveRateLimit()
  @UseGuards(UserAccountAccessGuard)
  updateMe(
    @CurrentAuthUser() authUser: AuthenticatedRequestUser,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.profileService.updateMe(authUser.userId, updateProfileDto);
  }
}
