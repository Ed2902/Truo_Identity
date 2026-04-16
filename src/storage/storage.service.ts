import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const allowedMimeTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

const AVATAR_VIEW_URL_TTL_SECONDS = 60 * 60 * 24;

type AllowedMimeType = keyof typeof allowedMimeTypes;

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly maxUploadSize: number;
  private readonly publicBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.getOrThrow<string>('storage.bucket');
    this.publicBaseUrl = this.configService.getOrThrow<string>(
      'storage.publicBaseUrl',
    );
    this.maxUploadSize = this.configService.getOrThrow<number>(
      'storage.maxUploadSize',
    );
    this.client = new S3Client({
      region: 'us-east-1',
      endpoint: this.configService.getOrThrow<string>('storage.endpoint'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('storage.accessKey'),
        secretAccessKey:
          this.configService.getOrThrow<string>('storage.secretKey'),
      },
      forcePathStyle: this.configService.getOrThrow<boolean>(
        'storage.forcePathStyle',
      ),
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async createAvatarUploadUrl(input: {
    userId: string;
    fileName: string;
    mimeType: string;
    size: number;
  }) {
    this.validateUploadInput(input.mimeType, input.size);

    const storageKey = this.generateAvatarStorageKey(
      input.userId,
      input.fileName,
      input.mimeType as AllowedMimeType,
    );
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: input.mimeType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: 300,
    });

    return {
      uploadUrl,
      storageKey,
    };
  }

  async createAvatarViewUrl(storageKey: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: AVATAR_VIEW_URL_TTL_SECONDS,
    });
  }

  createAvatarPublicUrl(storageKey: string) {
    const normalizedBaseUrl = this.publicBaseUrl.replace(/\/+$/, '');
    return `${normalizedBaseUrl}/${this.bucket}/${storageKey}`;
  }

  assertAvatarOwnership(userId: string, storageKey: string) {
    if (!storageKey.startsWith(`${userId}/`)) {
      throw new BadRequestException('Invalid avatar storageKey');
    }
  }

  async ensureObjectExists(storageKey: string) {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        }),
      );
    } catch (error) {
      if (error instanceof S3ServiceException) {
        throw new NotFoundException('Uploaded avatar was not found in storage');
      }

      throw error;
    }
  }

  async checkHealth() {
    try {
      await this.client.send(
        new HeadBucketCommand({
          Bucket: this.bucket,
        }),
      );
    } catch (error) {
      if (error instanceof S3ServiceException) {
        throw new BadRequestException(
          `Storage bucket ${this.bucket} is unavailable`,
        );
      }

      throw error;
    }

    return {
      status: 'ok',
      bucket: this.bucket,
    };
  }

  private validateUploadInput(mimeType: string, size: number) {
    if (!(mimeType in allowedMimeTypes)) {
      throw new BadRequestException(
        'Unsupported mimeType. Allowed values: image/jpeg, image/png, image/webp',
      );
    }

    if (size <= 0 || size > this.maxUploadSize) {
      throw new BadRequestException(
        'File size must be greater than 0 and at most 5242880 bytes',
      );
    }
  }

  private generateAvatarStorageKey(
    userId: string,
    fileName: string,
    mimeType: AllowedMimeType,
  ): string {
    const extension =
      this.extractExtension(fileName) ?? allowedMimeTypes[mimeType];
    return `${userId}/${randomUUID()}.${extension}`;
  }

  private extractExtension(fileName: string): string | null {
    const sanitizedFileName = fileName.trim().toLowerCase();
    const lastDotIndex = sanitizedFileName.lastIndexOf('.');

    if (lastDotIndex === -1 || lastDotIndex === sanitizedFileName.length - 1) {
      return null;
    }

    return sanitizedFileName.slice(lastDotIndex + 1);
  }
}
