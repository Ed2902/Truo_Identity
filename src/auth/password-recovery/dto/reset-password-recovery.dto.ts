import {
  IsEmail,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class ResetPasswordRecoveryDto {
  @IsEmail()
  email!: string;

  @Matches(/^\d{6}$/)
  code!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
