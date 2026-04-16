import {
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentAuthUser } from '../auth/decorators/current-auth-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequestUser } from '../auth/interfaces/authenticated-request.interface';
import { SensitiveRateLimit } from '../common/decorators/sensitive-rate-limit.decorator';
import { UserAccountAccessGuard } from '../users/guards/user-account-access.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  getMe(@CurrentAuthUser() authUser: AuthenticatedRequestUser) {
    return this.profileService.getMe(authUser.userId);
  }

  @Put('profile')
  @SensitiveRateLimit()
  @UseGuards(UserAccountAccessGuard)
  updateProfile(
    @CurrentAuthUser() authUser: AuthenticatedRequestUser,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.profileService.updateMe(authUser.userId, updateProfileDto);
  }
}
