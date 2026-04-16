import { IsString, MinLength } from 'class-validator';

export class RunAvatarValidationDto {
  @IsString()
  @MinLength(1)
  imagen!: string;
}
