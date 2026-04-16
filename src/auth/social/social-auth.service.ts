import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { SecurityLoggerService } from '../../logger/security-logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersAccountStateService } from '../../users/users-account-state.service';
import {
  buildSocialPlaceholderEmail,
  buildSocialPlaceholderPhone,
} from '../../users/users-profile.util';
import { SOCIAL_PROVIDER, SocialProvider } from './social.constants';
import { AuthService } from '../auth.service';
import { SocialFacebookLoginDto } from './dto/social-facebook-login.dto';
import { SocialGoogleLoginDto } from './dto/social-google-login.dto';

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

type ExternalIdentity = {
  provider: SocialProvider;
  providerUserId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  pictureUrl: string | null;
  canLinkByEmail: boolean;
};

const socialUserSelect = {
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

type SocialUserRecord = Prisma.UserGetPayload<{ select: typeof socialUserSelect }>;

@Injectable()
export class SocialAuthService {
  private readonly googleClient: OAuth2Client;
  private readonly googleClientIds: string[];
  private readonly facebookAppId: string;
  private readonly facebookAppSecret: string;
  private readonly facebookGraphVersion: string;
  private readonly bcryptSaltRounds: number;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly authService: AuthService,
    private readonly usersAccountStateService: UsersAccountStateService,
    private readonly securityLogger: SecurityLoggerService,
    configService: ConfigService,
  ) {
    this.googleClientIds =
      configService.get<string[]>('auth.social.googleClientIds') ?? [];
    this.googleClient = new OAuth2Client();
    this.facebookAppId =
      configService.get<string>('auth.social.facebookAppId') ?? '';
    this.facebookAppSecret =
      configService.get<string>('auth.social.facebookAppSecret') ?? '';
    this.facebookGraphVersion =
      configService.get<string>('auth.social.facebookGraphVersion') ?? '';
    this.bcryptSaltRounds = configService.getOrThrow<number>(
      'auth.bcryptSaltRounds',
    );
  }

  async loginWithGoogle(
    socialGoogleLoginDto: SocialGoogleLoginDto,
    requestContext: RequestContext,
  ) {
    const identity = await this.verifyGoogleCredential(
      socialGoogleLoginDto.credential,
    );

    return this.completeSocialLogin(
      identity,
      {
        deviceId: socialGoogleLoginDto.deviceId,
        deviceName: socialGoogleLoginDto.deviceName,
      },
      requestContext,
    );
  }

  async loginWithFacebook(
    socialFacebookLoginDto: SocialFacebookLoginDto,
    requestContext: RequestContext,
  ) {
    const identity = await this.verifyFacebookAccessToken(
      socialFacebookLoginDto.accessToken,
    );

    return this.completeSocialLogin(
      identity,
      {
        deviceId: socialFacebookLoginDto.deviceId,
        deviceName: socialFacebookLoginDto.deviceName,
      },
      requestContext,
    );
  }

  private async completeSocialLogin(
    identity: ExternalIdentity,
    sessionInput: {
      deviceId: string;
      deviceName?: string;
    },
    requestContext: RequestContext,
  ) {
    const { user, linkedByEmail, created } =
      await this.findOrCreateLocalUserFromIdentity(identity);

    await this.usersAccountStateService.assertUserCanAuthenticate(user.id);

    const authenticatedUser = this.authService.toAuthenticatedUser(user);
    const session = await this.authService.createAuthenticatedSession(
      authenticatedUser,
      {
        deviceId: sessionInput.deviceId,
        deviceName: sessionInput.deviceName,
        ...requestContext,
      },
    );
    const profileCompleted = await this.usersAccountStateService.isProfileCompleted(
      user.id,
    );

    this.securityLogger.log(`auth.social.${identity.provider}`, 'success', {
      actorUserId: user.id,
      actorSessionId: session.session.id,
      email: user.email,
      ipAddress: requestContext.ipAddress,
      userAgent: requestContext.userAgent,
      metadata: {
        created,
        linkedByEmail,
        profileCompleted,
      },
    });

    return {
      ...session,
      authProvider: identity.provider,
      profileCompleted,
      mustCompleteProfile: !profileCompleted,
      socialAccount: {
        provider: identity.provider,
        linkedByEmail,
        created,
      },
    };
  }

  private async findOrCreateLocalUserFromIdentity(identity: ExternalIdentity) {
    const existingIdentityProvider =
      await this.prismaService.userIdentityProvider.findUnique({
        where: {
          provider_providerUserId: {
            provider: identity.provider,
            providerUserId: identity.providerUserId,
          },
        },
        select: {
          userId: true,
        },
      });

    if (existingIdentityProvider) {
      const user = await this.getUserById(existingIdentityProvider.userId);

      return {
        user,
        linkedByEmail: false,
        created: false,
      };
    }

    if (identity.canLinkByEmail && identity.email) {
      const existingUser = await this.prismaService.user.findUnique({
        where: { email: identity.email },
        select: socialUserSelect,
      });

      if (existingUser) {
        await this.prismaService.userIdentityProvider.create({
          data: {
            userId: existingUser.id,
            provider: identity.provider,
            providerUserId: identity.providerUserId,
            providerEmail: identity.email,
          },
        });

        return {
          user: existingUser,
          linkedByEmail: true,
          created: false,
        };
      }
    }

    const user = await this.prismaService.$transaction(async (tx) => {
      const email =
        identity.email ??
        buildSocialPlaceholderEmail(identity.provider, identity.providerUserId);

      const createdUser = await tx.user.create({
        data: {
          email,
          phone: buildSocialPlaceholderPhone(
            identity.provider,
            identity.providerUserId,
          ),
          password: await bcrypt.hash(randomUUID(), this.bcryptSaltRounds),
          profile: {
            create: {
              firstName:
                identity.firstName?.trim() ||
                this.buildFallbackFirstName(identity.provider),
              lastName: identity.lastName?.trim() || null,
              avatarUrl: identity.pictureUrl,
              isAvatarVerified: false,
            },
          },
          identityProviders: {
            create: {
              provider: identity.provider,
              providerUserId: identity.providerUserId,
              providerEmail: identity.email,
            },
          },
        },
        select: socialUserSelect,
      });

      return createdUser;
    });

    return {
      user,
      linkedByEmail: false,
      created: true,
    };
  }

  private async verifyGoogleCredential(credential: string): Promise<ExternalIdentity> {
    if (!this.isGoogleConfigured()) {
      throw new ServiceUnavailableException(
        'Google social auth is not configured',
      );
    }

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: credential,
        audience: this.googleClientIds,
      });
      const payload = ticket.getPayload();

      if (!payload?.sub) {
        throw new UnauthorizedException('Google credential is invalid');
      }

      return {
        provider: SOCIAL_PROVIDER.GOOGLE,
        providerUserId: payload.sub,
        email: payload.email ?? null,
        firstName: payload.given_name ?? payload.name ?? null,
        lastName: payload.family_name ?? null,
        pictureUrl: payload.picture ?? null,
        canLinkByEmail:
          Boolean(payload.email) && Boolean(payload.email_verified),
      };
    } catch (error) {
      this.securityLogger.log('auth.social.google', 'failure', {
        reason:
          error instanceof Error ? error.message : 'google_token_validation_failed',
      });
      throw new UnauthorizedException('Google credential is invalid');
    }
  }

  private async verifyFacebookAccessToken(
    accessToken: string,
  ): Promise<ExternalIdentity> {
    if (!this.isFacebookConfigured()) {
      throw new ServiceUnavailableException(
        'Facebook social auth is not configured',
      );
    }

    const appAccessToken = `${this.facebookAppId}|${this.facebookAppSecret}`;
    const baseUrl = `https://graph.facebook.com/${this.facebookGraphVersion}`;
    const debugUrl = new URL(`${baseUrl}/debug_token`);
    debugUrl.searchParams.set('input_token', accessToken);
    debugUrl.searchParams.set('access_token', appAccessToken);

    const debugResponse = await fetch(debugUrl);

    if (!debugResponse.ok) {
      this.securityLogger.log('auth.social.facebook', 'failure', {
        reason: 'facebook_debug_token_request_failed',
        metadata: {
          status: debugResponse.status,
        },
      });
      throw new UnauthorizedException('Facebook access token is invalid');
    }

    const debugPayload = (await debugResponse.json()) as {
      data?: {
        app_id?: string;
        is_valid?: boolean;
        user_id?: string;
      };
    };

    if (
      !debugPayload.data?.is_valid ||
      !debugPayload.data.user_id ||
      debugPayload.data.app_id !== this.facebookAppId
    ) {
      this.securityLogger.log('auth.social.facebook', 'failure', {
        reason: 'facebook_token_not_valid_for_app',
      });
      throw new UnauthorizedException('Facebook access token is invalid');
    }

    const meUrl = new URL(`${baseUrl}/me`);
    meUrl.searchParams.set('fields', 'id,name,email,first_name,last_name,picture.type(large)');
    meUrl.searchParams.set('access_token', accessToken);

    const profileResponse = await fetch(meUrl);

    if (!profileResponse.ok) {
      this.securityLogger.log('auth.social.facebook', 'failure', {
        reason: 'facebook_profile_request_failed',
        metadata: {
          status: profileResponse.status,
        },
      });
      throw new UnauthorizedException('Facebook access token is invalid');
    }

    const profilePayload = (await profileResponse.json()) as {
      id?: string;
      email?: string;
      first_name?: string;
      last_name?: string;
      name?: string;
      picture?: {
        data?: {
          url?: string;
        };
      };
    };

    if (!profilePayload.id) {
      throw new UnauthorizedException('Facebook access token is invalid');
    }

    return {
      provider: SOCIAL_PROVIDER.FACEBOOK,
      providerUserId: profilePayload.id,
      email: profilePayload.email ?? null,
      firstName: profilePayload.first_name ?? profilePayload.name ?? null,
      lastName: profilePayload.last_name ?? null,
      pictureUrl: profilePayload.picture?.data?.url ?? null,
      canLinkByEmail: Boolean(profilePayload.email),
    };
  }

  private async getUserById(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: socialUserSelect,
    });

    if (!user) {
      throw new BadRequestException('Linked social user was not found');
    }

    return user;
  }

  private buildFallbackFirstName(provider: SocialProvider) {
    return provider === SOCIAL_PROVIDER.GOOGLE ? 'Google' : 'Facebook';
  }

  private isGoogleConfigured() {
    return this.googleClientIds.length > 0;
  }

  private isFacebookConfigured() {
    return Boolean(
      this.facebookAppId &&
        this.facebookAppSecret &&
        this.facebookGraphVersion,
    );
  }
}
