// Inline types from @predial360/shared — used for EAS build compatibility

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: PaginationMeta;
  timestamp: string;
}

export interface Address {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude?: number;
  longitude?: number;
}

export type PropertyType = 'RESIDENTIAL' | 'CLINIC' | 'COMMERCE' | 'MIXED';
export type AssetStatus = 'OPERATIONAL' | 'MAINTENANCE' | 'DECOMMISSIONED' | 'UNKNOWN';
export type MaintenanceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';
export type AbntNorm = 'NBR_5674' | 'NBR_16747' | 'NBR_14037' | 'NBR_15575' | 'NBR_16280' | 'NBR_9077';

export interface Property {
  id: string;
  ownerId: string;
  name: string;
  type: PropertyType;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude?: string;
  longitude?: string;
  buildingAge?: number;
  totalArea?: string;
  floors?: number;
  units?: number;
  registrationNumber?: string;
  habitaseNumber?: string;
  constructionYear?: number;
  assets: Asset[];
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  propertyId: string;
  name: string;
  category: string;
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
  qrCode?: string;
  iotDeviceId?: string;
  notes?: string;
  photoUrls: string[];
  createdAt: string;
  updatedAt: string;
}
