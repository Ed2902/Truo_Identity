import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { EmailUserNotificationsChannel } from './email-user-notifications.channel';
import { UserNotificationsChannel } from './user-notifications.channel';
import { UserNotificationsService } from './user-notifications.service';

@Module({
  imports: [EmailModule],
  providers: [
    UserNotificationsService,
    {
      provide: UserNotificationsChannel,
      useClass: EmailUserNotificationsChannel,
    },
  ],
  exports: [UserNotificationsService],
})
export class NotificationsModule {}
