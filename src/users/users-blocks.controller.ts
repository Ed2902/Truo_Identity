import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentAuthUser } from '../auth/decorators/current-auth-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequestUser } from '../auth/interfaces/authenticated-request.interface';
import { SensitiveRateLimit } from '../common/decorators/sensitive-rate-limit.decorator';
import { UserAccountAccessGuard } from './guards/user-account-access.guard';
import { BlockUserDto } from './dto/block-user.dto';
import { UnblockUserDto } from './dto/unblock-user.dto';
import { UsersBlocksService } from './users-blocks.service';

@Controller('users')
@UseGuards(JwtAuthGuard, UserAccountAccessGuard)
export class UsersBlocksController {
  constructor(private readonly usersBlocksService: UsersBlocksService) {}

  @Get('blocked')
  getBlockedUsers(@CurrentAuthUser() authUser: AuthenticatedRequestUser) {
    return this.usersBlocksService.getBlockedUsers(authUser.userId);
  }

  @Post('block')
  @SensitiveRateLimit()
  blockUser(
    @CurrentAuthUser() authUser: AuthenticatedRequestUser,
    @Body() blockUserDto: BlockUserDto,
  ) {
    return this.usersBlocksService.blockUser(authUser.userId, blockUserDto);
  }

  @Post('unblock')
  @SensitiveRateLimit()
  unblockUser(
    @CurrentAuthUser() authUser: AuthenticatedRequestUser,
    @Body() unblockUserDto: UnblockUserDto,
  ) {
    return this.usersBlocksService.unblockUser(authUser.userId, unblockUserDto);
  }
}
