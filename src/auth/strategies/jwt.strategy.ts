import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequestUser } from '../interfaces/authenticated-request.interface';
import { JwtAccessTokenPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('auth.accessTokenSecret'),
    });
  }

  async validate(payload: JwtAccessTokenPayload): Promise<AuthenticatedRequestUser> {
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Invalid access token');
    }

    const session = await this.prismaService.userSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        isActive: true,
      },
      select: {
        id: true,
        user: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Session is no longer active');
    }

    if (session.user.status !== 'active') {
      throw new UnauthorizedException('User account is not active');
    }

    return {
      userId: payload.sub,
      sessionId: payload.sid,
      email: payload.email,
      tokenType: 'access',
    };
  }
}
