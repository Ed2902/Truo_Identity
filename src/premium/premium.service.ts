import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { formatDateForTimeZone, isValidIanaTimeZone } from '../common/utils/time-zone.util';
import { SecurityLoggerService } from '../logger/security-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivatePremiumDto } from './dto/activate-premium.dto';
import { PremiumStateDto } from './dto/premium-state.dto';
import {
  ACTIVE_PREMIUM_CONFLICT_MESSAGE,
  ACTIVE_PREMIUM_CONFLICT_POLICY,
  FREE_MEMBERSHIP_TYPE,
  PREMIUM_IDEMPOTENCY_KEY_MAX_LENGTH,
  PREMIUM_MEMBERSHIP_TYPE,
  PremiumBillingCycle,
  PremiumSource,
  PremiumStatus,
} from './premium.constants';

const premiumMembershipSelect = {
  id: true,
  userId: true,
  membershipType: true,
  billingCycle: true,
  status: true,
  startsAt: true,
  endsAt: true,
  source: true,
  idempotencyKey: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserPremiumSelect;

type PremiumMembershipRecord = Prisma.UserPremiumGetPayload<{
  select: typeof premiumMembershipSelect;
}>;

type PremiumFeatureState = Pick<
  PremiumStateDto,
  'isPremium' | 'showAds' | 'premiumFeaturesEnabled'
>;

type PremiumUserContext = {
  userId: string;
  timeZone: string;
};

@Injectable()
export class PremiumService {
  private readonly defaultTimeZone: string;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly securityLogger: SecurityLoggerService,
    configService: ConfigService,
  ) {
    this.defaultTimeZone = configService.getOrThrow<string>('app.timeZone');
  }

  async activatePremium(
    userId: string,
    activatePremiumDto: ActivatePremiumDto,
    idempotencyKeyHeader?: string,
  ) {
    const userContext = await this.getUserContext(userId);
    const idempotencyKey = this.normalizeIdempotencyKey(idempotencyKeyHeader);
    const now = new Date();
    const startsAt = now;
    const endsAt = this.calculateEndsAt(startsAt, activatePremiumDto.billingCycle);

    try {
      const result = await this.prismaService.$transaction(async (tx) => {
        await this.expireStaleMemberships(tx, userId, now);

        if (idempotencyKey) {
          const existingMembership = await tx.userPremium.findUnique({
            where: {
              userId_idempotencyKey: {
                userId,
                idempotencyKey,
              },
            },
            select: premiumMembershipSelect,
          });

          if (existingMembership) {
            return {
              membership: existingMembership,
              replayed: true,
            };
          }
        }

        // Chosen policy: reject new activations while a valid premium membership is still active.
        const activeMembership = await tx.userPremium.findFirst({
          where: {
            userId,
            status: PremiumStatus.ACTIVE,
            startsAt: { lte: now },
            endsAt: { gt: now },
          },
          orderBy: { createdAt: 'desc' },
          select: premiumMembershipSelect,
        });

        if (activeMembership) {
          this.securityLogger.log('users.premium.activate', 'denied', {
            actorUserId: userId,
            reason: 'active_membership_already_exists',
          });
          throw new ConflictException(ACTIVE_PREMIUM_CONFLICT_MESSAGE);
        }

        const membership = await tx.userPremium.create({
          data: {
            userId,
            membershipType: PREMIUM_MEMBERSHIP_TYPE,
            billingCycle: activatePremiumDto.billingCycle,
            status: PremiumStatus.ACTIVE,
            startsAt,
            endsAt,
            source: activatePremiumDto.source ?? PremiumSource.MANUAL,
            idempotencyKey,
          },
          select: premiumMembershipSelect,
        });

        return {
          membership,
          replayed: false,
        };
      });

      this.securityLogger.log('users.premium.activate', 'success', {
        actorUserId: userId,
        reason: result.replayed ? 'idempotent_replay' : undefined,
        metadata: {
          billingCycle: activatePremiumDto.billingCycle,
          source: activatePremiumDto.source ?? PremiumSource.MANUAL,
          idempotencyKey,
          replayed: result.replayed,
        },
      });

      return {
        success: true,
        message: result.replayed
          ? 'Premium activation request already processed'
          : 'Premium membership activated successfully',
        policy: ACTIVE_PREMIUM_CONFLICT_POLICY,
        idempotency: {
          key: idempotencyKey,
          replayed: result.replayed,
        },
        premium: this.serializeMembership(result.membership, userContext.timeZone),
        premiumState: this.buildPremiumStateFromMembership(
          result.membership,
          userContext.timeZone,
        ),
      };
    } catch (error) {
      if (this.isSingleActiveMembershipConstraintError(error)) {
        throw new ConflictException(ACTIVE_PREMIUM_CONFLICT_MESSAGE);
      }

      if (this.isIdempotencyConstraintError(error) && idempotencyKey) {
        const existingMembership = await this.prismaService.userPremium.findUnique({
          where: {
            userId_idempotencyKey: {
              userId,
              idempotencyKey,
            },
          },
          select: premiumMembershipSelect,
        });

        if (existingMembership) {
          this.securityLogger.log('users.premium.activate', 'success', {
            actorUserId: userId,
            reason: 'idempotent_replay_after_constraint',
            metadata: {
              idempotencyKey,
              replayed: true,
            },
          });
          return {
            success: true,
            message: 'Premium activation request already processed',
            policy: ACTIVE_PREMIUM_CONFLICT_POLICY,
            idempotency: {
              key: idempotencyKey,
              replayed: true,
            },
            premium: this.serializeMembership(
              existingMembership,
              userContext.timeZone,
            ),
            premiumState: this.buildPremiumStateFromMembership(
              existingMembership,
              userContext.timeZone,
            ),
          };
        }
      }

      throw error;
    }
  }

  async buildPremiumState(userId: string): Promise<PremiumStateDto> {
    const userContext = await this.getUserContext(userId);
    const activeMembership = await this.getActivePremium(userId);

    return this.buildPremiumStateFromMembership(
      activeMembership,
      userContext.timeZone,
    );
  }

  async getPremiumHistory(userId: string) {
    const userContext = await this.getUserContext(userId);
    await this.expireStaleMemberships(this.prismaService, userId, new Date());

    const history = await this.prismaService.userPremium.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: premiumMembershipSelect,
    });

    return {
      timeZone: userContext.timeZone,
      history: history.map((membership) =>
        this.serializeMembership(membership, userContext.timeZone),
      ),
      total: history.length,
    };
  }

  async cancelActivePremium(userId: string) {
    const userContext = await this.getUserContext(userId);
    const now = new Date();

    const cancelledMembership = await this.prismaService.$transaction(async (tx) => {
      await this.expireStaleMemberships(tx, userId, now);

      const activeMembership = await tx.userPremium.findFirst({
        where: {
          userId,
          status: PremiumStatus.ACTIVE,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        orderBy: { createdAt: 'desc' },
        select: premiumMembershipSelect,
      });

      if (!activeMembership) {
        this.securityLogger.log('users.premium.cancel', 'failure', {
          actorUserId: userId,
          reason: 'no_active_membership',
        });
        throw new NotFoundException('No active premium membership found');
      }

      return tx.userPremium.update({
        where: { id: activeMembership.id },
        data: {
          status: PremiumStatus.CANCELLED,
          endsAt: now < activeMembership.endsAt ? now : activeMembership.endsAt,
        },
        select: premiumMembershipSelect,
      });
    });

    this.securityLogger.log('users.premium.cancel', 'success', {
      actorUserId: userId,
      metadata: {
        premiumId: cancelledMembership.id,
      },
    });

    return {
      success: true,
      message: 'Premium membership cancelled successfully',
      premium: this.serializeMembership(cancelledMembership, userContext.timeZone),
      premiumState: this.buildPremiumStateFromMembership(null, userContext.timeZone),
    };
  }

  async isUserPremium(userId: string): Promise<boolean> {
    const activeMembership = await this.getActivePremium(userId);

    return activeMembership !== null;
  }

  async getActivePremium(
    userId: string,
  ): Promise<PremiumMembershipRecord | null> {
    const now = new Date();

    await this.expireStaleMemberships(this.prismaService, userId, now);

    return this.prismaService.userPremium.findFirst({
      where: {
        userId,
        membershipType: PREMIUM_MEMBERSHIP_TYPE,
        status: PremiumStatus.ACTIVE,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      select: premiumMembershipSelect,
    });
  }

  async getUserPremiumFeatures(userId: string): Promise<PremiumFeatureState> {
    const activeMembership = await this.getActivePremium(userId);

    return this.buildFeatureState(activeMembership);
  }

  private buildPremiumStateFromMembership(
    membership: PremiumMembershipRecord | null,
    timeZone: string,
  ): PremiumStateDto {
    const featureState = this.buildFeatureState(membership);

    return {
      membershipType: membership ? PREMIUM_MEMBERSHIP_TYPE : FREE_MEMBERSHIP_TYPE,
      isPremium: featureState.isPremium,
      billingCycle: membership?.billingCycle as PremiumBillingCycle | null,
      status: membership?.status as PremiumStatus | null,
      startsAt: membership ? formatDateForTimeZone(membership.startsAt, timeZone) : null,
      endsAt: membership ? formatDateForTimeZone(membership.endsAt, timeZone) : null,
      startsAtUtc: membership?.startsAt.toISOString() ?? null,
      endsAtUtc: membership?.endsAt.toISOString() ?? null,
      source: (membership?.source as PremiumSource | null) ?? null,
      timeZone,
      showAds: featureState.showAds,
      premiumFeaturesEnabled: featureState.premiumFeaturesEnabled,
    };
  }

  private buildFeatureState(
    membership: PremiumMembershipRecord | null,
  ): PremiumFeatureState {
    const isPremium = membership !== null;

    return {
      isPremium,
      showAds: !isPremium,
      premiumFeaturesEnabled: isPremium,
    };
  }

  private serializeMembership(
    membership: PremiumMembershipRecord,
    timeZone: string,
  ) {
    return {
      id: membership.id,
      userId: membership.userId,
      membershipType: membership.membershipType as typeof PREMIUM_MEMBERSHIP_TYPE,
      billingCycle: membership.billingCycle as PremiumBillingCycle,
      status: membership.status as PremiumStatus,
      startsAt: formatDateForTimeZone(membership.startsAt, timeZone),
      endsAt: formatDateForTimeZone(membership.endsAt, timeZone),
      startsAtUtc: membership.startsAt.toISOString(),
      endsAtUtc: membership.endsAt.toISOString(),
      source: (membership.source as PremiumSource | null) ?? null,
      idempotencyKey: membership.idempotencyKey ?? null,
      timeZone,
      createdAt: formatDateForTimeZone(membership.createdAt, timeZone),
      updatedAt: formatDateForTimeZone(membership.updatedAt, timeZone),
      createdAtUtc: membership.createdAt.toISOString(),
      updatedAtUtc: membership.updatedAt.toISOString(),
    };
  }

  private calculateEndsAt(startsAt: Date, billingCycle: PremiumBillingCycle) {
    const endsAt = new Date(startsAt);

    switch (billingCycle) {
      case PremiumBillingCycle.MONTHLY:
        endsAt.setMonth(endsAt.getMonth() + 1);
        break;
      case PremiumBillingCycle.SEMIANNUAL:
        endsAt.setMonth(endsAt.getMonth() + 6);
        break;
      case PremiumBillingCycle.ANNUAL:
        endsAt.setFullYear(endsAt.getFullYear() + 1);
        break;
    }

    return endsAt;
  }

  private normalizeIdempotencyKey(idempotencyKey?: string) {
    const normalizedIdempotencyKey = idempotencyKey?.trim();

    if (!normalizedIdempotencyKey) {
      return null;
    }

    if (normalizedIdempotencyKey.length > PREMIUM_IDEMPOTENCY_KEY_MAX_LENGTH) {
      throw new BadRequestException('Idempotency-Key is too long');
    }

    return normalizedIdempotencyKey;
  }

  private async getUserContext(userId: string): Promise<PremiumUserContext> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        profile: {
          select: {
            timeZone: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Authenticated user not found');
    }

    const userTimeZone =
      user.profile?.timeZone && isValidIanaTimeZone(user.profile.timeZone)
        ? user.profile.timeZone
        : this.defaultTimeZone;

    return {
      userId: user.id,
      timeZone: userTimeZone,
    };
  }

  private async expireStaleMemberships(
    prisma: PrismaService | Prisma.TransactionClient,
    userId: string,
    referenceDate: Date,
  ) {
    await prisma.userPremium.updateMany({
      where: {
        userId,
        status: PremiumStatus.ACTIVE,
        endsAt: { lte: referenceDate },
      },
      data: {
        status: PremiumStatus.EXPIRED,
      },
    });
  }

  private isSingleActiveMembershipConstraintError(error: unknown): boolean {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    return (
      'meta' in error &&
      typeof error.meta === 'object' &&
      error.meta !== null &&
      'target' in error.meta &&
      Array.isArray(error.meta.target) &&
      error.meta.target.includes('userId') &&
      !error.meta.target.includes('idempotencyKey')
    );
  }

  private isIdempotencyConstraintError(error: unknown): boolean {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    return (
      'meta' in error &&
      typeof error.meta === 'object' &&
      error.meta !== null &&
      'target' in error.meta &&
      Array.isArray(error.meta.target) &&
      error.meta.target.includes('idempotencyKey')
    );
  }
}
