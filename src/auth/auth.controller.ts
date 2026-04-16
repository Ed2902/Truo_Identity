import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SensitiveRateLimit } from '../common/decorators/sensitive-rate-limit.decorator';
import { AuthService } from './auth.service';
import { CurrentAuthUser } from './decorators/current-auth-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import {
  AuthenticatedRequestUser,
  RequestWithAuthUser,
  RequestWithValidatedUser,
} from './interfaces/authenticated-request.interface';
import { SocialFacebookLoginDto } from './social/dto/social-facebook-login.dto';
import { SocialGoogleLoginDto } from './social/dto/social-google-login.dto';
import { SocialAuthService } from './social/social-auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly socialAuthService: SocialAuthService,
  ) {}

  @Post('register')
  @SensitiveRateLimit()
  async register(
    @Req() request: Request,
    @Body() registerDto: RegisterDto,
  ) {
    return this.authService.register(
      registerDto,
      this.buildRequestContext(request),
    );
  }

  @Post('login')
  @SensitiveRateLimit()
  @UseGuards(LocalAuthGuard)
  async login(
    @Req() request: RequestWithValidatedUser,
    @Body() loginDto: LoginDto,
  ) {
    return this.authService.login(
      request.user,
      loginDto,
      this.buildRequestContext(request),
    );
  }

  @Post('refresh')
  @SensitiveRateLimit()
  @UseGuards(JwtRefreshGuard)
  async refresh(
    @CurrentAuthUser() authUser: AuthenticatedRequestUser,
    @Req() request: RequestWithAuthUser,
    @Body() refreshDto: RefreshDto,
  ) {
    return this.authService.refresh(
      authUser,
      refreshDto,
      this.buildRequestContext(request),
    );
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentAuthUser() authUser: AuthenticatedRequestUser) {
    await this.authService.logout(authUser);

    return {
      success: true,
    };
  }

  @Post('change-password')
  @SensitiveRateLimit()
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentAuthUser() authUser: AuthenticatedRequestUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(authUser, changePasswordDto);
  }

  @Post('social/google')
  @SensitiveRateLimit()
  async socialGoogle(
    @Req() request: Request,
    @Body() socialGoogleLoginDto: SocialGoogleLoginDto,
  ) {
    return this.socialAuthService.loginWithGoogle(
      socialGoogleLoginDto,
      this.buildRequestContext(request),
    );
  }

  @Post('social/facebook')
  @SensitiveRateLimit()
  async socialFacebook(
    @Req() request: Request,
    @Body() socialFacebookLoginDto: SocialFacebookLoginDto,
  ) {
    return this.socialAuthService.loginWithFacebook(
      socialFacebookLoginDto,
      this.buildRequestContext(request),
    );
  }

  private buildRequestContext(request: Request) {
    const userAgentHeader = request.headers['user-agent'];

    return {
      ipAddress: request.ip,
      userAgent: Array.isArray(userAgentHeader)
        ? userAgentHeader[0]
        : userAgentHeader,
    };
  }
}
