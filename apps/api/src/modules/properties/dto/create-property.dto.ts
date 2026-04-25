import {
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PropertyType } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreatePropertyDto {
  @ApiProperty({ example: 'Apartamento Vila Madalena' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: PropertyType, example: PropertyType.RESIDENTIAL })
  @IsEnum(PropertyType)
  type!: PropertyType;

  @ApiPropertyOptional({ example: 'Residência térrea com 3 quartos.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  // ── Endereço ───────────────────────────────────────────────────────────────

  @ApiProperty({ example: 'Rua Harmonia' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  street!: string;

  @ApiProperty({ example: '500' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  number!: string;

  @ApiPropertyOptional({ example: 'Apto 42' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  complement?: string;

  @ApiProperty({ example: 'Vila Madalena' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  neighborhood!: string;

  @ApiProperty({ example: 'São Paulo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @ApiProperty({ example: 'SP', description: 'Sigla UF (2 letras)' })
  @IsString()
  @Length(2, 2)
  state!: string;

  @ApiProperty({ example: '05435-001' })
  @IsString()
  @Matches(/^\d{5}-\d{3}$/, { message: 'CEP inválido. Formato: 00000-000' })
  zipCode!: string;

  @ApiPropertyOptional({ example: -23.5505 })
  @IsOptional()
  @IsLatitude()
  @Type(() => Number)
  latitude?: number;

  @ApiPropertyOptional({ example: -46.6333 })
  @IsOptional()
  @IsLongitude()
  @Type(() => Number)
  longitude?: number;

  // ── Características ────────────────────────────────────────────────────────

  @ApiPropertyOptional({ example: 15, description: 'Idade da edificação em anos' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  @Type(() => Number)
  buildingAge?: number;

  @ApiPropertyOptional({ example: 82.5, description: 'Área total em m²' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  totalArea?: number;

  @ApiPropertyOptional({ example: 8, description: 'Número de andares' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  floors?: number;

  @ApiPropertyOptional({ example: 24, description: 'Número de unidades (para edifícios)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  units?: number;

  @ApiPropertyOptional({ example: '12.345-678-901', description: 'Matrícula do imóvel' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  registrationNumber?: string;

  @ApiPropertyOptional({ example: '2009-03-15', description: 'Habite-se (número ou data)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  habitaseNumber?: string;

  @ApiPropertyOptional({ example: 2009 })
  @IsOptional()
  @IsInt()
  @Min(1800)
  @Max(new Date().getFullYear())
  @Type(() => Number)
  constructionYear?: number;
}

export class UpdatePropertyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: PropertyType })
  @IsOptional()
  @IsEnum(PropertyType)
  type?: PropertyType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  @Type(() => Number)
  buildingAge?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  totalArea?: number;
}
