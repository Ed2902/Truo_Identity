import {
  IsEmail,
  Matches,
} from 'class-validator';

export class VerifyPasswordRecoveryDto {
  @IsEmail()
  email!: string;

  @Matches(/^\d{6}$/)
  code!: string;
}
