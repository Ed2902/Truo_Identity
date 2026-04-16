import { IsUUID } from 'class-validator';

export class UnblockUserDto {
  @IsUUID()
  blockedUserId!: string;
}
