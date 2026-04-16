import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserProfile, UserSession } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import ms from 'ms';
import { randomUUID } from 'crypto';
import { EmailService } from '../email/email.service';
import { SecurityLoggerService } from '../logger/security-logger.service';
import { PremiumService } from '../premium/premium.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersAccountStateService } from '../users/users-account-state.service';
import {
  buildApproximateLocation,
  buildAvatarTechnicalState,
  buildIdentitySignals,
  calculateAgeFromBirthDate,
  calculateAccountAgeDays,
  isAdultBirthDate,
  normalizePhoneForOutput,
  normalizeApproximateCoordinate,
  resolveAvatarVerificationStatus,
} from '../users/users-profile.util';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import {
  AuthenticatedRequestUser,
  AuthenticatedUser,
  AuthenticatedUserProfile,
} from './interfaces/authenticated-request.interface';
import {
  JwtAccessTokenPayload,
  JwtRefreshTokenPayload,
} from './interfaces/jwt-payload.interface';

const publicProfileSelect = {
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
  isAvatarVerified: true,
  avatarVectorUpdatedAt: true,
  avatarVerifiedAt: true,
  lastAvatarValidationScore: true,
  lastAvatarValidationAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserProfileSelect;

const publicUserSelect = {
  id: true,
  email: true,
  phone: true,
  documentNumber: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  profile: {
    select: publicProfileSelect,
  },
} satisfies Prisma.UserSelect;

const loginUserSelect = {
  id: true,
  email: true,
  phone: true,
  documentNumber: true,
  password: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  profile: {
    select: publicProfileSelect,
  },
} satisfies Prisma.UserSelect;

const sessionSelect = {
  id: true,
  userId: true,
  deviceId: true,
  deviceName: true,
  ipAddress: true,
  userAgent: true,
  expiresAt: true,
  lastUsedAt: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSessionSelect;

const sessionWithSecretSelect = {
  id: true,
  userId: true,
  deviceId: true,
  deviceName: true,
  ipAddress: true,
  userAgent: true,
  expiresAt: true,
  lastUsedAt: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  refreshTokenHash: true,
  user: {
    select: publicUserSelect,
  },
} satisfies Prisma.UserSessionSelect;

type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
type LoginUser = Prisma.UserGetPayload<{ select: typeof loginUserSelect }>;
type PublicSession = Prisma.UserSessionGetPayload<{ select: typeof sessionSelect }>;
type SessionWithSecret = Prisma.UserSessionGetPayload<{
  select: typeof sessionWithSecretSelect;
}>;

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class AuthService {
  private readonly accessTokenSecret: string;
  private readonly accessTokenTtl: string;
  private readonly refreshTokenSecret: string;
  private readonly refreshTokenTtl: string;
  private readonly bcryptSaltRounds: number;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly securityLogger: SecurityLoggerService,
    private readonly premiumService: PremiumService,
    private readonly usersAccountStateService: UsersAccountStateService,
    configService: ConfigService,
  ) {
    this.accessTokenSecret =
      configService.getOrThrow<string>('auth.accessTokenSecret');
    this.accessTokenTtl = configService.getOrThrow<string>('auth.accessTokenTtl');
    this.refreshTokenSecret =
      configService.getOrThrow<string>('auth.refreshTokenSecret');
    this.refreshTokenTtl =
      configService.getOrThrow<string>('auth.refreshTokenTtl');
    this.bcryptSaltRounds = configService.getOrThrow<number>(
      'auth.bcryptSaltRounds',
    );
  }

  async register(
    registerDto: RegisterDto,
    requestContext: RequestContext,
  ) {
    const email = this.normalizeEmail(registerDto.email);
    const phone = this.normalizePhone(registerDto.phone);
    const documentNumber = this.normalizeDocumentNumber(registerDto.documentNumber);
    const birthDate = this.parseBirthDate(registerDto.birthDate);
    const city = registerDto.city.trim();

    this.assertAdultBirthDate(birthDate);
    this.assertCoordinatePair(registerDto.latitude, registerDto.longitude);

    if (!city) {
      throw new BadRequestException('City is required');
    }

    const existingUser = await this.prismaService.user.findFirst({
      where: {
        OR: [
          { email },
          { phone },
          ...(documentNumber ? [{ documentNumber }] : []),
        ],
      },
      select: {
        email: true,
        phone: true,
        documentNumber: true,
      },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        this.securityLogger.log('auth.register', 'denied', {
          email,
          ipAddress: requestContext.ipAddress,
          userAgent: requestContext.userAgent,
          reason: 'email_already_registered',
        });
        throw new ConflictException('Email is already registered');
      }

      if (existingUser.phone === phone) {
        this.securityLogger.log('auth.register', 'denied', {
          email,
          ipAddress: requestContext.ipAddress,
          userAgent: requestContext.userAgent,
          reason: 'phone_already_registered',
        });
        throw new ConflictException('Phone is already registered');
      }

      if (documentNumber && existingUser.documentNumber === documentNumber) {
        this.securityLogger.log('auth.register', 'denied', {
          email,
          ipAddress: requestContext.ipAddress,
          userAgent: requestContext.userAgent,
          reason: 'document_number_already_registered',
        });
        throw new ConflictException('Document number is already registered');
      }

      throw new ConflictException('Phone is already registered');
    }

    const passwordHash = await this.hashValue(registerDto.password);
    const currentTimestamp = new Date();
    const refreshTokenExpiresAt = this.createRefreshTokenExpiryDate();
    const placeholderRefreshTokenHash = await this.hashValue(randomUUID());

    const { user, session } = await this.prismaService.$transaction(
      async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email,
            phone,
            documentNumber,
            password: passwordHash,
            profile: {
              create: {
                firstName: registerDto.firstName.trim(),
                lastName: registerDto.lastName?.trim() || null,
                birthDate,
                city,
                ...(registerDto.latitude !== undefined &&
                  registerDto.longitude !== undefined && {
                    latitude: normalizeApproximateCoordinate(
                      registerDto.latitude,
                    ),
                    longitude: normalizeApproximateCoordinate(
                      registerDto.longitude,
                    ),
                  }),
              },
            },
          },
          select: publicUserSelect,
        });

        const createdSession = await tx.userSession.create({
          data: {
            userId: createdUser.id,
            deviceId: registerDto.deviceId,
            deviceName: registerDto.deviceName,
            refreshTokenHash: placeholderRefreshTokenHash,
            ipAddress: requestContext.ipAddress,
            userAgent: requestContext.userAgent,
            expiresAt: refreshTokenExpiresAt,
            lastUsedAt: currentTimestamp,
            isActive: true,
          },
          select: sessionSelect,
        });

        return {
          user: createdUser,
          session: createdSession,
        };
      },
    );

    const sanitizedUser = this.serializeUser(user);
    const tokens = await this.issueTokenPair(sanitizedUser, session.id);
    const refreshTokenHash = await this.hashValue(tokens.refreshToken);
    const updatedSession = await this.prismaService.userSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash,
        expiresAt: tokens.refreshTokenExpiresAt,
        lastUsedAt: currentTimestamp,
        ipAddress: requestContext.ipAddress,
        userAgent: requestContext.userAgent,
        deviceName: registerDto.deviceName,
      },
      select: sessionSelect,
    });

    this.securityLogger.log('auth.register', 'success', {
      actorUserId: sanitizedUser.id,
      actorSessionId: updatedSession.id,
      email,
      ipAddress: requestContext.ipAddress,
      userAgent: requestContext.userAgent,
      metadata: {
        deviceId: registerDto.deviceId,
        deviceName: registerDto.deviceName ?? null,
      },
    });

    return this.buildAuthResponse(sanitizedUser, updatedSession, tokens);
  }

  async validateUser(
    email: string,
    password: string,
  ): Promise<AuthenticatedUser> {
    const normalizedEmail = this.normalizeEmail(email);
    const user = await this.prismaService.user.findUnique({
      where: { email: normalizedEmail },
      select: loginUserSelect,
    });

    if (!user) {
      this.securityLogger.log('auth.login', 'failure', {
        email: normalizedEmail,
        reason: 'invalid_credentials',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'active') {
      this.securityLogger.log('auth.login', 'denied', {
        actorUserId: user.id,
        email: user.email,
        reason: 'inactive_account',
      });
      throw new ForbiddenException('User account is not active');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      this.securityLogger.log('auth.login', 'failure', {
        actorUserId: user.id,
        email: user.email,
        reason: 'invalid_credentials',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const accountState =
      await this.usersAccountStateService.getUserAccountState(user.id);

    if (!accountState.canAuthenticate) {
      this.securityLogger.log('auth.login', 'denied', {
        actorUserId: user.id,
        email: user.email,
        reason: accountState.reason ?? 'account_not_operable',
      });
      throw new ForbiddenException(accountState.reason);
    }

    return {
      id: user.id,
      email: user.email,
      phone: normalizePhoneForOutput(user.phone),
      documentNumber: user.documentNumber ?? null,
      status: user.status,
      accountCreatedAt: user.createdAt,
      accountAgeDays: calculateAccountAgeDays(user.createdAt),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profile: user.profile ? this.serializeProfile(user.profile) : null,
    };
  }

  async login(
    user: AuthenticatedUser,
    loginDto: LoginDto,
    requestContext: RequestContext,
  ) {
    return this.createAuthenticatedSession(user, {
      deviceId: loginDto.deviceId,
      deviceName: loginDto.deviceName,
      ...requestContext,
    });
  }

  async createAuthenticatedSession(
    user: AuthenticatedUser,
    input: {
      deviceId: string;
      deviceName?: string;
      ipAddress?: string;
      userAgent?: string;
    },
  ) {
    const currentTimestamp = new Date();
    const refreshTokenExpiresAt = this.createRefreshTokenExpiryDate();
    const placeholderRefreshTokenHash = await this.hashValue(randomUUID());

    const session = await this.prismaService.$transaction(async (tx) => {
      await tx.userSession.updateMany({
        where: {
          userId: user.id,
          isActive: true,
        },
        data: {
          isActive: false,
          updatedAt: currentTimestamp,
        },
      });

      return tx.userSession.create({
        data: {
          userId: user.id,
          deviceId: input.deviceId,
          deviceName: input.deviceName,
          refreshTokenHash: placeholderRefreshTokenHash,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          expiresAt: refreshTokenExpiresAt,
          lastUsedAt: currentTimestamp,
          isActive: true,
        },
        select: sessionSelect,
      });
    });

    const tokens = await this.issueTokenPair(user, session.id);
    const refreshTokenHash = await this.hashValue(tokens.refreshToken);

    const updatedSession = await this.prismaService.userSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash,
        expiresAt: tokens.refreshTokenExpiresAt,
        lastUsedAt: currentTimestamp,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        deviceName: input.deviceName,
      },
      select: sessionSelect,
    });

    this.securityLogger.log('auth.session.create', 'success', {
      actorUserId: user.id,
      actorSessionId: updatedSession.id,
      email: user.email,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: {
        deviceId: input.deviceId,
        deviceName: input.deviceName ?? null,
      },
    });

    return this.buildAuthResponse(user, updatedSession, tokens);
  }

  async refresh(
    authUser: AuthenticatedRequestUser,
    refreshDto: RefreshDto,
    requestContext: RequestContext,
  ) {
    if (!authUser.refreshToken || authUser.tokenType !== 'refresh') {
      this.securityLogger.log('auth.refresh', 'failure', {
        actorUserId: authUser.userId,
        actorSessionId: authUser.sessionId,
        ipAddress: requestContext.ipAddress,
        userAgent: requestContext.userAgent,
        reason: 'invalid_refresh_token_payload',
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prismaService.userSession.findFirst({
      where: {
        id: authUser.sessionId,
        userId: authUser.userId,
      },
      select: sessionWithSecretSelect,
    });

    if (!session || !session.isActive) {
      this.securityLogger.log('auth.refresh', 'denied', {
        actorUserId: authUser.userId,
        actorSessionId: authUser.sessionId,
        ipAddress: requestContext.ipAddress,
        userAgent: requestContext.userAgent,
        reason: 'inactive_session',
      });
      throw new UnauthorizedException('Session is no longer active');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      this.securityLogger.log('auth.refresh', 'denied', {
        actorUserId: authUser.userId,
        actorSessionId: authUser.sessionId,
        ipAddress: requestContext.ipAddress,
        userAgent: requestContext.userAgent,
        reason: 'refresh_token_expired',
      });
      throw new UnauthorizedException('Refresh token expired');
    }

    const isRefreshTokenValid = await bcrypt.compare(
      authUser.refreshToken,
      session.refreshTokenHash,
    );

    if (!isRefreshTokenValid) {
      this.securityLogger.log('auth.refresh', 'failure', {
        actorUserId: authUser.userId,
        actorSessionId: authUser.sessionId,
        ipAddress: requestContext.ipAddress,
        userAgent: requestContext.userAgent,
        reason: 'refresh_token_hash_mismatch',
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.user.status !== 'active') {
      this.securityLogger.log('auth.refresh', 'denied', {
        actorUserId: authUser.userId,
        actorSessionId: authUser.sessionId,
        reason: 'inactive_account',
      });
      throw new ForbiddenException('User account is not active');
    }

    const accountState =
      await this.usersAccountStateService.getUserAccountState(session.user.id);

    if (!accountState.canAuthenticate) {
      this.securityLogger.log('auth.refresh', 'denied', {
        actorUserId: authUser.userId,
        actorSessionId: authUser.sessionId,
        reason: accountState.reason ?? 'account_not_operable',
      });
      throw new ForbiddenException(accountState.reason);
    }

    const sanitizedUser = this.serializeUser(session.user);
    const tokens = await this.issueTokenPair(sanitizedUser, session.id);
    const refreshTokenHash = await this.hashValue(tokens.refreshToken);

    const updatedSession = await this.prismaService.userSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash,
        expiresAt: tokens.refreshTokenExpiresAt,
        lastUsedAt: new Date(),
        ipAddress: requestContext.ipAddress,
        userAgent: requestContext.userAgent,
        deviceName: refreshDto.deviceName ?? session.deviceName,
      },
      select: sessionSelect,
    });

    this.securityLogger.log('auth.refresh', 'success', {
      actorUserId: sanitizedUser.id,
      actorSessionId: updatedSession.id,
      ipAddress: requestContext.ipAddress,
      userAgent: requestContext.userAgent,
      metadata: {
        deviceName: refreshDto.deviceName ?? session.deviceName ?? null,
      },
    });

    return this.buildAuthResponse(sanitizedUser, updatedSession, tokens);
  }

  async logout(authUser: AuthenticatedRequestUser) {
    if (authUser.tokenType !== 'access') {
      throw new UnauthorizedException('Invalid access token');
    }

    await this.prismaService.userSession.updateMany({
      where: {
        id: authUser.sessionId,
        userId: authUser.userId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    this.securityLogger.log('auth.logout', 'success', {
      actorUserId: authUser.userId,
      actorSessionId: authUser.sessionId,
    });
  }

  async changePassword(
    authUser: AuthenticatedRequestUser,
    changePasswordDto: ChangePasswordDto,
  ) {
    if (authUser.tokenType !== 'access') {
      throw new UnauthorizedException('Invalid access token');
    }

    const user = await this.prismaService.user.findUnique({
      where: { id: authUser.userId },
      select: {
        id: true,
        email: true,
        password: true,
      },
    });

    if (!user) {
      this.securityLogger.log('auth.change_password', 'failure', {
        actorUserId: authUser.userId,
        actorSessionId: authUser.sessionId,
        reason: 'user_not_found',
      });
      throw new UnauthorizedException('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      this.securityLogger.log('auth.change_password', 'failure', {
        actorUserId: authUser.userId,
        actorSessionId: authUser.sessionId,
        email: user.email,
        reason: 'invalid_current_password',
      });
      throw new UnauthorizedException('Current password is incorrect');
    }

    const isSamePassword = await bcrypt.compare(
      changePasswordDto.newPassword,
      user.password,
    );

    if (isSamePassword) {
      this.securityLogger.log('auth.change_password', 'denied', {
        actorUserId: authUser.userId,
        actorSessionId: authUser.sessionId,
        email: user.email,
        reason: 'new_password_matches_current_password',
      });
      throw new ConflictException(
        'New password must be different from the current password',
      );
    }

    const passwordHash = await this.hashValue(changePasswordDto.newPassword);
    const now = new Date();

    await this.prismaService.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          password: passwordHash,
        },
      });

      await tx.userSession.updateMany({
        where: {
          userId: user.id,
          isActive: true,
        },
        data: {
          isActive: false,
          updatedAt: now,
        },
      });
    });

    await this.emailService.sendPasswordChangedConfirmation({
      email: user.email,
      changedAt: now,
    });

    this.securityLogger.log('auth.change_password', 'success', {
      actorUserId: authUser.userId,
      actorSessionId: authUser.sessionId,
      email: user.email,
    });

    return {
      success: true,
      message: 'Password changed successfully',
    };
  }

  private async issueTokenPair(user: AuthenticatedUser, sessionId: string) {
    const accessTokenPayload: JwtAccessTokenPayload = {
      sub: user.id,
      sid: sessionId,
      email: user.email,
      typ: 'access',
    };
    const refreshTokenPayload: JwtRefreshTokenPayload = {
      sub: user.id,
      sid: sessionId,
      typ: 'refresh',
    };
    const refreshTokenExpiresAt = this.createRefreshTokenExpiryDate();

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessTokenPayload, {
        secret: this.accessTokenSecret,
        expiresIn: this.getTokenExpirySeconds(this.accessTokenTtl),
      }),
      this.jwtService.signAsync(refreshTokenPayload, {
        secret: this.refreshTokenSecret,
        expiresIn: this.getTokenExpirySeconds(this.refreshTokenTtl),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  async buildAuthResponse(
    user: AuthenticatedUser,
    session: PublicSession,
    tokens: {
      accessToken: string;
      refreshToken: string;
      refreshTokenExpiresAt: Date;
    },
  ) {
    const [profileCompleted, premiumState] = await Promise.all([
      this.usersAccountStateService.isProfileCompleted(user.id),
      this.premiumService.buildPremiumState(user.id),
    ]);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.serializeUser(user),
      session: this.serializeSession(session),
      premium: premiumState,
      signals: buildIdentitySignals({
        isPremium: premiumState.isPremium,
        verificationStatus: user.profile?.verificationStatus ?? 'missing_avatar',
        avatarVerifiedAt: user.profile?.avatarVerifiedAt ?? null,
        accountCreatedAt: user.accountCreatedAt,
        accountAgeDays: user.accountAgeDays,
        approximateLocation: user.profile?.approximateLocation ?? null,
        city: user.profile?.city ?? null,
      }),
      profileCompleted,
      mustCompleteProfile: !profileCompleted,
    };
  }

  toAuthenticatedUser(user: PublicUser | AuthenticatedUser): AuthenticatedUser {
    return this.serializeUser(user);
  }

  private serializeUser(user: PublicUser | AuthenticatedUser): AuthenticatedUser {
    const accountCreatedAt =
      'accountCreatedAt' in user ? user.accountCreatedAt : user.createdAt;
    const accountAgeDays =
      'accountAgeDays' in user
        ? user.accountAgeDays
        : calculateAccountAgeDays(user.createdAt);

    return {
      id: user.id,
      email: user.email,
      phone: normalizePhoneForOutput(user.phone),
      documentNumber: user.documentNumber ?? null,
      status: user.status,
      accountCreatedAt,
      accountAgeDays,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profile: user.profile
        ? 'avatarVectorProcessing' in user.profile
          ? user.profile
          : this.serializeProfile(user.profile)
        : null,
    };
  }

  private serializeProfile(
    profile: UserProfile | NonNullable<PublicUser['profile']>,
  ): AuthenticatedUserProfile {
    return {
      id: profile.id,
      userId: profile.userId,
      firstName: profile.firstName ?? '',
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
      avatarUrl: profile.avatarUrl ?? null,
      verificationStatus: resolveAvatarVerificationStatus({
        avatarUrl: profile.avatarUrl,
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

  private serializeSession(session: PublicSession | SessionWithSecret) {
    return {
      id: session.id,
      userId: session.userId,
      deviceId: session.deviceId,
      deviceName: session.deviceName ?? null,
      ipAddress: session.ipAddress ?? null,
      userAgent: session.userAgent ?? null,
      expiresAt: session.expiresAt,
      lastUsedAt: session.lastUsedAt ?? null,
      isActive: session.isActive,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private async hashValue(value: string): Promise<string> {
    return bcrypt.hash(value, this.bcryptSaltRounds);
  }

  private createRefreshTokenExpiryDate(): Date {
    const refreshTtlMs = ms(this.refreshTokenTtl as ms.StringValue);

    if (typeof refreshTtlMs !== 'number') {
      throw new Error('Invalid refresh token TTL configuration');
    }

    return new Date(Date.now() + refreshTtlMs);
  }

  private getTokenExpirySeconds(ttl: string): number {
    const ttlMs = ms(ttl as ms.StringValue);

    if (typeof ttlMs !== 'number') {
      throw new Error('Invalid JWT TTL configuration');
    }

    return Math.floor(ttlMs / 1000);
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizePhone(phone: string): string {
    return phone.trim();
  }

  private normalizeDocumentNumber(documentNumber?: string): string | null {
    const normalizedValue = documentNumber?.trim();
    return normalizedValue ? normalizedValue : null;
  }

  private parseBirthDate(birthDate: string) {
    const parsedBirthDate = new Date(birthDate);

    if (Number.isNaN(parsedBirthDate.getTime())) {
      throw new BadRequestException('Birth date is invalid');
    }

    return parsedBirthDate;
  }

  private assertAdultBirthDate(birthDate: Date) {
    if (!isAdultBirthDate(birthDate)) {
      throw new BadRequestException('Users must be at least 18 years old');
    }
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
