import { IsOptional, IsString, MinLength } from 'class-validator';

export class SocialGoogleLoginDto {
  @IsString()
  @MinLength(1)
  credential!: string;

  @IsString()
  @MinLength(1)
  deviceId!: string;

  @IsOptional()
  @IsString()
  deviceName?: string;
}
