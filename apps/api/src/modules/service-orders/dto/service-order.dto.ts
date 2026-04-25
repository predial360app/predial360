import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ServiceOrderPriority,
  ServiceOrderStatus,
  ServiceOrderType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import { AbntNorm } from '@predial360/shared';

export class CreateServiceOrderDto {
  @ApiProperty({ example: 'prop-uuid' })
  @IsUUID()
  propertyId!: string;

  @ApiPropertyOptional({ example: 'asset-uuid' })
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @ApiProperty({ enum: ServiceOrderType })
  @IsEnum(ServiceOrderType)
  type!: ServiceOrderType;

  @ApiProperty({ enum: ServiceOrderPriority, default: ServiceOrderPriority.MEDIUM })
  @IsEnum(ServiceOrderPriority)
  priority!: ServiceOrderPriority;

  @ApiProperty({ example: 'Manutenção preventiva do ar condicionado' })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'Limpeza de filtros, verificação do gás e drenos.' })
  @IsString()
  @MinLength(10)
  description!: string;

  @ApiPropertyOptional({ example: '2024-06-15T09:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @ApiPropertyOptional({ example: 120, description: 'Duração estimada em minutos' })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Type(() => Number)
  estimatedDurationMinutes?: number;

  @ApiPropertyOptional({ example: 35000, description: 'Custo estimado em centavos' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  estimatedCost?: number;

  @ApiPropertyOptional({
    enum: AbntNorm,
    isArray: true,
    example: ['NBR_5674'],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(AbntNorm, { each: true })
  applicableNorms?: AbntNorm[];

  @ApiPropertyOptional({ example: 'Urgente — o aparelho está vazando.' })
  @IsOptional()
  @IsString()
  ownerNotes?: string;
}

export class UpdateServiceOrderDto {
  @ApiPropertyOptional({ enum: ServiceOrderStatus })
  @IsOptional()
  @IsEnum(ServiceOrderStatus)
  status?: ServiceOrderStatus;

  @ApiPropertyOptional({ enum: ServiceOrderPriority })
  @IsOptional()
  @IsEnum(ServiceOrderPriority)
  priority?: ServiceOrderPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  technicianNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ratingComment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  finalCost?: number;
}

export class AssignTechnicianDto {
  @ApiProperty({ example: 'tech-uuid' })
  @IsUUID()
  technicianId!: string;

  @ApiPropertyOptional({ example: '2024-06-15T09:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;
}

export class SaveSignatureDto {
  @ApiProperty({
    description: 'URL pública da assinatura PNG já hospedada no S3 (obtida via POST /storage/upload)',
    example: 'https://bucket.s3.amazonaws.com/production/signatures/uuid.png',
  })
  @IsString()
  @MinLength(10)
  signatureUrl!: string;
}
