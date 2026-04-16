import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly queueService: QueueService,
    private readonly storageService: StorageService,
  ) {}

  getLiveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkQueue(),
      this.checkStorage(),
    ]);

    const [database, redis, queue, storage] = checks;
    const readiness = {
      status: checks.every((check) => check.status === 'fulfilled')
        ? 'ok'
        : 'error',
      timestamp: new Date().toISOString(),
      checks: {
        database:
          database.status === 'fulfilled'
            ? database.value
            : { status: 'error', message: this.getErrorMessage(database.reason) },
        redis:
          redis.status === 'fulfilled'
            ? redis.value
            : { status: 'error', message: this.getErrorMessage(redis.reason) },
        queue:
          queue.status === 'fulfilled'
            ? queue.value
            : { status: 'error', message: this.getErrorMessage(queue.reason) },
        storage:
          storage.status === 'fulfilled'
            ? storage.value
            : { status: 'error', message: this.getErrorMessage(storage.reason) },
      },
    };

    if (readiness.status === 'error') {
      throw new ServiceUnavailableException(readiness);
    }

    return readiness;
  }

  private async checkDatabase() {
    await this.prismaService.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
    };
  }

  private async checkRedis() {
    await this.redisService.ping();

    return {
      status: 'ok',
    };
  }

  private async checkQueue() {
    await this.queueService.ping();

    return {
      status: 'ok',
    };
  }

  private async checkStorage() {
    return this.storageService.checkHealth();
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown error';
  }
}
