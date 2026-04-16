import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserProfile } from '@prisma/client';
import { PremiumService } from '../premium/premium.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { isValidIanaTimeZone } from '../common/utils/time-zone.util';
import { UsersAccountStateService } from '../users/users-account-state.service';
import {
  buildApproximateLocation,
  buildAvatarTechnicalState,
  buildIdentitySignals,
  calculateAgeFromBirthDate,
  isAdultBirthDate,
  normalizePhoneForOutput,
  normalizeApproximateCoordinate,
  resolveAvatarVerificationStatus,
} from '../users/users-profile.util';
import { UpdateProfileDto } from './dto/update-profile.dto';

const profileSelect = {
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

type ProfileUser = Prisma.UserGetPayload<{ select: typeof profileSelect }>;

@Injectable()
export class ProfileService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly storageService: StorageService,
    private readonly usersAccountStateService: UsersAccountStateService,
    private readonly premiumService: PremiumService,
  ) {}

  async getMe(userId: string) {
    return this.buildIdentityResponse(userId);
  }

  async getPublicProfile(userId: string) {
    const identitySnapshot =
      await this.usersAccountStateService.getUserIdentitySnapshot(userId);
    const premiumState = await this.premiumService.buildPremiumState(userId);

    if (
      identitySnapshot.accountState.isDeleted ||
      !identitySnapshot.user.profile
    ) {
      throw new NotFoundException('Public profile not found');
    }

    const profile = identitySnapshot.user.profile;
    const profileAvatarSource = await this.prismaService.userProfile.findUnique(
      {
        where: { userId },
        select: {
          avatarStorageKey: true,
        },
      },
    );
    let avatarUrl = profile.avatarUrl;

    if (profileAvatarSource?.avatarStorageKey) {
      try {
        avatarUrl = await this.storageService.createAvatarViewUrl(
          profileAvatarSource.avatarStorageKey,
        );
      } catch {
        avatarUrl = profile.avatarUrl;
      }
    }

    const displayName = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return {
      user: {
        id: identitySnapshot.user.id,
        status: identitySnapshot.user.status,
        accountCreatedAt: identitySnapshot.user.accountCreatedAt,
        accountAgeDays: identitySnapshot.user.accountAgeDays,
      },
      premium: premiumState,
      profile: {
        id: profile.id,
        userId: profile.userId,
        displayName: displayName || 'Usuario Truo',
        firstName: profile.firstName,
        lastName: profile.lastName,
        bio: profile.bio,
        city: profile.city,
        approximateLocation: profile.approximateLocation,
        avatarUrl,
        verificationStatus: profile.verificationStatus,
        isAvatarVerified: profile.isAvatarVerified,
        avatarVerifiedAt: profile.avatarVerifiedAt,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
    };
  }

  async updateMe(userId: string, updateProfileDto: UpdateProfileDto) {
    if (
      updateProfileDto.timeZone !== undefined &&
      updateProfileDto.timeZone.trim().length > 0 &&
      !isValidIanaTimeZone(updateProfileDto.timeZone.trim())
    ) {
      throw new BadRequestException('Invalid IANA time zone');
    }

    this.assertCoordinatePair(
      updateProfileDto.latitude,
      updateProfileDto.longitude,
    );

    if (updateProfileDto.birthDate !== undefined) {
      const birthDate = new Date(updateProfileDto.birthDate);

      if (Number.isNaN(birthDate.getTime())) {
        throw new BadRequestException('Birth date is invalid');
      }

      if (!isAdultBirthDate(birthDate)) {
        throw new BadRequestException('Users must be at least 18 years old');
      }
    }

    if (
      updateProfileDto.city !== undefined &&
      updateProfileDto.city.trim().length === 0
    ) {
      throw new BadRequestException('City is required');
    }

    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        documentNumber: true,
        profile: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!user || !user.profile) {
      throw new BadRequestException('Profile not found');
    }

    if (
      updateProfileDto.phone !== undefined &&
      updateProfileDto.phone.trim() !== user.phone
    ) {
      const existingUserByPhone = await this.prismaService.user.findFirst({
        where: {
          phone: updateProfileDto.phone.trim(),
          id: {
            not: userId,
          },
        },
        select: {
          id: true,
        },
      });

      if (existingUserByPhone) {
        throw new BadRequestException('Phone is already registered');
      }
    }

    if (
      updateProfileDto.documentNumber !== undefined &&
      (updateProfileDto.documentNumber.trim() || null) !==
        (user.documentNumber ?? null)
    ) {
      const normalizedDocumentNumber =
        updateProfileDto.documentNumber.trim() || null;

      if (normalizedDocumentNumber) {
        const existingUserByDocumentNumber =
          await this.prismaService.user.findFirst({
            where: {
              documentNumber: normalizedDocumentNumber,
              id: {
                not: userId,
              },
            },
            select: {
              id: true,
            },
          });

        if (existingUserByDocumentNumber) {
          throw new BadRequestException(
            'Document number is already registered',
          );
        }
      }
    }

    await this.prismaService.user.update({
      where: { id: userId },
      data: {
        ...(updateProfileDto.phone !== undefined && {
          phone: updateProfileDto.phone.trim(),
        }),
        ...(updateProfileDto.documentNumber !== undefined && {
          documentNumber: updateProfileDto.documentNumber.trim() || null,
        }),
        profile: {
          update: {
            ...(updateProfileDto.firstName !== undefined && {
              firstName: updateProfileDto.firstName.trim(),
            }),
            ...(updateProfileDto.lastName !== undefined && {
              lastName: updateProfileDto.lastName?.trim() || null,
            }),
            ...(updateProfileDto.timeZone !== undefined && {
              timeZone: updateProfileDto.timeZone?.trim() || null,
            }),
            ...(updateProfileDto.birthDate !== undefined && {
              birthDate: updateProfileDto.birthDate
                ? new Date(updateProfileDto.birthDate)
                : null,
            }),
            ...(updateProfileDto.gender !== undefined && {
              gender: updateProfileDto.gender?.trim() || null,
            }),
            ...(updateProfileDto.bio !== undefined && {
              bio: updateProfileDto.bio?.trim() || null,
            }),
            ...(updateProfileDto.city !== undefined && {
              city: updateProfileDto.city.trim(),
            }),
            ...(updateProfileDto.latitude !== undefined &&
              updateProfileDto.longitude !== undefined && {
                latitude: normalizeApproximateCoordinate(
                  updateProfileDto.latitude,
                ),
                longitude: normalizeApproximateCoordinate(
                  updateProfileDto.longitude,
                ),
              }),
          },
        },
      },
    });

    return this.buildIdentityResponse(userId);
  }

  private async buildIdentityResponse(userId: string) {
    const [identitySnapshot, premiumState] = await Promise.all([
      this.usersAccountStateService.getUserIdentitySnapshot(userId),
      this.premiumService.buildPremiumState(userId),
    ]);

    return {
      ...identitySnapshot,
      premium: premiumState,
      signals: buildIdentitySignals({
        isPremium: premiumState.isPremium,
        verificationStatus:
          identitySnapshot.user.profile?.verificationStatus ?? 'missing_avatar',
        avatarVerifiedAt:
          identitySnapshot.user.profile?.avatarVerifiedAt ?? null,
        accountCreatedAt: identitySnapshot.user.accountCreatedAt,
        accountAgeDays: identitySnapshot.user.accountAgeDays,
        approximateLocation:
          identitySnapshot.user.profile?.approximateLocation ?? null,
        city: identitySnapshot.user.profile?.city ?? null,
      }),
    };
  }

  private async serializeUser(user: ProfileUser) {
    return {
      id: user.id,
      email: user.email,
      phone: normalizePhoneForOutput(user.phone),
      documentNumber: user.documentNumber ?? null,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profile: user.profile ? await this.serializeProfile(user.profile) : null,
    };
  }

  private async serializeProfile(
    profile: UserProfile | NonNullable<ProfileUser['profile']>,
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

  private assertCoordinatePair(latitude?: number, longitude?: number) {
    const hasLatitude = latitude !== undefined;
    const hasLongitude = longitude !== undefined;

    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException(
        'Latitude and longitude must be provided together',
      );
    }
  }
}
