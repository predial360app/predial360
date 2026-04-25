/**
 * Hook que monitora conectividade e expõe estado online/offline.
 * Dispara sync automático ao reconectar.
 */
import { useEffect, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { syncService } from '../services/sync.service';

interface NetworkState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: Date | null;
  pendingCount: number;
}

export function useNetworkSync(): NetworkState {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state: NetInfoState) => {
      const online = !!(state.isConnected && state.isInternetReachable);
      const wasOffline = !isOnline;

      setIsOnline(online);

      if (online && wasOffline) {
        setIsSyncing(true);
        try {
          const result = await syncService.syncAll();
          setPendingCount(result.failed);
          setLastSyncAt(new Date());
        } finally {
          setIsSyncing(false);
        }
      }
    });

    return unsubscribe;
  }, [isOnline]);

  return { isOnline, isSyncing, lastSyncAt, pendingCount };
}
