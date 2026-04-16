import { Injectable } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import {
  AvatarProcessingFailedNotification,
  AvatarValidationCompletedNotification,
  UserNotificationsChannel,
} from './user-notifications.channel';

@Injectable()
export class EmailUserNotificationsChannel extends UserNotificationsChannel {
  constructor(private readonly emailService: EmailService) {
    super();
  }

  sendAvatarValidationCompleted(
    input: AvatarValidationCompletedNotification,
  ): Promise<void> {
    return this.emailService.sendAvatarValidationCompleted(input);
  }

  sendAvatarProcessingFailed(
    input: AvatarProcessingFailedNotification,
  ): Promise<void> {
    return this.emailService.sendAvatarProcessingFailed(input);
  }
}
