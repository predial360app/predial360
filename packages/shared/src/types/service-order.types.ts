import type {
  ServiceOrderStatus,
  ServiceOrderPriority,
  ServiceOrderType,
  AbntNorm,
} from './enums';
import type { GeoPoint } from './api.types';

export interface ServiceOrder {
  id: string;
  code: string;             // Ex.: OS-2024-00123
  propertyId: string;
  ownerId: string;
  technicianId?: string;
  type: ServiceOrderType;
  status: ServiceOrderStatus;
  priority: ServiceOrderPriority;
  title: string;
  description: string;
  applicableNorms: AbntNorm[];
  scheduledDate?: string;
  startedAt?: string;
  completedAt?: string;
  estimatedDurationMinutes?: number;
  actualDurationMinutes?: number;
  estimatedCost?: number;
  finalCost?: number;
  ownerNotes?: string;
  technicianNotes?: string;
  technicianLocation?: GeoPoint;
  photos: string[];          // URLs S3
  videos: string[];          // URLs S3 (body cam)
  signature?: string;        // URL da assinatura (S3)
  reportId?: string;
  checklistId?: string;
  rating?: number;           // 0-5 avaliação do proprietário
  ratingComment?: string;
  aiAnalysis?: AiAnalysis;
  createdAt: string;
  updatedAt: string;
}

export interface AiAnalysis {
  complianceScore: number;           // 0-100
  nonConformities: NonConformity[];
  recommendations: string[];
  applicableNorms: AbntNorm[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  generatedAt: string;
  model: string;
}

export interface NonConformity {
  norm: AbntNorm;
  item: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendation: string;
  deadline?: string;
}

export interface TechnicianLocation {
  technicianId: string;
  serviceOrderId: string;
  location: GeoPoint;
  timestamp: string;
  status: 'EN_ROUTE' | 'ON_SITE' | 'IDLE';
}
