import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentAuthUser } from '../auth/decorators/current-auth-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequestUser } from '../auth/interfaces/authenticated-request.interface';
import { AvatarRateLimit } from '../common/decorators/avatar-rate-limit.decorator';
import { UserAccountAccessGuard } from './guards/user-account-access.guard';
import { ConfirmAvatarUploadDto } from './dto/confirm-avatar-upload.dto';
import { CreateAvatarUploadUrlDto } from './dto/create-avatar-upload-url.dto';
import { UsersAvatarService } from './users-avatar.service';

@Controller('users/avatar')
@UseGuards(JwtAuthGuard, UserAccountAccessGuard)
export class UsersAvatarController {
  constructor(private readonly usersAvatarService: UsersAvatarService) {}

  @Post('upload-url')
  @AvatarRateLimit()
  createUploadUrl(
    @CurrentAuthUser() authUser: AuthenticatedRequestUser,
    @Body() createAvatarUploadUrlDto: CreateAvatarUploadUrlDto,
  ) {
    return this.usersAvatarService.createUploadUrl(
      authUser.userId,
      createAvatarUploadUrlDto,
    );
  }

  @Post('confirm')
  @AvatarRateLimit()
  confirmUpload(
    @CurrentAuthUser() authUser: AuthenticatedRequestUser,
    @Body() confirmAvatarUploadDto: ConfirmAvatarUploadDto,
  ) {
    return this.usersAvatarService.confirmUpload(
      authUser.userId,
      confirmAvatarUploadDto,
    );
  }

  @Get('view-url')
  getViewUrl(@CurrentAuthUser() authUser: AuthenticatedRequestUser) {
    return this.usersAvatarService.getViewUrl(authUser.userId);
  }

  @Get(':userId/view-url')
  getUserViewUrl(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.usersAvatarService.getViewUrl(userId);
  }
}
