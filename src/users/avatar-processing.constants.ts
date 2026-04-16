export const AVATAR_PROCESSING_STATUS = {
  IDLE: 'idle',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  RETRYING: 'retrying',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export const AVATAR_PROCESSING_STAGE = {
  VECTOR: 'vector',
  VALIDATION: 'validation',
} as const;

export const AVATAR_VECTOR_EXTRACTION_JOB = 'users.avatar.vector.extract';
export const AVATAR_VALIDATION_JOB = 'users.avatar.validation.run';

export type AvatarProcessingStatus =
  (typeof AVATAR_PROCESSING_STATUS)[keyof typeof AVATAR_PROCESSING_STATUS];

export type AvatarProcessingStage =
  (typeof AVATAR_PROCESSING_STAGE)[keyof typeof AVATAR_PROCESSING_STAGE];
