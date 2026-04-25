import { apiClient } from '../lib/api-client';
import type {
  Property,
  PaginatedResponse,
  ApiResponse,
} from '@predial360/shared';

export interface PropertyWithScore extends Property {
  healthScore: {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    breakdown: {
      maintenanceCompliance: number;
      openNonConformities: number;
      contractActive: boolean;
      buildingAge: number;
    };
    alerts: string[];
  };
}

export interface CreatePropertyPayload {
  name: string;
  type: 'RESIDENTIAL' | 'CLINIC' | 'COMMERCE' | 'MIXED';
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  latitude?: number;
  longitude?: number;
  buildingAge?: number;
  totalArea?: number;
  floors?: number;
  constructionYear?: number;
  description?: string;
}

export interface CreateAssetPayload {
  name: string;
  category: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  installationDate?: string;
  warrantyExpiration?: string;
  maintenanceFrequency?: string;
  applicableNorms?: string[];
  notes?: string;
}

export interface QrCodeResponse {
  qrCodeDataUrl: string;
  qrCodePayload: string;
  assetId: string;
  assetName: string;
}

const BASE = '/properties';
const ASSETS = '/assets';

export const propertiesService = {
  create: async (payload: CreatePropertyPayload): Promise<Property> => {
    const { data } = await apiClient.post<Property>(BASE, payload);
    return data;
  },

  list: async (params?: {
    page?: number;
    perPage?: number;
    search?: string;
  }): Promise<PaginatedResponse<Property>> => {
    const { data } = await apiClient.get<PaginatedResponse<Property>>(BASE, { params });
    return data;
  },

  getById: async (id: string): Promise<PropertyWithScore> => {
    const { data } = await apiClient.get<PropertyWithScore>(`${BASE}/${id}`);
    return data;
  },

  update: async (id: string, payload: Partial<CreatePropertyPayload>): Promise<Property> => {
    const { data } = await apiClient.patch<Property>(`${BASE}/${id}`, payload);
    return data;
  },

  // ── Assets ─────────────────────────────────────────────────────────────────

  addAsset: async (propertyId: string, payload: CreateAssetPayload) => {
    const { data } = await apiClient.post(`${BASE}/${propertyId}/assets`, payload);
    return data;
  },

  listAssets: async (propertyId: string, category?: string) => {
    const { data } = await apiClient.get(`${BASE}/${propertyId}/assets`, {
      params: category ? { category } : undefined,
    });
    return data;
  },

  getAssetQrCode: async (assetId: string): Promise<QrCodeResponse> => {
    const { data } = await apiClient.get<QrCodeResponse>(`${ASSETS}/${assetId}/qrcode`);
    return data;
  },

  scanQrCode: async (qrCode: string) => {
    const { data } = await apiClient.get(`${ASSETS}/scan/${qrCode}`);
    return data;
  },
};
