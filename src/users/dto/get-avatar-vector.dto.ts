import { IsUUID, ValidateIf } from 'class-validator';

export class GetAvatarVectorDto {
  @ValidateIf((object: GetAvatarVectorDto) => object.id === undefined)
  @IsUUID()
  userId?: string;

  @ValidateIf((object: GetAvatarVectorDto) => object.userId === undefined)
  @IsUUID()
  id?: string;
}
