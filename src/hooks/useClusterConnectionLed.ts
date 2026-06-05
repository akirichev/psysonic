import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConnectionStatus } from './useConnectionStatus';
import type { ServerCluster } from '../utils/serverCluster/types';
import {
  buildClusterMemberStatusTooltip,
  clusterLedStatusFromDiagnostics,
  getClusterMergeDiagnostics,
  type ClusterMergeDiagnostics,
} from '../utils/serverCluster/clusterMergeStatus';

/** Cluster-mode LED state derived from all member probes (not representative only). */
export function useClusterConnectionLed(activeCluster: ServerCluster | null): {
  ledStatus: ConnectionStatus | null;
  ledTooltip: string | null;
} {
  const { t } = useTranslation();
  const [diag, setDiag] = useState<ClusterMergeDiagnostics | null>(null);
  const [probing, setProbing] = useState(false);

  const refresh = useCallback(async () => {
    if (!activeCluster) {
      setDiag(null);
      return;
    }
    setProbing(true);
    try {
      const next = await getClusterMergeDiagnostics(activeCluster, { probeMembers: true });
      setDiag(next);
    } catch {
      setDiag(null);
    } finally {
      setProbing(false);
    }
  }, [activeCluster]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  if (!activeCluster) {
    return { ledStatus: null, ledTooltip: null };
  }

  if (probing && !diag) {
    return { ledStatus: 'checking', ledTooltip: t('connection.checking') };
  }

  const resolved = diag ?? { members: [], mergeCount: 0, totalCount: 0 };
  const ledStatus = clusterLedStatusFromDiagnostics(resolved);
  const ledTooltip = buildClusterMemberStatusTooltip(t, resolved) || null;
  return { ledStatus, ledTooltip };
}
