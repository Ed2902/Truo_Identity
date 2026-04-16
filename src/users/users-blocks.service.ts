import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SecurityLoggerService } from '../logger/security-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhoneForOutput } from './users-profile.util';
import { BlockUserDto } from './dto/block-user.dto';
import { UnblockUserDto } from './dto/unblock-user.dto';

const userBlockSelect = {
  id: true,
  userId: true,
  blockedUserId: true,
  reason: true,
  createdAt: true,
} satisfies Prisma.UserBlockSelect;

const blockedUsersSelect = {
  id: true,
  blockedUserId: true,
  reason: true,
  createdAt: true,
  blockedUser: {
    select: {
      id: true,
      email: true,
      phone: true,
      status: true,
      profile: {
        select: {
          firstName: true,
          lastName: true,
          avatarUrl: true,
          avatarStorageKey: true,
          isAvatarVerified: true,
        },
      },
    },
  },
} satisfies Prisma.UserBlockSelect;

@Injectable()
export class UsersBlocksService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly securityLogger: SecurityLoggerService,
  ) {}

  async getBlockedUsers(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Authenticated user not found');
    }

    const blockedUsers = await this.prismaService.userBlock.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: blockedUsersSelect,
    });

    return {
      blockedUsers: blockedUsers.map((block) => ({
        ...block,
        blockedUser: {
          ...block.blockedUser,
          phone: normalizePhoneForOutput(block.blockedUser.phone),
        },
      })),
      total: blockedUsers.length,
    };
  }

  async blockUser(userId: string, blockUserDto: BlockUserDto) {
    const { blockedUserId } = blockUserDto;
    const reason = blockUserDto.reason?.trim() || null;

    if (userId === blockedUserId) {
      this.securityLogger.log('users.block', 'denied', {
        actorUserId: userId,
        targetUserId: blockedUserId,
        reason: 'self_block_not_allowed',
      });
      throw new BadRequestException('You cannot block yourself');
    }

    const [user, blockedUser, existingBlock] = await Promise.all([
      this.prismaService.user.findUnique({
        where: { id: userId },
        select: { id: true },
      }),
      this.prismaService.user.findUnique({
        where: { id: blockedUserId },
        select: { id: true },
      }),
      this.prismaService.userBlock.findUnique({
        where: {
          userId_blockedUserId: {
            userId,
            blockedUserId,
          },
        },
        select: { id: true },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('Authenticated user not found');
    }

    if (!blockedUser) {
      this.securityLogger.log('users.block', 'failure', {
        actorUserId: userId,
        targetUserId: blockedUserId,
        reason: 'blocked_user_not_found',
      });
      throw new NotFoundException('Blocked user not found');
    }

    if (existingBlock) {
      this.securityLogger.log('users.block', 'denied', {
        actorUserId: userId,
        targetUserId: blockedUserId,
        reason: 'duplicate_block',
      });
      throw new ConflictException('User is already blocked');
    }

    try {
      const block = await this.prismaService.userBlock.create({
        data: {
          userId,
          blockedUserId,
          reason,
        },
        select: userBlockSelect,
      });

      this.securityLogger.log('users.block', 'success', {
        actorUserId: userId,
        targetUserId: blockedUserId,
        reason: reason ?? undefined,
      });

      return {
        success: true,
        message: 'User blocked successfully',
        block,
      };
    } catch (error) {
      if (this.isDuplicateBlockError(error)) {
        this.securityLogger.log('users.block', 'denied', {
          actorUserId: userId,
          targetUserId: blockedUserId,
          reason: 'duplicate_block_constraint',
        });
        throw new ConflictException('User is already blocked');
      }

      throw error;
    }
  }

  async unblockUser(userId: string, unblockUserDto: UnblockUserDto) {
    const block = await this.prismaService.userBlock.findUnique({
      where: {
        userId_blockedUserId: {
          userId,
          blockedUserId: unblockUserDto.blockedUserId,
        },
      },
      select: userBlockSelect,
    });

    if (!block) {
      this.securityLogger.log('users.unblock', 'failure', {
        actorUserId: userId,
        targetUserId: unblockUserDto.blockedUserId,
        reason: 'block_relationship_not_found',
      });
      throw new NotFoundException('Block relationship not found');
    }

    await this.prismaService.userBlock.delete({
      where: {
        userId_blockedUserId: {
          userId,
          blockedUserId: unblockUserDto.blockedUserId,
        },
      },
    });

    this.securityLogger.log('users.unblock', 'success', {
      actorUserId: userId,
      targetUserId: unblockUserDto.blockedUserId,
    });

    return {
      success: true,
      message: 'User unblocked successfully',
      unblockedUserId: unblockUserDto.blockedUserId,
    };
  }

  private isDuplicateBlockError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
