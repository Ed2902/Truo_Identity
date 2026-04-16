import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SecurityLoggerService } from '../logger/security-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersBlocksService } from './users-blocks.service';

describe('UsersBlocksService', () => {
  let service: UsersBlocksService;
  let prismaService: {
    user: {
      findUnique: jest.Mock;
    };
    userBlock: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
  };
  let securityLoggerService: {
    log: jest.Mock;
  };

  beforeEach(async () => {
    prismaService = {
      user: {
        findUnique: jest.fn(),
      },
      userBlock: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };
    securityLoggerService = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersBlocksService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: SecurityLoggerService,
          useValue: securityLoggerService,
        },
      ],
    }).compile();

    service = module.get<UsersBlocksService>(UsersBlocksService);
  });

  it('rejects self blocking', async () => {
    await expect(
      service.blockUser('user-1', {
        blockedUserId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists blocked users for the authenticated user', async () => {
    prismaService.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prismaService.userBlock.findMany.mockResolvedValue([
      {
        id: 'block-1',
        blockedUserId: 'user-2',
        reason: 'spam',
        createdAt: new Date('2026-04-14T12:00:00.000Z'),
        blockedUser: {
          id: 'user-2',
          email: 'blocked@example.com',
          phone: '+573001112233',
          status: 'active',
          profile: {
            firstName: 'Ana',
            lastName: 'Perez',
            avatarUrl: null,
            avatarStorageKey: null,
            isAvatarVerified: false,
          },
        },
      },
    ]);

    await expect(service.getBlockedUsers('user-1')).resolves.toMatchObject({
      total: 1,
      blockedUsers: [
        {
          id: 'block-1',
          blockedUserId: 'user-2',
          reason: 'spam',
          blockedUser: {
            id: 'user-2',
            email: 'blocked@example.com',
          },
        },
      ],
    });
  });

  it('rejects duplicate blocks', async () => {
    prismaService.user.findUnique
      .mockResolvedValueOnce({ id: 'user-1' })
      .mockResolvedValueOnce({ id: 'user-2' });
    prismaService.userBlock.findUnique.mockResolvedValue({ id: 'block-1' });

    await expect(
      service.blockUser('user-1', {
        blockedUserId: 'user-2',
        reason: 'spam',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a block successfully', async () => {
    prismaService.user.findUnique
      .mockResolvedValueOnce({ id: 'user-1' })
      .mockResolvedValueOnce({ id: 'user-2' });
    prismaService.userBlock.findUnique.mockResolvedValue(null);
    prismaService.userBlock.create.mockResolvedValue({
      id: 'block-1',
      userId: 'user-1',
      blockedUserId: 'user-2',
      reason: 'spam',
      createdAt: new Date('2026-04-14T12:00:00.000Z'),
    });

    await expect(
      service.blockUser('user-1', {
        blockedUserId: 'user-2',
        reason: '  spam  ',
      }),
    ).resolves.toMatchObject({
      success: true,
      message: 'User blocked successfully',
      block: {
        id: 'block-1',
        userId: 'user-1',
        blockedUserId: 'user-2',
        reason: 'spam',
      },
    });
  });

  it('rejects unblock when the relationship does not exist', async () => {
    prismaService.userBlock.findUnique.mockResolvedValue(null);

    await expect(
      service.unblockUser('user-1', {
        blockedUserId: 'user-2',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects listing blocked users when the authenticated user does not exist', async () => {
    prismaService.user.findUnique.mockResolvedValue(null);

    await expect(service.getBlockedUsers('user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
