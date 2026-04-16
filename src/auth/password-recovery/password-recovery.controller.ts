import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { SensitiveRateLimit } from '../../common/decorators/sensitive-rate-limit.decorator';
import { RequestPasswordRecoveryDto } from './dto/request-password-recovery.dto';
import { ResetPasswordRecoveryDto } from './dto/reset-password-recovery.dto';
import { VerifyPasswordRecoveryDto } from './dto/verify-password-recovery.dto';
import { PasswordRecoveryService } from './password-recovery.service';

@Controller('auth/password-recovery')
export class PasswordRecoveryController {
  constructor(
    private readonly passwordRecoveryService: PasswordRecoveryService,
  ) {}

  @Post('request')
  @SensitiveRateLimit()
  request(@Body() requestPasswordRecoveryDto: RequestPasswordRecoveryDto) {
    return this.passwordRecoveryService.request(requestPasswordRecoveryDto);
  }

  @Post('verify')
  @SensitiveRateLimit()
  verify(@Body() verifyPasswordRecoveryDto: VerifyPasswordRecoveryDto) {
    return this.passwordRecoveryService.verify(verifyPasswordRecoveryDto);
  }

  @Post('reset')
  @SensitiveRateLimit()
  reset(@Body() resetPasswordRecoveryDto: ResetPasswordRecoveryDto) {
    return this.passwordRecoveryService.reset(resetPasswordRecoveryDto);
  }
}
