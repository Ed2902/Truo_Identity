import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(request: Record<string, any>): Promise<string> {
    const authenticatedUserId =
      request.user?.userId ??
      request.user?.id ??
      request.authUser?.userId ??
      null;

    if (typeof authenticatedUserId === 'string' && authenticatedUserId.trim()) {
      return `user:${authenticatedUserId}`;
    }

    const forwardedFor = request.headers?.['x-forwarded-for'];

    if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
      return forwardedFor.split(',')[0].trim();
    }

    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0];
    }

    return (
      request.ip ??
      request.ips?.[0] ??
      request.socket?.remoteAddress ??
      'unknown'
    );
  }
}
