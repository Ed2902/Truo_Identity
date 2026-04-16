import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SecurityLoggerService } from '../logger/security-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AvatarVerificationService } from './avatar-verification.service';
import { ConfirmAvatarUploadDto } from './dto/confirm-avatar-upload.dto';
import { CreateAvatarUploadUrlDto } from './dto/create-avatar-upload-url.dto';

@Injectable()
export class UsersAvatarService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly storageService: StorageService,
    private readonly securityLogger: SecurityLoggerService,
    private readonly avatarVerificationService: AvatarVerificationService,
  ) {}

  async createUploadUrl(
    userId: string,
    createAvatarUploadUrlDto: CreateAvatarUploadUrlDto,
  ) {
    const response = await this.storageService.createAvatarUploadUrl({
      userId,
      fileName: createAvatarUploadUrlDto.fileName,
      mimeType: createAvatarUploadUrlDto.mimeType,
      size: createAvatarUploadUrlDto.size,
    });

    this.securityLogger.log('users.avatar.upload_url', 'success', {
      actorUserId: userId,
      metadata: {
        mimeType: createAvatarUploadUrlDto.mimeType,
        size: createAvatarUploadUrlDto.size,
      },
    });

    return response;
  }

  async confirmUpload(
    userId: string,
    confirmAvatarUploadDto: ConfirmAvatarUploadDto,
  ) {
    this.storageService.assertAvatarOwnership(
      userId,
      confirmAvatarUploadDto.storageKey,
    );
    await this.storageService.ensureObjectExists(confirmAvatarUploadDto.storageKey);

    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        profile: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!user || !user.profile) {
      throw new NotFoundException('Profile not found');
    }

    const avatarUrl = this.storageService.createAvatarPublicUrl(
      confirmAvatarUploadDto.storageKey,
    );

    const avatarViewUrl = await this.storageService.createAvatarViewUrl(
      confirmAvatarUploadDto.storageKey,
    );

    await this.prismaService.userProfile.update({
      where: { userId },
      data: {
        avatarStorageKey: confirmAvatarUploadDto.storageKey,
        avatarUrl,
        ...this.avatarVerificationService.buildResetState(),
      },
    });

    await this.avatarVerificationService.queueVectorExtraction({
      userId,
      storageKey: confirmAvatarUploadDto.storageKey,
      imageUrl: avatarViewUrl,
    });

    this.securityLogger.log('users.avatar.confirm', 'success', {
      actorUserId: userId,
      metadata: {
        storageKey: confirmAvatarUploadDto.storageKey,
      },
    });

    return {
      success: true,
      storageKey: confirmAvatarUploadDto.storageKey,
      vectorAnalysisStatus: 'queued',
    };
  }

  async getViewUrl(userId: string) {
    const profile = await this.prismaService.userProfile.findUnique({
      where: { userId },
      select: {
        avatarStorageKey: true,
      },
    });

    if (!profile?.avatarStorageKey) {
      throw new NotFoundException('Avatar not found');
    }

    return {
      viewUrl: await this.storageService.createAvatarViewUrl(
        profile.avatarStorageKey,
      ),
      storageKey: profile.avatarStorageKey,
    };
  }
}
