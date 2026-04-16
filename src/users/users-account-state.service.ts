import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserProfile, UserRestriction } from '@prisma/client';
import { SecurityLoggerService } from '../logger/security-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  buildApproximateLocation,
  buildAvatarTechnicalState,
  calculateAgeFromBirthDate,
  calculateAccountAgeDays,
  isProfileCompleted,
  normalizePhoneForOutput,
  resolveAvatarVerificationStatus,
} from './users-profile.util';
import {
  USER_RESTRICTION_TYPE,
  USER_STATUS,
  UserRestrictionType,
  UserStatus,
} from './users.constants';

const accountStateUserSelect = {
  id: true,
  email: true,
  phone: true,
  documentNumber: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  profile: {
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      timeZone: true,
      birthDate: true,
      gender: true,
      bio: true,
      city: true,
      latitude: true,
      longitude: true,
      avatarVectorStatus: true,
      avatarVectorRequestedAt: true,
      avatarVectorStartedAt: true,
      avatarVectorFinishedAt: true,
      avatarVectorRetryCount: true,
      avatarVectorLastError: true,
      avatarVectorLastErrorCode: true,
      avatarValidationStatus: true,
      avatarValidationRequestedAt: true,
      avatarValidationStartedAt: true,
      avatarValidationFinishedAt: true,
      avatarValidationRetryCount: true,
      avatarValidationLastError: true,
      avatarValidationLastErrorCode: true,
      avatarUrl: true,
      avatarStorageKey: true,
      isAvatarVerified: true,
      avatarVectorUpdatedAt: true,
      avatarVerifiedAt: true,
      lastAvatarValidationScore: true,
      lastAvatarValidationAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.UserSelect;

type AccountStateUser = Prisma.UserGetPayload<{
  select: typeof accountStateUserSelect;
}>;

type ActiveRestriction = Pick<
  UserRestriction,
  | 'id'
  | 'userId'
  | 'type'
  | 'reason'
  | 'startsAt'
  | 'endsAt'
  | 'isActive'
  | 'createdByAdminId'
  | 'createdAt'
  | 'updatedAt'
>;

type CreateAdministrativeRestrictionInput = {
  userId: string;
  type: UserRestrictionType;
  reason?: string;
  startsAt?: Date;
  endsAt?: Date | null;
  durationDays?: number;
  createdByAdminId?: string | null;
};

@Injectable()
export class UsersAccountStateService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly storageService: StorageService,
    private readonly securityLogger: SecurityLoggerService,
  ) {}

  async isUserRestricted(userId: string) {
    const accountState = await this.getUserAccountState(userId);
    return accountState.isRestricted;
  }

  async isProfileCompleted(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        phone: true,
        profile: {
          select: {
            firstName: true,
            city: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return isProfileCompleted({
      phone: user.phone,
      firstName: user.profile?.firstName,
      city: user.profile?.city,
    });
  }

  async getUserAccountState(userId: string) {
    await this.expireEndedRestrictions(userId);

    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const activeRestriction = await this.getActiveAdministrativeRestriction(userId);
    const baseStatus = this.normalizeUserStatus(user.status);
    const effectiveStatus = this.resolveEffectiveStatus(baseStatus, activeRestriction);
    const reason = this.buildAccountRestrictionReason(effectiveStatus, activeRestriction);

    return {
      userId,
      baseStatus,
      status: effectiveStatus,
      isRestricted: activeRestriction !== null,
      canAuthenticate: effectiveStatus === USER_STATUS.ACTIVE,
      canOperate: effectiveStatus === USER_STATUS.ACTIVE,
      isBlocked: effectiveStatus === USER_STATUS.BLOCKED,
      isSuspended: effectiveStatus === USER_STATUS.SUSPENDED,
      isDeleted: effectiveStatus === USER_STATUS.DELETED,
      reason,
      restriction: activeRestriction
        ? this.serializeRestriction(activeRestriction)
        : null,
    };
  }

  async getUserIdentitySnapshot(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: accountStateUserSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const accountState = await this.getUserAccountState(userId);
    const profileCompleted = isProfileCompleted({
      phone: user.phone,
      firstName: user.profile?.firstName,
      city: user.profile?.city,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: normalizePhoneForOutput(user.phone),
        documentNumber: user.documentNumber ?? null,
        status: accountState.status,
        baseStatus: accountState.baseStatus,
        accountCreatedAt: user.createdAt,
        accountAgeDays: calculateAccountAgeDays(user.createdAt),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        isRestricted: accountState.isRestricted,
        isBlocked: accountState.isBlocked,
        isSuspended: accountState.isSuspended,
        profile: user.profile ? await this.serializeProfile(user.profile) : null,
      },
      accountState,
      profileCompleted,
      mustCompleteProfile: !profileCompleted,
    };
  }

  async assertUserCanAuthenticate(userId: string) {
    const accountState = await this.getUserAccountState(userId);

    if (!accountState.canAuthenticate) {
      throw new ForbiddenException(accountState.reason);
    }

    return accountState;
  }

  async createAdministrativeRestriction(
    input: CreateAdministrativeRestrictionInput,
  ) {
    const startsAt = input.startsAt ?? new Date();
    const endsAt = this.resolveRestrictionEndsAt(
      startsAt,
      input.endsAt,
      input.durationDays,
    );

    await this.expireEndedRestrictions(input.userId);

    const [user, activeRestriction] = await Promise.all([
      this.prismaService.user.findUnique({
        where: { id: input.userId },
        select: { id: true },
      }),
      this.getActiveAdministrativeRestriction(input.userId),
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (activeRestriction) {
      throw new BadRequestException(
        'User already has an active administrative restriction',
      );
    }

    const restriction = await this.prismaService.userRestriction.create({
      data: {
        userId: input.userId,
        type: input.type,
        reason: input.reason?.trim() || null,
        startsAt,
        endsAt,
        isActive: true,
        createdByAdminId: input.createdByAdminId?.trim() || null,
      },
    });

    this.securityLogger.log('users.restriction.create', 'success', {
      actorUserId: input.createdByAdminId ?? undefined,
      targetUserId: input.userId,
      reason: input.reason,
      metadata: {
        type: input.type,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt?.toISOString() ?? null,
      },
    });

    return this.serializeRestriction(restriction);
  }

  async deactivateAdministrativeRestriction(userId: string) {
    const activeRestriction = await this.getActiveAdministrativeRestriction(userId);

    if (!activeRestriction) {
      throw new NotFoundException('No active administrative restriction found');
    }

    const restriction = await this.prismaService.userRestriction.update({
      where: { id: activeRestriction.id },
      data: {
        isActive: false,
        endsAt: activeRestriction.endsAt ?? new Date(),
      },
    });

    this.securityLogger.log('users.restriction.deactivate', 'success', {
      targetUserId: userId,
      metadata: {
        restrictionId: restriction.id,
      },
    });

    return this.serializeRestriction(restriction);
  }

  private async getActiveAdministrativeRestriction(
    userId: string,
  ): Promise<ActiveRestriction | null> {
    const now = new Date();

    return this.prismaService.userRestriction.findFirst({
      where: {
        userId,
        isActive: true,
        startsAt: {
          lte: now,
        },
        OR: [
          { endsAt: null },
          {
            endsAt: {
              gt: now,
            },
          },
        ],
      },
      orderBy: [
        {
          startsAt: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
      select: {
        id: true,
        userId: true,
        type: true,
        reason: true,
        startsAt: true,
        endsAt: true,
        isActive: true,
        createdByAdminId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  private async expireEndedRestrictions(userId: string) {
    await this.prismaService.userRestriction.updateMany({
      where: {
        userId,
        isActive: true,
        endsAt: {
          lte: new Date(),
        },
      },
      data: {
        isActive: false,
      },
    });
  }

  private normalizeUserStatus(status: string): UserStatus {
    switch (status) {
      case USER_STATUS.ACTIVE:
      case USER_STATUS.SUSPENDED:
      case USER_STATUS.BLOCKED:
      case USER_STATUS.DELETED:
        return status;
      default:
        return USER_STATUS.ACTIVE;
    }
  }

  private resolveEffectiveStatus(
    baseStatus: UserStatus,
    restriction: ActiveRestriction | null,
  ): UserStatus {
    if (baseStatus === USER_STATUS.DELETED) {
      return USER_STATUS.DELETED;
    }

    if (restriction) {
      return restriction.type === USER_RESTRICTION_TYPE.BLOCK
        ? USER_STATUS.BLOCKED
        : USER_STATUS.SUSPENDED;
    }

    return baseStatus;
  }

  private buildAccountRestrictionReason(
    effectiveStatus: UserStatus,
    restriction: ActiveRestriction | null,
  ) {
    if (effectiveStatus === USER_STATUS.BLOCKED) {
      return restriction
        ? 'User account is blocked by an administrative restriction'
        : 'User account is blocked';
    }

    if (effectiveStatus === USER_STATUS.SUSPENDED) {
      return restriction
        ? 'User account is suspended by an administrative restriction'
        : 'User account is suspended';
    }

    if (effectiveStatus === USER_STATUS.DELETED) {
      return 'User account is deleted';
    }

    return null;
  }

  private serializeRestriction(restriction: ActiveRestriction | UserRestriction) {
    return {
      id: restriction.id,
      userId: restriction.userId,
      type: restriction.type as UserRestrictionType,
      reason: restriction.reason ?? null,
      startsAt: restriction.startsAt,
      endsAt: restriction.endsAt ?? null,
      isActive: restriction.isActive,
      createdByAdminId: restriction.createdByAdminId ?? null,
      createdAt: restriction.createdAt,
      updatedAt: restriction.updatedAt,
      isIndefinite: restriction.endsAt === null,
    };
  }

  private async serializeProfile(
    profile: UserProfile | NonNullable<AccountStateUser['profile']>,
  ) {
    const avatarUrl =
      profile.avatarUrl ??
      (profile.avatarStorageKey
        ? this.storageService.createAvatarPublicUrl(profile.avatarStorageKey)
        : null);

    return {
      id: profile.id,
      userId: profile.userId,
      firstName: profile.firstName,
      lastName: profile.lastName ?? null,
      timeZone: profile.timeZone ?? null,
      birthDate: profile.birthDate ?? null,
      age: calculateAgeFromBirthDate(profile.birthDate),
      gender: profile.gender ?? null,
      bio: profile.bio ?? null,
      city: profile.city ?? null,
      latitude: profile.latitude ?? null,
      longitude: profile.longitude ?? null,
      approximateLocation: buildApproximateLocation({
        city: profile.city,
        latitude: profile.latitude,
        longitude: profile.longitude,
      }),
      avatarVectorProcessing: buildAvatarTechnicalState({
        status: profile.avatarVectorStatus,
        requestedAt: profile.avatarVectorRequestedAt,
        startedAt: profile.avatarVectorStartedAt,
        finishedAt: profile.avatarVectorFinishedAt,
        retryCount: profile.avatarVectorRetryCount,
        lastError: profile.avatarVectorLastError,
        lastErrorCode: profile.avatarVectorLastErrorCode,
      }),
      avatarValidationProcessing: buildAvatarTechnicalState({
        status: profile.avatarValidationStatus,
        requestedAt: profile.avatarValidationRequestedAt,
        startedAt: profile.avatarValidationStartedAt,
        finishedAt: profile.avatarValidationFinishedAt,
        retryCount: profile.avatarValidationRetryCount,
        lastError: profile.avatarValidationLastError,
        lastErrorCode: profile.avatarValidationLastErrorCode,
      }),
      avatarUrl,
      verificationStatus: resolveAvatarVerificationStatus({
        avatarUrl,
        isAvatarVerified: profile.isAvatarVerified,
        avatarVectorUpdatedAt: profile.avatarVectorUpdatedAt,
        lastAvatarValidationAt: profile.lastAvatarValidationAt,
      }),
      isAvatarVerified: profile.isAvatarVerified,
      avatarVectorUpdatedAt: profile.avatarVectorUpdatedAt ?? null,
      avatarVerifiedAt: profile.avatarVerifiedAt ?? null,
      lastAvatarValidationScore: profile.lastAvatarValidationScore ?? null,
      lastAvatarValidationAt: profile.lastAvatarValidationAt ?? null,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  private resolveRestrictionEndsAt(
    startsAt: Date,
    endsAt?: Date | null,
    durationDays?: number,
  ) {
    if (endsAt && durationDays !== undefined) {
      throw new BadRequestException(
        'Provide either endsAt or durationDays, but not both',
      );
    }

    if (durationDays !== undefined) {
      if (!Number.isInteger(durationDays) || durationDays <= 0) {
        throw new BadRequestException('durationDays must be a positive integer');
      }

      const calculatedEndsAt = new Date(startsAt);
      calculatedEndsAt.setDate(calculatedEndsAt.getDate() + durationDays);
      return calculatedEndsAt;
    }

    if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('endsAt must be greater than startsAt');
    }

    return endsAt ?? null;
  }
}
