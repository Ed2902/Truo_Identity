import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentAuthUser } from '../auth/decorators/current-auth-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequestUser } from '../auth/interfaces/authenticated-request.interface';
import { AvatarRateLimit } from '../common/decorators/avatar-rate-limit.decorator';
import { UserAccountAccessGuard } from './guards/user-account-access.guard';
import { AvatarVerificationService } from './avatar-verification.service';
import { GetAvatarVectorDto } from './dto/get-avatar-vector.dto';
import { RunAvatarValidationDto } from './dto/run-avatar-validation.dto';
import { SaveAvatarValidationResultDto } from './dto/save-avatar-validation-result.dto';
import { SaveAvatarVectorDto } from './dto/save-avatar-vector.dto';

@Controller('profiles/avatar')
export class AvatarVerificationController {
  constructor(
    private readonly avatarVerificationService: AvatarVerificationService,
  ) {}

  @Post('vector/save')
  @SkipThrottle({
    default: true,
    sensitive: true,
    avatar: true,
  })
  saveVector(@Body() saveAvatarVectorDto: SaveAvatarVectorDto) {
    const userId = saveAvatarVectorDto.userId ?? saveAvatarVectorDto.id!;
    const rawVector =
      saveAvatarVectorDto.vectorEmbedding ??
      saveAvatarVectorDto.vector_b64 ??
      saveAvatarVectorDto.vector ??
      saveAvatarVectorDto.embedding;

    if (rawVector === undefined) {
      throw new BadRequestException(
        'Provide vectorEmbedding, vector_b64, vector, or embedding',
      );
    }

    const vectorEmbedding =
      typeof rawVector === 'string' ? rawVector : JSON.stringify(rawVector);

    return this.avatarVerificationService.saveAvatarVector(
      userId,
      vectorEmbedding,
    );
  }

  @Post('vector/get')
  @SkipThrottle({
    default: true,
    sensitive: true,
    avatar: true,
  })
  getVector(@Body() getAvatarVectorDto: GetAvatarVectorDto) {
    const userId = getAvatarVectorDto.userId ?? getAvatarVectorDto.id!;

    return this.avatarVerificationService.getAvatarVector(userId);
  }

  @Post('validation/save')
  @SkipThrottle({
    default: true,
    sensitive: true,
    avatar: true,
  })
  saveValidationResult(
    @Body() saveAvatarValidationResultDto: SaveAvatarValidationResultDto,
  ) {
    const userId =
      saveAvatarValidationResultDto.userId ?? saveAvatarValidationResultDto.id!;
    const score =
      saveAvatarValidationResultDto.score ?? saveAvatarValidationResultDto.rango;

    return this.avatarVerificationService.saveAvatarValidationResult(
      userId,
      saveAvatarValidationResultDto.match,
      score,
      saveAvatarValidationResultDto.face_detected,
    );
  }

  @Post('validation/run')
  @AvatarRateLimit()
  @UseGuards(JwtAuthGuard, UserAccountAccessGuard)
  runValidation(
    @CurrentAuthUser() authUser: AuthenticatedRequestUser,
    @Body() runAvatarValidationDto: RunAvatarValidationDto,
  ) {
    return this.avatarVerificationService.queueAvatarValidation(
      authUser.userId,
      runAvatarValidationDto.imagen,
    );
  }
}
