import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SYSTEM_QUEUE } from '../queue/queue.constants';
import {
  AVATAR_VALIDATION_JOB,
  AVATAR_VECTOR_EXTRACTION_JOB,
} from './avatar-processing.constants';
import { AvatarVerificationService } from './avatar-verification.service';

@Processor(SYSTEM_QUEUE)
export class AvatarProcessingProcessor extends WorkerHost {
  constructor(
    private readonly avatarVerificationService: AvatarVerificationService,
  ) {
    super();
  }

  async process(job: Job) {
    const maxAttempts =
      typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
    const jobContext = {
      attemptsMade: job.attemptsMade,
      maxAttempts,
    };

    try {
      switch (job.name) {
        case AVATAR_VECTOR_EXTRACTION_JOB:
          return this.avatarVerificationService.processQueuedVectorExtraction(
            job.data as {
              userId: string;
              storageKey: string;
              imageUrl: string;
            },
            jobContext,
          );
        case AVATAR_VALIDATION_JOB:
          return this.avatarVerificationService.processQueuedAvatarValidation(
            job.data as {
              userId: string;
              image: string;
            },
            jobContext,
          );
        default:
          return;
      }
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw new UnrecoverableError(error.message);
      }

      throw error;
    }
  }
}
