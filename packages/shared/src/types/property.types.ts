import type { PropertyType, AssetStatus, AbntNorm, MaintenanceFrequency } from './enums';
import type { Address } from './api.types';

export interface Property {
  id: string;
  ownerId: string;
  name: string;
  type: PropertyType;
  address: Address;
  buildingAge?: number;        // Idade da edificação em anos
  totalArea?: number;          // m²
  floors?: number;
  units?: number;              // Para edifícios
  registrationNumber?: string; // Matrícula do imóvel
  habitaseNumber?: string;     // Habite-se
  constructionYear?: number;
  assets: Asset[];
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  propertyId: string;
  name: string;
  category: AssetCategory;
  brand?: string;
  model?: string;
  serialNumber?: string;
  installationDate?: string;
  warrantyExpiration?: string;
  lastMaintenanceDate?: string;
  nextMaintenanceDate?: string;
  maintenanceFrequency?: MaintenanceFrequency;
  applicableNorms: AbntNorm[];
  status: AssetStatus;
  qrCode?: string;             // Para IoT/rastreamento
  iotDeviceId?: string;        // ID do dispositivo MQTT
  notes?: string;
  photos: string[];            // URLs S3
  createdAt: string;
  updatedAt: string;
}

export enum AssetCategory {
  ELECTRICAL = 'ELECTRICAL',       // Elétrica
  HYDRAULIC = 'HYDRAULIC',         // Hidráulica
  HVAC = 'HVAC',                   // Ar condicionado/ventilação
  ELEVATOR = 'ELEVATOR',           // Elevador
  FIRE_SAFETY = 'FIRE_SAFETY',     // Segurança contra incêndio (NBR 9077)
  GENERATOR = 'GENERATOR',         // Gerador
  SECURITY = 'SECURITY',           // Segurança/CFTV
  STRUCTURE = 'STRUCTURE',         // Estrutural (NBR 15575)
  FACADE = 'FACADE',               // Fachada
  ROOF = 'ROOF',                   // Cobertura/Telhado
  PLUMBING = 'PLUMBING',           // Encanamento
  GAS = 'GAS',                     // Gás
  LANDSCAPING = 'LANDSCAPING',     // Paisagismo
  OTHER = 'OTHER',
}
