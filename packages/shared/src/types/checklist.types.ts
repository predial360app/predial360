import type { AbntNorm, ChecklistItemStatus } from './enums';

export interface Checklist {
  id: string;
  serviceOrderId: string;
  templateId?: string;      // Modelo base (pode ser gerado pela IA)
  title: string;
  description?: string;
  applicableNorms: AbntNorm[];
  items: ChecklistItem[];
  completedAt?: string;
  technicianId: string;
  isOfflineSynced: boolean;
  syncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistItem {
  id: string;
  checklistId: string;
  order: number;
  title: string;
  description?: string;
  norm?: AbntNorm;          // Norma específica deste item
  normReference?: string;   // Ex.: "NBR 5674:2012 item 7.3"
  status: ChecklistItemStatus;
  technicianNote?: string;
  photos: string[];          // URLs (S3 ou local para offline)
  isRequired: boolean;
  requiresPhoto: boolean;
  requiresMeasurement: boolean;
  measurement?: ChecklistMeasurement;
  completedAt?: string;
  // Dados offline (WatermelonDB)
  localId?: string;
  pendingSync?: boolean;
}

export interface ChecklistMeasurement {
  value: number;
  unit: string;
  minAllowed?: number;
  maxAllowed?: number;
  isWithinRange?: boolean;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  applicableNorms: AbntNorm[];
  assetCategories: string[];
  items: Omit<ChecklistItem, 'id' | 'checklistId' | 'status' | 'completedAt' | 'photos' | 'technicianNote' | 'measurement'>[];
  aiGenerated: boolean;
  createdAt: string;
}
