import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Input DTOs ───────────────────────────────────────────────────────────────

export class PreventivePlanDto {
  @ApiProperty({ example: 'prop-uuid', description: 'ID do imóvel' })
  @IsUUID()
  propertyId!: string;

  @ApiProperty({
    example: ['ELECTRICAL', 'HYDRAULIC', 'HVAC'],
    description: 'Sistemas presentes no imóvel (ELECTRICAL, HYDRAULIC, HVAC, ELEVATOR, FIRE_SAFETY, GENERATOR, SECURITY, STRUCTURE, FACADE, ROOF, PLUMBING, GAS)',
  })
  @IsArray()
  @IsString({ each: true })
  systems!: string[];

  @ApiProperty({ example: 15, description: 'Idade da edificação em anos' })
  @IsInt()
  @Min(0)
  @Max(200)
  @Type(() => Number)
  buildingAge!: number;
}

export class ChecklistGenerateDto {
  @ApiProperty({
    example: 'PREVENTIVE',
    description: 'Tipo de serviço: PREVENTIVE | CORRECTIVE | INSPECTION | EMERGENCY | REFORM',
  })
  @IsString()
  @IsNotEmpty()
  serviceType!: string;

  @ApiProperty({
    example: 'RESIDENTIAL',
    description: 'Tipo de imóvel: RESIDENTIAL | CLINIC | COMMERCE | MIXED',
  })
  @IsString()
  @IsNotEmpty()
  propertyType!: string;
}

export class VisualDiagnosisDto {
  @ApiProperty({
    description: 'Imagem da patologia em base64 (JPEG, PNG ou WebP — máx. 5 MB)',
    example: '/9j/4AAQSkZJRgAB...',
  })
  @IsString()
  @IsNotEmpty()
  imageBase64!: string;

  @ApiPropertyOptional({
    example: 'Umidade ascendente na parede do banheiro térreo — prédio de 1985',
    description: 'Contexto adicional sobre o problema (localização, histórico, etc.)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  context?: string;

  @ApiPropertyOptional({
    description: 'MIME type da imagem',
    enum: ['image/jpeg', 'image/png', 'image/webp'],
    example: 'image/jpeg',
  })
  @IsOptional()
  @IsString()
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
}

export class ReportDraftDto {
  @ApiProperty({ description: 'ID do checklist concluído' })
  @IsUUID()
  checklistId!: string;

  @ApiProperty({ description: 'ID do técnico responsável pelo laudo' })
  @IsUUID()
  technicianId!: string;
}

export class AbntScoreDto {
  @ApiProperty({
    example: 'prop-uuid',
    description:
      'ID do imóvel. O serviço buscará automaticamente o histórico dos últimos 24 meses ' +
      '(ordens de serviço, ativos, inspeções) para compor o score.',
  })
  @IsUUID()
  propertyId!: string;
}

export class TranslateTechnicalDto {
  @ApiProperty({
    description: 'Texto técnico de engenharia a ser traduzido para linguagem simples',
    example:
      'Constatou-se infiltração por capilaridade ascendente com degradação das argamassas de revestimento ' +
      'conforme NBR 15575:2013 §8.4, com grau de risco regular segundo NBR 16747:2020.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(20)
  @MaxLength(5000)
  technicalText!: string;
}

// ─── Output types (para documentação Swagger / contratos) ────────────────────

/** Item do plano preventivo anual (NBR 5674) */
export interface PreventiveScheduleItem {
  system: string;
  task: string;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';
  months: number[];
  normaRef: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedHours: number;
  requiresSpecialist: boolean;
}

export interface PreventivePlanOutput {
  schedule: PreventiveScheduleItem[];
  nextAlerts: Array<{ system: string; task: string; dueDate: string; priority: string }>;
  summary: string;
  normsApplied: string[];
}

/** Item do checklist gerado pela IA */
export interface ChecklistAiItem {
  order: number;
  title: string;
  normReference: string;
  isRequired: boolean;
  requiresPhoto: boolean;
  requiresMeasurement: boolean;
  measurementUnit: string | null;
  measurementMin: number | null;
  measurementMax: number | null;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ChecklistAiOutput {
  title: string;
  items: ChecklistAiItem[];
  mandatory: string[];
  applicableNorms: string[];
  estimatedMinutes: number;
}

/** Diagnóstico visual de patologia */
export interface VisualDiagnosisOutput {
  pathology: string;
  description: string;
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  normaRef: string;
  possibleCauses: string[];
  action: string;
  longTermAction: string;
  requiresSpecialist: boolean;
  estimatedCost: 'BAIXO' | 'MÉDIO' | 'ALTO';
  riskToOccupants: string;
  isUrgent: boolean;
}

/** Rascunho de laudo técnico */
export interface ReportDraftOutput {
  technicalText: string;
  clientText: string;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  mainFindings: string[];
  urgentItems: string[];
  validityMonths: number;
  normsApplied: string[];
}

/** Score de conformidade ABNT por norma */
export interface NormScore {
  score: number;
  weight: number;
  status: 'ok' | 'warning' | 'critical';
  pendingItems: string[];
  lastChecked: string | null;
}

export interface AbntScoreOutput {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  byNorm: {
    NBR_5674: NormScore;
    NBR_16747: NormScore;
    NBR_14037: NormScore;
    NBR_15575: NormScore;
    NBR_9077: NormScore;
  };
  nextActions: Array<{
    action: string;
    norm: string;
    deadline: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    impact: string;
  }>;
  summary: string;
  validUntil: string;
}

/** Tradução de texto técnico */
export interface TranslateTechnicalOutput {
  simpleText: string;
  keyPoints: Array<{ point: string; isAlert: boolean }>;
  alertLevel: 'none' | 'info' | 'warning' | 'critical';
  recommendedActions: string[];
  timeframe: string;
}

/** Análise de conformidade interna (não-streaming) */
export interface ComplianceAnalysisOutput {
  complianceScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  nonConformities: Array<{
    norm: string;
    item: string;
    severity: string;
    recommendation: string;
  }>;
  recommendations: string[];
}
