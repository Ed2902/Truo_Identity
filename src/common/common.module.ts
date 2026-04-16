import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { ResponseTimeInterceptor } from './interceptors/response-time.interceptor';
import { ThrottlerBehindProxyGuard } from './guards/throttler-behind-proxy.guard';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: configService.getOrThrow<number>('rateLimit.ttl'),
            limit: configService.getOrThrow<number>('rateLimit.limit'),
          },
          {
            name: 'sensitive',
            ttl: configService.getOrThrow<number>('rateLimit.sensitiveTtl'),
            limit: configService.getOrThrow<number>('rateLimit.sensitiveLimit'),
          },
          {
            name: 'avatar',
            ttl: configService.getOrThrow<number>('rateLimit.avatarTtl'),
            limit: configService.getOrThrow<number>('rateLimit.avatarLimit'),
          },
        ],
      }),
    }),
  ],
  providers: [
    GlobalExceptionFilter,
    ResponseTimeInterceptor,
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
  ],
  exports: [GlobalExceptionFilter, ResponseTimeInterceptor, ThrottlerModule],
})
export class CommonModule {}
