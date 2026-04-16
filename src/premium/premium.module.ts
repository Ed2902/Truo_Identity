import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { PremiumController } from './premium.controller';
import { PremiumGuard } from './premium.guard';
import { PremiumService } from './premium.service';

@Module({
  imports: [UsersModule],
  controllers: [PremiumController],
  providers: [PremiumService, PremiumGuard],
  exports: [PremiumService, PremiumGuard],
})
export class PremiumModule {}
