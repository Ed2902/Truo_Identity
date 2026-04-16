import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class SaveAvatarValidationResultDto {
  @ValidateIf(
    (object: SaveAvatarValidationResultDto) => object.id === undefined,
  )
  @IsUUID()
  userId?: string;

  @ValidateIf(
    (object: SaveAvatarValidationResultDto) => object.userId === undefined,
  )
  @IsUUID()
  id?: string;

  @IsBoolean()
  match!: boolean;

  @IsOptional()
  @IsNumber(
    {
      allowInfinity: false,
      allowNaN: false,
    },
    {
      message: 'score must be a valid number',
    },
  )
  score?: number;

  @IsOptional()
  @IsNumber(
    {
      allowInfinity: false,
      allowNaN: false,
    },
    {
      message: 'rango must be a valid number',
    },
  )
  rango?: number;

  @IsOptional()
  @IsBoolean()
  face_detected?: boolean;
}
