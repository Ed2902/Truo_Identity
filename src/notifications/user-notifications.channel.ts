export type AvatarValidationCompletedNotification = {
  email: string;
  isVerified: boolean;
  score?: number | null;
};

export type AvatarProcessingFailedNotification = {
  email: string;
  stage: 'vector' | 'validation';
  reason?: string | null;
};

export abstract class UserNotificationsChannel {
  abstract sendAvatarValidationCompleted(
    input: AvatarValidationCompletedNotification,
  ): Promise<void>;

  abstract sendAvatarProcessingFailed(
    input: AvatarProcessingFailedNotification,
  ): Promise<void>;
}
