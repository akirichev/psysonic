import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrbitState } from '../../api/orbit';
import type { QueueItemRef } from '../../store/playerStoreTypes';

const { player, setState } = vi.hoisted(() => {
  const player = {
    currentTrack: null as { id: string } | null,
    queueItems: [] as QueueItemRef[],
    queueIndex: 0,
  };
  const setState = vi.fn((patch: Record<string, unknown>) => {
    Object.assign(player, patch);
  });
  return { player, setState };
});

vi.mock('../../store/playerStore', () => ({
  usePlayerStore: { getState: () => player, setState },
}));

import { buildGuestPreloadRefs, syncGuestPreloadQueue } from './guestPreloadQueue';

function orbit(over: Partial<OrbitState> = {}): OrbitState {
  return {
    currentTrack: { trackId: 't0', addedBy: 'host', addedAt: 0 },
    playQueue: [{ trackId: 't1', addedBy: 'host' }, { trackId: 't2', addedBy: 'guest' }],
    ...over,
  } as OrbitState;
}

beforeEach(() => {
  player.currentTrack = null;
  player.queueItems = [];
  player.queueIndex = 0;
  setState.mockClear();
});

describe('buildGuestPreloadRefs', () => {
  it('puts the host current track first, then the upcoming queue', () => {
    const refs = buildGuestPreloadRefs('t0', [{ trackId: 't1' }, { trackId: 't2' }], 'srv');
    expect(refs).toEqual([
      { serverId: 'srv', trackId: 't0' },
      { serverId: 'srv', trackId: 't1' },
      { serverId: 'srv', trackId: 't2' },
    ]);
  });

  it('de-dupes a track that is both current and in the upcoming queue', () => {
    const refs = buildGuestPreloadRefs('t0', [{ trackId: 't0' }, { trackId: 't1' }], 'srv');
    expect(refs.map(r => r.trackId)).toEqual(['t0', 't1']);
  });

  it('handles a missing/empty play queue', () => {
    expect(buildGuestPreloadRefs('t0', undefined, 'srv')).toEqual([{ serverId: 'srv', trackId: 't0' }]);
  });
});

describe('syncGuestPreloadQueue', () => {
  it('mirrors the host queue once the guest is on the host track', () => {
    player.currentTrack = { id: 't0' };
    player.queueItems = [{ serverId: 'srv', trackId: 't0' }];
    syncGuestPreloadQueue(orbit());
    expect(setState).toHaveBeenCalledWith({
      queueItems: [
        { serverId: 'srv', trackId: 't0' },
        { serverId: 'srv', trackId: 't1' },
        { serverId: 'srv', trackId: 't2' },
      ],
      queueIndex: 0,
    });
  });

  it('does nothing while the track load is still pending (guest not yet on host track)', () => {
    player.currentTrack = { id: 'old' }; // host moved to t0, guest still on old
    player.queueItems = [{ serverId: 'srv', trackId: 'old' }];
    syncGuestPreloadQueue(orbit());
    expect(setState).not.toHaveBeenCalled();
  });

  it('does nothing when the queue is not server-pinned yet', () => {
    player.currentTrack = { id: 't0' };
    player.queueItems = []; // no ref to source the serverId from
    syncGuestPreloadQueue(orbit());
    expect(setState).not.toHaveBeenCalled();
  });

  it('is idempotent — no write when the mirror already matches', () => {
    player.currentTrack = { id: 't0' };
    player.queueItems = [
      { serverId: 'srv', trackId: 't0' },
      { serverId: 'srv', trackId: 't1' },
      { serverId: 'srv', trackId: 't2' },
    ];
    player.queueIndex = 0;
    syncGuestPreloadQueue(orbit());
    expect(setState).not.toHaveBeenCalled();
  });

  it('rewrites when the host queue changed', () => {
    player.currentTrack = { id: 't0' };
    player.queueItems = [
      { serverId: 'srv', trackId: 't0' },
      { serverId: 'srv', trackId: 't1' },
    ];
    syncGuestPreloadQueue(orbit({ playQueue: [{ trackId: 't1', addedBy: 'host' }, { trackId: 't9', addedBy: 'host' }] }));
    expect(setState).toHaveBeenCalledWith({
      queueItems: [
        { serverId: 'srv', trackId: 't0' },
        { serverId: 'srv', trackId: 't1' },
        { serverId: 'srv', trackId: 't9' },
      ],
      queueIndex: 0,
    });
  });

  it('does nothing when the host has no current track', () => {
    player.currentTrack = { id: 't0' };
    player.queueItems = [{ serverId: 'srv', trackId: 't0' }];
    syncGuestPreloadQueue(orbit({ currentTrack: null }));
    expect(setState).not.toHaveBeenCalled();
  });
});
