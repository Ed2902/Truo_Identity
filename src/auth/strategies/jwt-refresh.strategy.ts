import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { AuthenticatedRequestUser } from '../interfaces/authenticated-request.interface';
import { JwtRefreshTokenPayload } from '../interfaces/jwt-payload.interface';

const extractRefreshToken = (request: Request): string | null => {
  const refreshTokenFromBody = request?.body?.refreshToken;

  if (typeof refreshTokenFromBody === 'string' && refreshTokenFromBody.length > 0) {
    return refreshTokenFromBody;
  }

  return ExtractJwt.fromAuthHeaderAsBearerToken()(request);
};

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractRefreshToken]),
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKey: configService.getOrThrow<string>('auth.refreshTokenSecret'),
    });
  }

  validate(
    request: Request,
    payload: JwtRefreshTokenPayload,
  ): AuthenticatedRequestUser {
    const refreshToken = extractRefreshToken(request);

    if (!refreshToken || payload.typ !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      userId: payload.sub,
      sessionId: payload.sid,
      tokenType: 'refresh',
      refreshToken,
    };
  }
}
