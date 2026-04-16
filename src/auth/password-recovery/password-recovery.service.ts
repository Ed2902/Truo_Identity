import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordRecoveryCode } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { SecurityLoggerService } from '../../logger/security-logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { RequestPasswordRecoveryDto } from './dto/request-password-recovery.dto';
import { ResetPasswordRecoveryDto } from './dto/reset-password-recovery.dto';
import { VerifyPasswordRecoveryDto } from './dto/verify-password-recovery.dto';

const invalidRecoveryCodeMessage = 'Invalid or expired recovery code';
const requestAcceptedMessage =
  'If the account exists, a recovery code has been sent to the email address';

@Injectable()
export class PasswordRecoveryService {
  private readonly bcryptSaltRounds: number;
  private readonly codeTtlMinutes: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly emailService: EmailService,
    private readonly securityLogger: SecurityLoggerService,
    configService: ConfigService,
  ) {
    this.bcryptSaltRounds = configService.getOrThrow<number>(
      'auth.bcryptSaltRounds',
    );
    this.codeTtlMinutes = configService.getOrThrow<number>(
      'auth.passwordRecoveryCodeTtlMinutes',
    );
    this.maxAttempts = configService.getOrThrow<number>(
      'auth.passwordRecoveryMaxAttempts',
    );
  }

  async request(requestPasswordRecoveryDto: RequestPasswordRecoveryDto) {
    const email = this.normalizeEmail(requestPasswordRecoveryDto.email);
    const user = await this.prismaService.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      this.securityLogger.log('auth.password_recovery.request', 'success', {
        email,
        reason: 'account_existence_hidden',
        metadata: {
          accountExists: false,
        },
      });
      return {
        success: true,
        message: requestAcceptedMessage,
      };
    }

    const code = this.generateCode();
    const codeHash = await this.hashValue(code);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.codeTtlMinutes * 60 * 1000);

    await this.prismaService.$transaction(async (tx) => {
      await tx.passwordRecoveryCode.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          usedAt: now,
        },
      });

      await tx.passwordRecoveryCode.create({
        data: {
          userId: user.id,
          email: user.email,
          codeHash,
          expiresAt,
        },
      });
    });

    await this.emailService.sendPasswordRecoveryCode({
      email: user.email,
      code,
      expiresAt,
    });

    this.securityLogger.log('auth.password_recovery.request', 'success', {
      actorUserId: user.id,
      email: user.email,
      metadata: {
        accountExists: true,
      },
    });

    return {
      success: true,
      message: requestAcceptedMessage,
    };
  }

  async verify(verifyPasswordRecoveryDto: VerifyPasswordRecoveryDto) {
    const email = this.normalizeEmail(verifyPasswordRecoveryDto.email);
    const recoveryCode = await this.getLatestRecoveryCode(email);

    await this.assertValidCode(recoveryCode, verifyPasswordRecoveryDto.code);

    this.securityLogger.log('auth.password_recovery.verify', 'success', {
      actorUserId: recoveryCode?.userId,
      email,
    });

    return {
      success: true,
      valid: true,
    };
  }

  async reset(resetPasswordRecoveryDto: ResetPasswordRecoveryDto) {
    const email = this.normalizeEmail(resetPasswordRecoveryDto.email);
    const recoveryCode = await this.getLatestRecoveryCode(email);

    await this.assertValidCode(recoveryCode, resetPasswordRecoveryDto.code);
    const validatedRecoveryCode = recoveryCode as PasswordRecoveryCode;

    const passwordHash = await this.hashValue(resetPasswordRecoveryDto.newPassword);
    const now = new Date();

    await this.prismaService.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: validatedRecoveryCode.userId },
        data: {
          password: passwordHash,
        },
      });

      await tx.passwordRecoveryCode.update({
        where: { id: validatedRecoveryCode.id },
        data: {
          usedAt: now,
        },
      });

      await tx.passwordRecoveryCode.updateMany({
        where: {
          userId: validatedRecoveryCode.userId,
          id: {
            not: validatedRecoveryCode.id,
          },
          usedAt: null,
        },
        data: {
          usedAt: now,
        },
      });

      await tx.userSession.updateMany({
        where: {
          userId: validatedRecoveryCode.userId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });
    });

    await this.emailService.sendPasswordChangedConfirmation({
      email,
      changedAt: now,
    });

    this.securityLogger.log('auth.password_recovery.reset', 'success', {
      actorUserId: validatedRecoveryCode.userId,
      email,
    });

    return {
      success: true,
      message: 'Password updated successfully',
    };
  }

  private async getLatestRecoveryCode(email: string) {
    return this.prismaService.passwordRecoveryCode.findFirst({
      where: { email },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  private async assertValidCode(
    recoveryCode: PasswordRecoveryCode | null,
    plainCode: string,
  ) {
    if (!recoveryCode) {
      this.securityLogger.log('auth.password_recovery.verify', 'failure', {
        reason: 'recovery_code_not_found',
      });
      throw new BadRequestException(invalidRecoveryCodeMessage);
    }

    const now = new Date();

    if (recoveryCode.usedAt || recoveryCode.expiresAt.getTime() <= now.getTime()) {
      this.securityLogger.log('auth.password_recovery.verify', 'denied', {
        actorUserId: recoveryCode.userId,
        email: recoveryCode.email,
        reason: recoveryCode.usedAt ? 'recovery_code_already_used' : 'recovery_code_expired',
      });
      throw new BadRequestException(invalidRecoveryCodeMessage);
    }

    if (recoveryCode.attemptCount >= this.maxAttempts) {
      await this.prismaService.passwordRecoveryCode.update({
        where: { id: recoveryCode.id },
        data: {
          usedAt: recoveryCode.usedAt ?? now,
        },
      });
      this.securityLogger.log('auth.password_recovery.verify', 'denied', {
        actorUserId: recoveryCode.userId,
        email: recoveryCode.email,
        reason: 'recovery_code_attempts_exhausted',
      });
      throw new BadRequestException(invalidRecoveryCodeMessage);
    }

    const isCodeValid = await bcrypt.compare(plainCode, recoveryCode.codeHash);

    if (!isCodeValid) {
      const nextAttemptCount = recoveryCode.attemptCount + 1;

      await this.prismaService.passwordRecoveryCode.update({
        where: { id: recoveryCode.id },
        data: {
          attemptCount: {
            increment: 1,
          },
          ...(nextAttemptCount >= this.maxAttempts && {
            usedAt: now,
          }),
        },
      });

      this.securityLogger.log('auth.password_recovery.verify', 'failure', {
        actorUserId: recoveryCode.userId,
        email: recoveryCode.email,
        reason: 'invalid_recovery_code',
        metadata: {
          nextAttemptCount,
        },
      });

      throw new BadRequestException(invalidRecoveryCodeMessage);
    }
  }

  private async hashValue(value: string) {
    return bcrypt.hash(value, this.bcryptSaltRounds);
  }

  private generateCode() {
    return randomInt(100000, 1000000).toString();
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }
}
