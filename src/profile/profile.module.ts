import { Module } from '@nestjs/common';
import { PremiumModule } from '../premium/premium.module';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { PublicProfileController } from './public-profile.controller';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { UsersProfileController } from './users-profile.controller';

@Module({
  imports: [StorageModule, UsersModule, PremiumModule],
  controllers: [
    ProfileController,
    UsersProfileController,
    PublicProfileController,
  ],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
