import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecurityLoggerService } from '../logger/security-logger.service';
import { UserNotificationsService } from '../notifications/user-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import {
  AVATAR_PROCESSING_STAGE,
  AVATAR_PROCESSING_STATUS,
  AVATAR_VALIDATION_JOB,
  AVATAR_VECTOR_EXTRACTION_JOB,
} from './avatar-processing.constants';

type ExtractForwardPayload = {
  userId: string;
  storageKey: string;
  imageUrl: string;
};

type ValidationRunPayload = {
  userId: string;
  image: string;
};

type ValidationResult = {
  match: boolean;
  score?: number;
  faceDetected?: boolean;
};

type AvatarJobContext = {
  attemptsMade: number;
  maxAttempts: number;
};

@Injectable()
export class AvatarVerificationService {
  private readonly facialValidatorBaseUrl: string;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly queueService: QueueService,
    private readonly userNotificationsService: UserNotificationsService,
    private readonly securityLogger: SecurityLoggerService,
    configService: ConfigService,
  ) {
    this.facialValidatorBaseUrl =
      configService.get<string>('facialValidator.baseUrl') ??
      'http://localhost:8000';
  }

  buildResetState() {
    return {
      isAvatarVerified: false,
      avatarVectorEmbedding: null,
      avatarVectorUpdatedAt: null,
      avatarVerifiedAt: null,
      lastAvatarValidationScore: null,
      lastAvatarValidationAt: null,
      ...this.buildIdleVectorState(),
      ...this.buildIdleValidationState(),
    };
  }

  async queueVectorExtraction(payload: ExtractForwardPayload) {
    await this.ensureProfileExists(payload.userId);

    await this.prismaService.userProfile.update({
      where: { userId: payload.userId },
      data: {
        ...this.buildQueuedVectorState(),
      },
    });

    await this.queueService.getSystemQueue().add(
      AVATAR_VECTOR_EXTRACTION_JOB,
      payload,
      {
        jobId: `${AVATAR_VECTOR_EXTRACTION_JOB}:${payload.userId}:${payload.storageKey}`,
        attempts: 5,
      },
    );

    this.securityLogger.log('users.avatar.vector.extract_forward.scheduled', 'success', {
      targetUserId: payload.userId,
      metadata: {
        endpoint: new URL(
          '/app/vectores/extract-forward',
          this.facialValidatorBaseUrl,
        ).toString(),
        storageKey: payload.storageKey,
      },
    });

    return {
      success: true,
      message: 'Estamos procesando tu foto de perfil.',
      analysisStatus: AVATAR_PROCESSING_STATUS.QUEUED,
      stage: AVATAR_PROCESSING_STAGE.VECTOR,
    };
  }

  async queueAvatarValidation(userId: string, image: string) {
    if (!image.trim()) {
      throw new BadRequestException('Provide imagen to validate');
    }

    const profile = await this.prismaService.userProfile.findUnique({
      where: { userId },
      select: {
        avatarUrl: true,
        avatarValidationStatus: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    if (!profile.avatarUrl) {
      throw new BadRequestException(
        'Upload and confirm an avatar before requesting validation',
      );
    }

    const activeValidationStatuses: string[] = [
        AVATAR_PROCESSING_STATUS.QUEUED,
        AVATAR_PROCESSING_STATUS.PROCESSING,
        AVATAR_PROCESSING_STATUS.RETRYING,
      ];

    if (activeValidationStatuses.includes(profile.avatarValidationStatus)) {
      return {
        success: true,
        message: 'Ya estamos analizando tu foto actual.',
        analysisStatus: profile.avatarValidationStatus,
        stage: AVATAR_PROCESSING_STAGE.VALIDATION,
      };
    }

    await this.prismaService.userProfile.update({
      where: { userId },
      data: {
        ...this.buildQueuedValidationState(),
      },
    });

    await this.queueService.getSystemQueue().add(
      AVATAR_VALIDATION_JOB,
      {
        userId,
        image,
      } satisfies ValidationRunPayload,
      {
        jobId: `${AVATAR_VALIDATION_JOB}:${userId}:${Date.now()}`,
        attempts: 5,
      },
    );

    this.securityLogger.log('users.avatar.validation.run', 'success', {
      actorUserId: userId,
      metadata: {
        queued: true,
      },
    });

    return {
      success: true,
      message:
        'Estamos analizando tu foto. Te avisaremos por correo cuando el proceso termine.',
      analysisStatus: AVATAR_PROCESSING_STATUS.QUEUED,
      stage: AVATAR_PROCESSING_STAGE.VALIDATION,
    };
  }

  async processQueuedVectorExtraction(
    payload: ExtractForwardPayload,
    jobContext: AvatarJobContext,
  ) {
    await this.markVectorProcessing(payload.userId, jobContext.attemptsMade);

    try {
      const vectorEmbedding = await this.requestVectorExtraction(payload);
      const vectorSaved = await this.saveAvatarVectorIfAvatarMatches(
        payload.userId,
        payload.storageKey,
        vectorEmbedding,
      );

      if (!vectorSaved) {
        return;
      }

      await this.prismaService.userProfile.update({
        where: { userId: payload.userId },
        data: {
          avatarVectorStatus: AVATAR_PROCESSING_STATUS.COMPLETED,
          avatarVectorFinishedAt: new Date(),
          avatarVectorLastError: null,
          avatarVectorLastErrorCode: null,
        },
      });

      this.securityLogger.log('users.avatar.vector.extract_forward', 'success', {
        targetUserId: payload.userId,
        metadata: {
          vectorSavedInline: true,
        },
      });
    } catch (error) {
      await this.handleVectorJobFailure(payload.userId, error, jobContext);
      throw error;
    }
  }

  async processQueuedAvatarValidation(
    payload: ValidationRunPayload,
    jobContext: AvatarJobContext,
  ) {
    await this.markValidationProcessing(payload.userId, jobContext.attemptsMade);

    try {
      await this.ensureAvatarValidationReady(payload.userId);
      const result = await this.requestAvatarValidation(payload);
      const savedResult = await this.saveAvatarValidationResult(
        payload.userId,
        result.match,
        result.score,
        result.faceDetected,
      );

      await this.prismaService.userProfile.update({
        where: { userId: payload.userId },
        data: {
          avatarValidationStatus: AVATAR_PROCESSING_STATUS.COMPLETED,
          avatarValidationFinishedAt: new Date(),
          avatarValidationLastError: null,
          avatarValidationLastErrorCode: null,
        },
      });

      await this.notifyValidationCompleted(
        payload.userId,
        savedResult.isAvatarVerified,
        savedResult.lastAvatarValidationScore,
      );
    } catch (error) {
      await this.handleValidationJobFailure(payload.userId, error, jobContext);
      throw error;
    }
  }

  async saveAvatarVector(userId: string, vectorEmbedding: string) {
    await this.ensureProfileExists(userId);

    const updatedProfile = await this.prismaService.userProfile.update({
      where: { userId },
      data: {
        avatarVectorEmbedding: vectorEmbedding,
        avatarVectorUpdatedAt: new Date(),
        avatarVectorStatus: AVATAR_PROCESSING_STATUS.COMPLETED,
        avatarVectorFinishedAt: new Date(),
        avatarVectorLastError: null,
        avatarVectorLastErrorCode: null,
      },
      select: {
        userId: true,
        avatarVectorUpdatedAt: true,
      },
    });

    this.securityLogger.log('users.avatar.vector.save', 'success', {
      targetUserId: userId,
      metadata: {
        avatarVectorUpdatedAt: updatedProfile.avatarVectorUpdatedAt?.toISOString(),
      },
    });

    return {
      success: true,
      userId: updatedProfile.userId,
      avatarVectorUpdatedAt: updatedProfile.avatarVectorUpdatedAt,
    };
  }

  async getAvatarVector(userId: string) {
    const profile = await this.prismaService.userProfile.findUnique({
      where: { userId },
      select: {
        avatarVectorEmbedding: true,
        avatarVectorUpdatedAt: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return {
      vector_b64: profile.avatarVectorEmbedding ?? null,
    };
  }

  async saveAvatarValidationResult(
    userId: string,
    match: boolean,
    score?: number,
    faceDetected?: boolean,
  ) {
    await this.ensureProfileExists(userId);

    const now = new Date();
    const normalizedMatch = faceDetected === false ? false : match;
    const updatedProfile = await this.prismaService.userProfile.update({
      where: { userId },
      data: {
        isAvatarVerified: normalizedMatch,
        avatarVerifiedAt: normalizedMatch ? now : null,
        avatarValidationStatus: AVATAR_PROCESSING_STATUS.COMPLETED,
        avatarValidationFinishedAt: now,
        avatarValidationLastError: null,
        avatarValidationLastErrorCode: null,
        ...(score !== undefined && {
          lastAvatarValidationScore: score,
        }),
        lastAvatarValidationAt: now,
      },
      select: {
        userId: true,
        isAvatarVerified: true,
        avatarVerifiedAt: true,
        lastAvatarValidationScore: true,
        lastAvatarValidationAt: true,
      },
    });

    this.securityLogger.log('users.avatar.validation.save', 'success', {
      targetUserId: userId,
      metadata: {
        match,
        normalizedMatch,
        score: score ?? null,
        faceDetected: faceDetected ?? null,
      },
    });

    return {
      success: true,
      userId: updatedProfile.userId,
      isAvatarVerified: updatedProfile.isAvatarVerified,
      avatarVerifiedAt: updatedProfile.avatarVerifiedAt,
      lastAvatarValidationScore: updatedProfile.lastAvatarValidationScore,
      lastAvatarValidationAt: updatedProfile.lastAvatarValidationAt,
    };
  }

  private async ensureAvatarValidationReady(userId: string) {
    const profile = await this.prismaService.userProfile.findUnique({
      where: { userId },
      select: {
        avatarUrl: true,
        avatarVectorEmbedding: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    if (!profile.avatarUrl) {
      throw new BadRequestException('Avatar not found');
    }

    if (!profile.avatarVectorEmbedding) {
      throw new Error('Avatar vector is not ready yet');
    }
  }

  private async requestVectorExtraction(payload: ExtractForwardPayload) {
    const endpoint = new URL(
      '/app/vectores/extract-forward',
      this.facialValidatorBaseUrl,
    );

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: payload.userId,
        imagen: payload.imageUrl,
      }),
    });
    const responseBody = await this.parseJson(response);

    if (!response.ok) {
      this.securityLogger.log('users.avatar.vector.extract_forward', 'error', {
        targetUserId: payload.userId,
        reason: 'facial_validator_request_failed',
        metadata: {
          status: response.status,
          endpoint: endpoint.toString(),
        },
      });
      throw new BadGatewayException(
        this.getValidatorErrorMessage(responseBody) ??
          'Facial validator request failed',
      );
    }

    const vectorEmbedding = this.extractVectorEmbedding(responseBody);

    if (!vectorEmbedding) {
      throw new BadGatewayException(
        'Facial validator response did not include a valid vector',
      );
    }

    return vectorEmbedding;
  }

  private async requestAvatarValidation(
    payload: ValidationRunPayload,
  ): Promise<ValidationResult> {
    const endpoint = new URL(
      '/app/vectores/validate',
      this.facialValidatorBaseUrl,
    );

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: payload.userId,
          imagen: payload.image,
        }),
      });
      const responseBody = await this.parseJson(response);

      if (!response.ok) {
        this.securityLogger.log('users.avatar.validation.run', 'error', {
          targetUserId: payload.userId,
          reason: 'facial_validator_request_failed',
          metadata: {
            status: response.status,
            endpoint: endpoint.toString(),
          },
        });
        throw new BadGatewayException(
          this.getValidatorErrorMessage(responseBody) ??
            'Facial validator request failed',
        );
      }

      const normalizedResult = this.extractValidationResult(responseBody);

      if (!normalizedResult) {
        throw new BadGatewayException(
          'Facial validator response did not include a valid result',
        );
      }

      this.securityLogger.log('users.avatar.validation.run', 'success', {
        targetUserId: payload.userId,
        metadata: {
          endpoint: endpoint.toString(),
          match: normalizedResult.match,
          score: normalizedResult.score ?? null,
          faceDetected: normalizedResult.faceDetected ?? null,
        },
      });

      return normalizedResult;
    } catch (error) {
      if (
        error instanceof BadGatewayException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.securityLogger.log('users.avatar.validation.run', 'error', {
        targetUserId: payload.userId,
        reason:
          error instanceof Error ? error.message : 'facial_validator_unreachable',
        metadata: {
          endpoint: endpoint.toString(),
        },
      });
      throw new BadGatewayException('Facial validator is unreachable');
    }
  }

  private async saveAvatarVectorIfAvatarMatches(
    userId: string,
    expectedStorageKey: string,
    vectorEmbedding: string,
  ) {
    const profile = await this.prismaService.userProfile.findUnique({
      where: { userId },
      select: {
        avatarStorageKey: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    if (profile.avatarStorageKey !== expectedStorageKey) {
      this.securityLogger.log('users.avatar.vector.save', 'denied', {
        targetUserId: userId,
        reason: 'avatar_changed_before_vector_persisted',
      });
      return false;
    }

    await this.saveAvatarVector(userId, vectorEmbedding);
    return true;
  }

  private async markVectorProcessing(userId: string, attemptsMade: number) {
    await this.prismaService.userProfile.update({
      where: { userId },
      data: {
        avatarVectorStatus:
          attemptsMade > 0
            ? AVATAR_PROCESSING_STATUS.RETRYING
            : AVATAR_PROCESSING_STATUS.PROCESSING,
        avatarVectorStartedAt: new Date(),
        avatarVectorRetryCount: attemptsMade,
        avatarVectorLastError: null,
        avatarVectorLastErrorCode: null,
      },
    });
  }

  private async markValidationProcessing(userId: string, attemptsMade: number) {
    await this.prismaService.userProfile.update({
      where: { userId },
      data: {
        avatarValidationStatus:
          attemptsMade > 0
            ? AVATAR_PROCESSING_STATUS.RETRYING
            : AVATAR_PROCESSING_STATUS.PROCESSING,
        avatarValidationStartedAt: new Date(),
        avatarValidationRetryCount: attemptsMade,
        avatarValidationLastError: null,
        avatarValidationLastErrorCode: null,
      },
    });
  }

  private async handleVectorJobFailure(
    userId: string,
    error: unknown,
    jobContext: AvatarJobContext,
  ) {
    const nextAttempt = jobContext.attemptsMade + 1;
    const retryable = this.isRetryableAvatarError(error);
    const willRetry = retryable && nextAttempt < jobContext.maxAttempts;
    const errorMessage = this.getErrorMessage(error);
    const errorCode = this.getErrorCode(error);

    await this.prismaService.userProfile.update({
      where: { userId },
      data: {
        avatarVectorStatus: willRetry
          ? AVATAR_PROCESSING_STATUS.RETRYING
          : AVATAR_PROCESSING_STATUS.FAILED,
        avatarVectorFinishedAt: willRetry ? null : new Date(),
        avatarVectorRetryCount: nextAttempt,
        avatarVectorLastError: errorMessage,
        avatarVectorLastErrorCode: errorCode,
      },
    });

    if (!willRetry) {
      await this.notifyProcessingFailed(
        userId,
        AVATAR_PROCESSING_STAGE.VECTOR,
        errorMessage,
      );
    }
  }

  private async handleValidationJobFailure(
    userId: string,
    error: unknown,
    jobContext: AvatarJobContext,
  ) {
    const nextAttempt = jobContext.attemptsMade + 1;
    const retryable = this.isRetryableAvatarError(error);
    const willRetry = retryable && nextAttempt < jobContext.maxAttempts;
    const errorMessage = this.getErrorMessage(error);
    const errorCode = this.getErrorCode(error);

    await this.prismaService.userProfile.update({
      where: { userId },
      data: {
        avatarValidationStatus: willRetry
          ? AVATAR_PROCESSING_STATUS.RETRYING
          : AVATAR_PROCESSING_STATUS.FAILED,
        avatarValidationFinishedAt: willRetry ? null : new Date(),
        avatarValidationRetryCount: nextAttempt,
        avatarValidationLastError: errorMessage,
        avatarValidationLastErrorCode: errorCode,
      },
    });

    if (!willRetry) {
      await this.notifyProcessingFailed(
        userId,
        AVATAR_PROCESSING_STAGE.VALIDATION,
        errorMessage,
      );
    }
  }

  private buildIdleVectorState() {
    return {
      avatarVectorStatus: AVATAR_PROCESSING_STATUS.IDLE,
      avatarVectorRequestedAt: null,
      avatarVectorStartedAt: null,
      avatarVectorFinishedAt: null,
      avatarVectorRetryCount: 0,
      avatarVectorLastError: null,
      avatarVectorLastErrorCode: null,
    };
  }

  private buildIdleValidationState() {
    return {
      avatarValidationStatus: AVATAR_PROCESSING_STATUS.IDLE,
      avatarValidationRequestedAt: null,
      avatarValidationStartedAt: null,
      avatarValidationFinishedAt: null,
      avatarValidationRetryCount: 0,
      avatarValidationLastError: null,
      avatarValidationLastErrorCode: null,
    };
  }

  private buildQueuedVectorState() {
    return {
      avatarVectorStatus: AVATAR_PROCESSING_STATUS.QUEUED,
      avatarVectorRequestedAt: new Date(),
      avatarVectorStartedAt: null,
      avatarVectorFinishedAt: null,
      avatarVectorRetryCount: 0,
      avatarVectorLastError: null,
      avatarVectorLastErrorCode: null,
    };
  }

  private buildQueuedValidationState() {
    return {
      avatarValidationStatus: AVATAR_PROCESSING_STATUS.QUEUED,
      avatarValidationRequestedAt: new Date(),
      avatarValidationStartedAt: null,
      avatarValidationFinishedAt: null,
      avatarValidationRetryCount: 0,
      avatarValidationLastError: null,
      avatarValidationLastErrorCode: null,
    };
  }

  private async notifyValidationCompleted(
    userId: string,
    isVerified: boolean,
    score?: number | null,
  ) {
    const recipient = await this.getUserNotificationRecipient(userId);

    await this.userNotificationsService.sendAvatarValidationCompleted({
      email: recipient.email,
      isVerified,
      score,
    });
  }

  private async notifyProcessingFailed(
    userId: string,
    stage: 'vector' | 'validation',
    reason?: string,
  ) {
    const recipient = await this.getUserNotificationRecipient(userId);

    await this.userNotificationsService.sendAvatarProcessingFailed({
      email: recipient.email,
      stage,
      reason,
    });
  }

  private async getUserNotificationRecipient(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async ensureProfileExists(userId: string) {
    const profile = await this.prismaService.userProfile.findUnique({
      where: { userId },
      select: {
        userId: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
  }

  private async parseJson(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') ?? '';

    if (!contentType.toLowerCase().includes('application/json')) {
      return null;
    }

    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private extractVectorEmbedding(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const candidatePayload = payload as Record<string, unknown>;
    const directCandidates = [
      candidatePayload.vectorEmbedding,
      candidatePayload.vector_b64,
      candidatePayload.embedding,
      candidatePayload.vector,
    ];

    for (const candidate of directCandidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }

    const nestedData = candidatePayload.data;

    if (nestedData && typeof nestedData === 'object') {
      const nestedCandidate = nestedData as Record<string, unknown>;
      const nestedValues = [
        nestedCandidate.vectorEmbedding,
        nestedCandidate.vector_b64,
        nestedCandidate.embedding,
        nestedCandidate.vector,
      ];

      for (const candidate of nestedValues) {
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
          return candidate;
        }
      }
    }

    return null;
  }

  private extractValidationResult(payload: unknown): ValidationResult | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const candidatePayload = payload as Record<string, unknown>;
    const nestedData =
      candidatePayload.data && typeof candidatePayload.data === 'object'
        ? (candidatePayload.data as Record<string, unknown>)
        : null;

    const matchCandidate =
      typeof candidatePayload.match === 'boolean'
        ? candidatePayload.match
        : typeof nestedData?.match === 'boolean'
          ? nestedData.match
          : null;

    if (matchCandidate === null) {
      return null;
    }

    const scoreCandidate = [
      candidatePayload.rango,
      candidatePayload.score,
      nestedData?.rango,
      nestedData?.score,
    ].find(
      (candidate) => typeof candidate === 'number' && Number.isFinite(candidate),
    ) as number | undefined;

    const faceDetectedCandidate = [
      candidatePayload.face_detected,
      candidatePayload.faceDetected,
      nestedData?.face_detected,
      nestedData?.faceDetected,
    ].find((candidate) => typeof candidate === 'boolean') as
      | boolean
      | undefined;

    return {
      match: matchCandidate,
      score: scoreCandidate,
      faceDetected: faceDetectedCandidate,
    };
  }

  private getValidatorErrorMessage(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const candidatePayload = payload as Record<string, unknown>;
    const detail = candidatePayload.detail;
    const message = candidatePayload.message;

    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }

    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    return null;
  }

  private isRetryableAvatarError(error: unknown) {
    return !(
      error instanceof BadRequestException || error instanceof NotFoundException
    );
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'avatar_processing_failed';
  }

  private getErrorCode(error: unknown) {
    if (error instanceof BadRequestException) {
      return 'bad_request';
    }

    if (error instanceof NotFoundException) {
      return 'not_found';
    }

    if (error instanceof BadGatewayException) {
      return 'upstream_unavailable';
    }

    return 'unknown_error';
  }
}
