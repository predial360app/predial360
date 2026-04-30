// Inline types from @predial360/shared — EAS build compatibility
// Note: API returns { data, meta } for lists and plain objects for details.
// No "success" or "timestamp" wrappers.

export interface PaginationMeta {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export type PropertyType = 'RESIDENTIAL' | 'CLINIC' | 'COMMERCE' | 'MIXED';
export type AssetStatus = 'OPERATIONAL' | 'MAINTENANCE' | 'DECOMMISSIONED' | 'UNKNOWN';
export type MaintenanceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';
export type AbntNorm = 'NBR_5674' | 'NBR_16747' | 'NBR_14037' | 'NBR_15575' | 'NBR_16280' | 'NBR_9077';

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
  notes?: string;
  photoUrls: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Property {
  id: string;
  ownerId: string;
  name: string;
  type: PropertyType;
  description?: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude?: string | number;
  longitude?: string | number;
  buildingAge?: number;
  totalArea?: string | number;
  floors?: number;
  units?: number;
  registrationNumber?: string;
  constructionYear?: number;
  assets: Asset[];
  createdAt: string;
  updatedAt: string;
}
