import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ProfileService } from './profile.service';

@Controller('users')
export class PublicProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get(':userId/public-profile')
  getPublicProfile(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.profileService.getPublicProfile(userId);
  }
}
