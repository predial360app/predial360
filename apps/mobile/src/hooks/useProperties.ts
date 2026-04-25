import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import {
  propertiesService,
  type CreateAssetPayload,
  type CreatePropertyPayload,
  type PropertyWithScore,
  type QrCodeResponse,
} from '../services/properties.service';
import type { PaginatedResponse, Property } from '@predial360/shared';

// ── Query keys ────────────────────────────────────────────────────────────────

export const propertyKeys = {
  all: ['properties'] as const,
  lists: () => [...propertyKeys.all, 'list'] as const,
  detail: (id: string) => [...propertyKeys.all, 'detail', id] as const,
  assets: (propertyId: string) => [...propertyKeys.all, 'assets', propertyId] as const,
  qrCode: (assetId: string) => [...propertyKeys.all, 'qrcode', assetId] as const,
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useProperties(params?: {
  page?: number;
  perPage?: number;
  search?: string;
}): UseQueryResult<PaginatedResponse<Property>> {
  return useQuery({
    queryKey: [...propertyKeys.lists(), params],
    queryFn: () => propertiesService.list(params),
    staleTime: 2 * 60 * 1000, // 2 min
  });
}

export function useProperty(id: string): UseQueryResult<PropertyWithScore> {
  return useQuery({
    queryKey: propertyKeys.detail(id),
    queryFn: () => propertiesService.getById(id),
    enabled: !!id,
    staleTime: 60 * 1000, // 1 min
  });
}

export function usePropertyAssets(propertyId: string, category?: string) {
  return useQuery({
    queryKey: [...propertyKeys.assets(propertyId), category],
    queryFn: () => propertiesService.listAssets(propertyId, category),
    enabled: !!propertyId,
  });
}

export function useAssetQrCode(assetId: string): UseQueryResult<QrCodeResponse> {
  return useQuery({
    queryKey: propertyKeys.qrCode(assetId),
    queryFn: () => propertiesService.getAssetQrCode(assetId),
    enabled: !!assetId,
    staleTime: 10 * 60 * 1000, // 10 min — QR Code muda raramente
  });
}

export function useCreateProperty(): UseMutationResult<Property, Error, CreatePropertyPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePropertyPayload) => propertiesService.create(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: propertyKeys.lists() });
    },
  });
}

export function useAddAsset(): UseMutationResult<
  unknown,
  Error,
  { propertyId: string; payload: CreateAssetPayload }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ propertyId, payload }) => propertiesService.addAsset(propertyId, payload),
    onSuccess: (_data, { propertyId }) => {
      void queryClient.invalidateQueries({ queryKey: propertyKeys.assets(propertyId) });
      void queryClient.invalidateQueries({ queryKey: propertyKeys.detail(propertyId) });
    },
  });
}
