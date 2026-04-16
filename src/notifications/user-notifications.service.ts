import { Inject, Injectable } from '@nestjs/common';
import {
  AvatarProcessingFailedNotification,
  AvatarValidationCompletedNotification,
  UserNotificationsChannel,
} from './user-notifications.channel';

@Injectable()
export class UserNotificationsService {
  constructor(
    @Inject(UserNotificationsChannel)
    private readonly channel: UserNotificationsChannel,
  ) {}

  sendAvatarValidationCompleted(
    input: AvatarValidationCompletedNotification,
  ): Promise<void> {
    return this.channel.sendAvatarValidationCompleted(input);
  }

  sendAvatarProcessingFailed(
    input: AvatarProcessingFailedNotification,
  ): Promise<void> {
    return this.channel.sendAvatarProcessingFailed(input);
  }
}
