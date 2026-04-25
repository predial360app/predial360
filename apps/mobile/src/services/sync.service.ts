/**
 * SyncService — sincroniza dados offline (WatermelonDB) com a API.
 * Estratégia: fila local → upload foto → PATCH API → marcar isSynced=true.
 * Chamado automaticamente ao detectar conexão de rede.
 */
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';

import { database } from '../database';
import type ChecklistItem from '../database/models/ChecklistItem';
import { apiClient } from '../lib/api-client';

interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

class SyncService {
  private isSyncing = false;

  /** Inicia listener de rede — sincroniza automaticamente ao reconectar */
  startNetworkListener(): () => void {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        void this.syncAll();
      }
    });
    return unsubscribe;
  }

  /** Sincroniza todos os itens pendentes */
  async syncAll(): Promise<SyncResult> {
    if (this.isSyncing) return { synced: 0, failed: 0, errors: ['Sync já em andamento.'] };

    this.isSyncing = true;
    const result: SyncResult = { synced: 0, failed: 0, errors: [] };

    try {
      await this.syncChecklists(result);
      await this.syncChecklistItems(result);
    } finally {
      this.isSyncing = false;
    }

    if (result.synced > 0) {
      console.warn(`[Sync] Completo: ${result.synced} item(s) sincronizado(s).`);
    }

    return result;
  }

  // ── Sync checklists não sincronizados ─────────────────────────────────────

  private async syncChecklists(result: SyncResult): Promise<void> {
    const checklists = await database.collections
      .get<import('../database/models/Checklist').default>('checklists')
      .query()
      .fetch();

    const unsynced = checklists.filter((c) => !c.isSynced);

    for (const checklist of unsynced) {
      try {
        const items = await checklist.items.fetch();
        const payload = {
          serviceOrderId: checklist.serviceOrderId,
          technicianId: checklist.technicianId,
          title: checklist.title,
          applicableNorms: checklist.applicableNorms,
          completedAt: checklist.completedAt?.toISOString(),
          isOfflineSynced: true,
          items: items.map((i) => ({
            localId: i.id,
            order: i.orderIndex,
            title: i.title,
            status: i.status,
            technicianNote: i.technicianNote,
            measurementValue: i.measurementValue,
            measurementUnit: i.measurementUnit,
            measurementInRange: i.measurementInRange,
          })),
        };

        const { data } = await apiClient.post<{ id: string }>('/checklists', payload);

        await database.write(async () => {
          await checklist.update((c) => {
            c.remoteId = data.id;
            c.isSynced = true;
          });
        });

        result.synced++;
      } catch (err) {
        result.failed++;
        result.errors.push(`Checklist ${checklist.id}: ${String(err)}`);
      }
    }
  }

  // ── Sync itens — inclui upload de fotos ───────────────────────────────────

  private async syncChecklistItems(result: SyncResult): Promise<void> {
    const items = await database.collections
      .get<ChecklistItem>('checklist_items')
      .query()
      .fetch();

    const unsynced = items.filter((i) => !i.isSynced && i.checklistRemoteId);

    for (const item of unsynced) {
      try {
        // Upload de fotos locais para S3
        const s3Urls = await this.uploadPhotos(item.photoUris);

        if (item.remoteId) {
          // Item já existe na API — apenas atualiza
          await apiClient.patch(`/checklist-items/${item.remoteId}`, {
            status: item.status,
            technicianNote: item.technicianNote,
            photoUrls: s3Urls,
            measurementValue: item.measurementValue,
            measurementUnit: item.measurementUnit,
            measurementInRange: item.measurementInRange,
            gpsLatitude: item.gpsLatitude,
            gpsLongitude: item.gpsLongitude,
            completedAt: item.completedAt?.toISOString(),
          });
        }

        await database.write(async () => {
          await item.update((i) => {
            i.photoS3UrlsJson = JSON.stringify(s3Urls);
            i.isSynced = true;
          });
        });

        result.synced++;
      } catch (err) {
        result.failed++;
        result.errors.push(`Item ${item.id}: ${String(err)}`);
      }
    }
  }

  // ── Upload de foto local → S3 via API ────────────────────────────────────

  private async uploadPhotos(localUris: string[]): Promise<string[]> {
    if (!localUris.length) return [];

    const s3Urls: string[] = [];

    for (const uri of localUris) {
      try {
        // Ler arquivo como base64
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const { data } = await apiClient.post<{ url: string }>('/storage/upload', {
          base64,
          mimeType: 'image/jpeg',
          folder: 'checklists',
        });

        s3Urls.push(data.url);
      } catch {
        // Foto falhou — continua sem ela (não bloqueia o sync)
        console.warn(`[Sync] Falha no upload da foto: ${uri}`);
      }
    }

    return s3Urls;
  }
}

export const syncService = new SyncService();
