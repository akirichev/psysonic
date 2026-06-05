import { libraryIsReady } from '../library/libraryReady';
import { ensureConnectUrlResolved } from '../server/serverEndpoint';
import { serverListDisplayLabel } from '../server/serverDisplayName';
import { getClusterMemberProfiles } from './clusterScope';
import { isServerLikelyReachable } from './representative';
import type { ServerCluster } from './types';
import type { TFunction } from 'i18next';
import type { ConnectionStatus } from '../../hooks/useConnectionStatus';

export type ClusterMemberExcludeReason = 'unreachable' | 'indexing';

export interface ClusterMemberStatus {
  serverId: string;
  label: string;
  included: boolean;
  reason?: ClusterMemberExcludeReason;
}

export interface ClusterMergeDiagnostics {
  members: ClusterMemberStatus[];
  mergeCount: number;
  totalCount: number;
}

/** Per-member merge eligibility (spec §4 exclusion rules). */
export async function getClusterMergeDiagnostics(
  cluster: ServerCluster,
  options?: { probeMembers?: boolean },
): Promise<ClusterMergeDiagnostics> {
  const profiles = getClusterMemberProfiles(cluster);
  const members: ClusterMemberStatus[] = [];
  let mergeCount = 0;
  for (const p of profiles) {
    if (options?.probeMembers) {
      await ensureConnectUrlResolved(p);
    }
    const label = serverListDisplayLabel(p, profiles);
    if (!isServerLikelyReachable(p.id)) {
      members.push({ serverId: p.id, label, included: false, reason: 'unreachable' });
      continue;
    }
    if (!(await libraryIsReady(p.id))) {
      members.push({ serverId: p.id, label, included: false, reason: 'indexing' });
      continue;
    }
    members.push({ serverId: p.id, label, included: true });
    mergeCount += 1;
  }
  return { members, mergeCount, totalCount: profiles.length };
}

export function formatExcludedMemberLabels(
  members: ClusterMemberStatus[],
): string {
  return members
    .filter(m => !m.included)
    .map(m => {
      const suffix = m.reason === 'indexing' ? ' (indexing)' : ' (offline)';
      return `${m.label}${suffix}`;
    })
    .join(', ');
}

/** LED color for cluster scope: green = all members merge-ready, yellow = partial, red = none. */
export function clusterLedStatusFromDiagnostics(diag: ClusterMergeDiagnostics): ConnectionStatus {
  if (diag.totalCount === 0 || diag.mergeCount === 0) return 'disconnected';
  if (diag.mergeCount < diag.totalCount) return 'degraded';
  return 'connected';
}

function memberStatusLine(t: TFunction, member: ClusterMemberStatus): string {
  if (member.included) {
    return t('cluster.memberStatusAvailable', { name: member.label });
  }
  if (member.reason === 'indexing') {
    return t('cluster.memberStatusIndexing', { name: member.label });
  }
  return t('cluster.memberStatusOffline', { name: member.label });
}

/** Hover tooltip for the cluster connection LED — one line per member. */
export function buildClusterMemberStatusTooltip(
  t: TFunction,
  diag: ClusterMergeDiagnostics,
): string {
  if (diag.members.length === 0) return '';
  return diag.members.map(m => memberStatusLine(t, m)).join('\n');
}

/** @deprecated Prefer {@link buildClusterMemberStatusTooltip} for LED hover. */
export function buildClusterConnectionTooltip(
  t: TFunction,
  diag: ClusterMergeDiagnostics,
): string {
  const excluded = diag.members.filter(m => !m.included);
  if (excluded.length === 0) return '';
  const details = excluded.map(m => memberStatusLine(t, m)).join(' · ');
  if (diag.mergeCount === 0) {
    return t('cluster.connectionTooltipNone', { details });
  }
  return t('cluster.connectionTooltipPartial', {
    available: diag.mergeCount,
    total: diag.totalCount,
    details,
  });
}
