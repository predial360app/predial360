import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssetCategory, AssetStatus, MaintenanceFrequency } from '@prisma/client';
import { AbntNorm } from '@predial360/shared';

export class CreateAssetDto {
  @ApiProperty({ example: 'Painel Elétrico Principal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: AssetCategory, example: AssetCategory.ELECTRICAL })
  @IsEnum(AssetCategory)
  category!: AssetCategory;

  @ApiPropertyOptional({ example: 'Schneider Electric' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @ApiPropertyOptional({ example: 'Easy 9' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @ApiPropertyOptional({ example: 'SN-123456' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

  @ApiPropertyOptional({ example: '2020-01-15', description: 'Data de instalação (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  installationDate?: string;

  @ApiPropertyOptional({ example: '2025-01-15', description: 'Vencimento da garantia' })
  @IsOptional()
  @IsDateString()
  warrantyExpiration?: string;

  @ApiPropertyOptional({ enum: MaintenanceFrequency })
  @IsOptional()
  @IsEnum(MaintenanceFrequency)
  maintenanceFrequency?: MaintenanceFrequency;

  @ApiPropertyOptional({
    enum: AbntNorm,
    isArray: true,
    example: ['NBR_5674', 'NBR_15575'],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(AbntNorm, { each: true })
  applicableNorms?: AbntNorm[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateAssetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: AssetStatus })
  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @ApiPropertyOptional({ enum: MaintenanceFrequency })
  @IsOptional()
  @IsEnum(MaintenanceFrequency)
  maintenanceFrequency?: MaintenanceFrequency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  lastMaintenanceDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nextMaintenanceDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  iotDeviceId?: string;
}
