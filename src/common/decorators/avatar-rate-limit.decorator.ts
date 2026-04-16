import { Throttle } from '@nestjs/throttler';

export const AvatarRateLimit = () =>
  Throttle({
    avatar: {},
  });
