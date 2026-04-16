import { IsEmail } from 'class-validator';

export class RequestPasswordRecoveryDto {
  @IsEmail()
  email!: string;
}
