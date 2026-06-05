import { useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { isClusterMode } from '../utils/serverCluster/clusterScope';
import { serverListDisplayLabel } from '../utils/server/serverDisplayName';

/** Cluster member label for UI rows; null when not in cluster mode or server unknown. */
export function useClusterMemberDisplayLabel(serverId: string | undefined | null): string | null {
  const servers = useAuthStore(s => s.servers);
  return useMemo(() => {
    if (!isClusterMode() || !serverId?.trim()) return null;
    const server = servers.find(s => s.id === serverId);
    return server ? serverListDisplayLabel(server, servers) : serverId;
  }, [serverId, servers]);
}
