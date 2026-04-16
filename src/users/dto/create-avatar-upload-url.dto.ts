import {
  IsInt,
  IsString,
  Min,
} from 'class-validator';

export class CreateAvatarUploadUrlDto {
  @IsString()
  mimeType!: string;

  @IsString()
  fileName!: string;

  @IsInt()
  @Min(1)
  size!: number;
}
