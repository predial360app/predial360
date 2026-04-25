import type { AbntNorm, ReportStatus } from './enums';
import type { NonConformity } from './service-order.types';

export interface Report {
  id: string;
  serviceOrderId: string;
  propertyId: string;
  technicianId: string;
  title: string;
  status: ReportStatus;
  applicableNorms: AbntNorm[];
  summary: string;
  findings: ReportFinding[];
  nonConformities: NonConformity[];
  recommendations: string[];
  photos: string[];             // URLs S3
  pdfUrl?: string;              // URL S3 do PDF gerado
  signatureUrl?: string;        // URL da assinatura digital
  signedAt?: string;
  aiGeneratedContent?: string;  // Conteúdo gerado pelo Claude
  technicianCrea?: string;
  validUntil?: string;          // Validade do laudo (NBR 16747)
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportFinding {
  id: string;
  system: string;               // Ex.: "Elétrica", "Hidráulica"
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  norm?: AbntNorm;
  normReference?: string;
  photos: string[];
  recommendation?: string;
}
