import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class SaveAvatarVectorDto {
  @ValidateIf((object: SaveAvatarVectorDto) => object.id === undefined)
  @IsUUID()
  userId?: string;

  @ValidateIf((object: SaveAvatarVectorDto) => object.userId === undefined)
  @IsUUID()
  id?: string;

  @ValidateIf(
    (object: SaveAvatarVectorDto) =>
      object.vector_b64 === undefined &&
      object.vector === undefined &&
      object.embedding === undefined,
  )
  @IsString()
  @MinLength(1)
  vectorEmbedding?: string;

  @ValidateIf(
    (object: SaveAvatarVectorDto) =>
      object.vectorEmbedding === undefined &&
      object.vector === undefined &&
      object.embedding === undefined,
  )
  @IsString()
  @MinLength(1)
  vector_b64?: string;

  @IsOptional()
  vector?: unknown;

  @IsOptional()
  embedding?: unknown;

  @IsOptional()
  @IsBoolean()
  face_detected?: boolean;
}
