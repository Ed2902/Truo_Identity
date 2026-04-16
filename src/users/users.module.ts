import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { AvatarProcessingProcessor } from './avatar-processing.processor';
import { AvatarVerificationController } from './avatar-verification.controller';
import { AvatarVerificationService } from './avatar-verification.service';
import { UserAccountAccessGuard } from './guards/user-account-access.guard';
import { UsersAccountStateService } from './users-account-state.service';
import { UsersAvatarController } from './users-avatar.controller';
import { UsersAvatarService } from './users-avatar.service';
import { UsersBlocksController } from './users-blocks.controller';
import { UsersBlocksService } from './users-blocks.service';

@Module({
  imports: [PrismaModule, StorageModule, NotificationsModule],
  controllers: [
    UsersAvatarController,
    UsersBlocksController,
    AvatarVerificationController,
  ],
  providers: [
    AvatarProcessingProcessor,
    AvatarVerificationService,
    UsersAvatarService,
    UsersBlocksService,
    UsersAccountStateService,
    UserAccountAccessGuard,
  ],
  exports: [
    AvatarVerificationService,
    UsersAccountStateService,
    UserAccountAccessGuard,
  ],
})
export class UsersModule {}
