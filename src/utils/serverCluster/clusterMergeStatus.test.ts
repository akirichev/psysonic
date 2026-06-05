import { describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import {
  buildClusterConnectionTooltip,
  buildClusterMemberStatusTooltip,
  clusterLedStatusFromDiagnostics,
  type ClusterMergeDiagnostics,
} from './clusterMergeStatus';

describe('clusterLedStatusFromDiagnostics', () => {
  it('returns disconnected when no members merge', () => {
    const diag: ClusterMergeDiagnostics = {
      members: [{ serverId: 'a', label: 'A', included: false, reason: 'unreachable' }],
      mergeCount: 0,
      totalCount: 1,
    };
    expect(clusterLedStatusFromDiagnostics(diag)).toBe('disconnected');
  });

  it('returns degraded when some members merge', () => {
    const diag: ClusterMergeDiagnostics = {
      members: [
        { serverId: 'a', label: 'A', included: true },
        { serverId: 'b', label: 'B', included: false, reason: 'unreachable' },
      ],
      mergeCount: 1,
      totalCount: 2,
    };
    expect(clusterLedStatusFromDiagnostics(diag)).toBe('degraded');
  });

  it('returns connected when all members merge', () => {
    const diag: ClusterMergeDiagnostics = {
      members: [{ serverId: 'a', label: 'A', included: true }],
      mergeCount: 1,
      totalCount: 1,
    };
    expect(clusterLedStatusFromDiagnostics(diag)).toBe('connected');
  });
});

describe('buildClusterMemberStatusTooltip', () => {
  const t = vi.fn((key: string, opts?: Record<string, unknown>) => {
    if (key === 'cluster.memberStatusAvailable') return `${opts?.name}: ok`;
    if (key === 'cluster.memberStatusOffline') return `${opts?.name}: offline`;
    if (key === 'cluster.memberStatusIndexing') return `${opts?.name}: indexing`;
    return key;
  }) as unknown as TFunction;

  it('lists every member on separate lines', () => {
    const diag: ClusterMergeDiagnostics = {
      members: [
        { serverId: 'a', label: 'A', included: true },
        { serverId: 'b', label: 'B', included: false, reason: 'unreachable' },
        { serverId: 'c', label: 'C', included: false, reason: 'indexing' },
      ],
      mergeCount: 1,
      totalCount: 3,
    };
    expect(buildClusterMemberStatusTooltip(t, diag)).toBe(
      'A: ok\nB: offline\nC: indexing',
    );
  });

  it('returns empty when there are no members', () => {
    expect(buildClusterMemberStatusTooltip(t, { members: [], mergeCount: 0, totalCount: 0 })).toBe('');
  });
});

describe('buildClusterConnectionTooltip', () => {
  const t = vi.fn((key: string, opts?: Record<string, unknown>) => {
    if (key === 'cluster.memberStatusOffline') return `${opts?.name}: offline`;
    if (key === 'cluster.connectionTooltipNone') return `None: ${opts?.details}`;
    if (key === 'cluster.connectionTooltipPartial') {
      return `${opts?.available}/${opts?.total}: ${opts?.details}`;
    }
    return key;
  }) as unknown as TFunction;

  it('returns empty when all included', () => {
    const diag: ClusterMergeDiagnostics = {
      members: [{ serverId: 'a', label: 'A', included: true }],
      mergeCount: 1,
      totalCount: 1,
    };
    expect(buildClusterConnectionTooltip(t, diag)).toBe('');
  });

  it('builds partial tooltip with member details', () => {
    const diag: ClusterMergeDiagnostics = {
      members: [
        { serverId: 'a', label: 'A', included: true },
        { serverId: 'b', label: 'B', included: false, reason: 'unreachable' },
      ],
      mergeCount: 1,
      totalCount: 2,
    };
    expect(buildClusterConnectionTooltip(t, diag)).toBe('1/2: B: offline');
  });

  it('builds none tooltip when mergeCount is zero', () => {
    const diag: ClusterMergeDiagnostics = {
      members: [{ serverId: 'a', label: 'A', included: false, reason: 'unreachable' }],
      mergeCount: 0,
      totalCount: 1,
    };
    expect(buildClusterConnectionTooltip(t, diag)).toBe('None: A: offline');
  });
});
