import { IsOptional, IsString, MinLength } from 'class-validator';

export class SocialFacebookLoginDto {
  @IsString()
  @MinLength(1)
  accessToken!: string;

  @IsString()
  @MinLength(1)
  deviceId!: string;

  @IsOptional()
  @IsString()
  deviceName?: string;
}
