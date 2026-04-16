import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

function createPrismaClientOptions(connectionString: string) {
  const schema = new URL(connectionString).searchParams.get('schema') ?? undefined;
  const adapter = schema
    ? new PrismaPg({ connectionString }, { schema })
    : new PrismaPg({ connectionString });

  return { adapter };
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    super(
      createPrismaClientOptions(
        configService.getOrThrow<string>('database.url'),
      ),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
