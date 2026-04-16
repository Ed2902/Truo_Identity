import { IsString } from 'class-validator';

export class ConfirmAvatarUploadDto {
  @IsString()
  storageKey!: string;
}
