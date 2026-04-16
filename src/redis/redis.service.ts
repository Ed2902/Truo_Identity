import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(REDIS) private readonly client: Redis,
    private readonly configService: ConfigService,
  ) {}

  getClient(): Redis {
    return this.client;
  }

  async onModuleInit(): Promise<void> {
    try {
      if (this.client.status === 'wait') {
        await this.client.connect();
      }

      await this.client.ping();
    } catch (error) {
      this.client.disconnect();

      const redisUrl = this.configService.getOrThrow<string>('redis.url');
      const message =
        error instanceof Error ? error.message : 'Unknown Redis connection error';

      throw new Error(
        `Redis is unavailable at ${redisUrl}. ${message}`,
      );
    }
  }

  async ping(): Promise<string> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }

    return this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }

    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
