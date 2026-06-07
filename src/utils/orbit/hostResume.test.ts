import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeInitialOrbitState, type OrbitQueueItem, type OrbitState } from '../../api/orbit';
import { suggestionKey } from './helpers';

const { authState, playerState } = vi.hoisted(() => ({
  authState: { username: 'bob' as string | undefined },
  playerState: {
    queueItems: [] as { serverId: string; trackId: string }[],
    currentTrack: null as { id: string } | null,
  },
}));

const remote = vi.hoisted(() => ({
  findSessionPlaylistId: vi.fn(),
  readOrbitState: vi.fn(),
  writeOrbitHeartbeat: vi.fn(),
  writeOrbitState: vi.fn(),
}));
const playlists = vi.hoisted(() => ({
  createPlaylist: vi.fn(),
  getPlaylists: vi.fn(),
  deletePlaylist: vi.fn(),
}));

vi.mock('./remote', () => remote);
vi.mock('../../api/subsonicPlaylists', () => playlists);
vi.mock('../../api/subsonicLibrary', () => ({ getSong: vi.fn() }));
vi.mock('../playback/songToTrack', () => ({ songToTrack: vi.fn() }));
vi.mock('./lastSession', () => ({
  persistCurrentOrbitSession: vi.fn(),
  clearOrbitLastSession: vi.fn(),
}));
vi.mock('../../store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      getActiveServer: () => (authState.username ? { username: authState.username } : undefined),
    }),
  },
}));
vi.mock('../../store/playerStore', () => ({
  usePlayerStore: { getState: () => playerState },
}));

import { resumeOrbitSessionAsHost } from './host';
import { useOrbitStore } from '../../store/orbitStore';

function buildState(over: Partial<OrbitState> = {}): OrbitState {
  return { ...makeInitialOrbitState({ sid: 'feedface', host: 'bob', name: 'Night Run' }), ...over };
}
const q = (trackId: string, addedBy = 'carol', addedAt = 1000): OrbitQueueItem => ({ trackId, addedBy, addedAt });

beforeEach(() => {
  vi.clearAllMocks();
  useOrbitStore.getState().reset();
  authState.username = 'bob';
  playerState.queueItems = [];
  playerState.currentTrack = null;
  remote.findSessionPlaylistId.mockResolvedValue('pl-1');
  remote.writeOrbitHeartbeat.mockResolvedValue(undefined);
  playlists.getPlaylists.mockResolvedValue([]);
  playlists.createPlaylist.mockResolvedValue({ id: 'ob-1' });
});

describe('resumeOrbitSessionAsHost', () => {
  it('rebinds the store as host and marks already-queued suggestions as merged', async () => {
    const q1 = q('t1');
    const q2 = q('t2', 'dave', 2000);
    const q3 = q('t3', 'erin', 3000);
    remote.readOrbitState.mockResolvedValue(buildState({ queue: [q1, q2, q3] }));
    playerState.queueItems = [{ serverId: 's', trackId: 't1' }];
    playerState.currentTrack = { id: 't2' };

    const state = await resumeOrbitSessionAsHost('feedface');

    const bound = useOrbitStore.getState();
    expect(bound.role).toBe('host');
    expect(bound.sessionId).toBe('feedface');
    expect(bound.phase).toBe('active');
    // t1 (in queue) + t2 (current track) count as already handled; t3 does not.
    expect(bound.mergedSuggestionKeys).toEqual([suggestionKey(q1), suggestionKey(q2)]);
    expect(bound.mergedSuggestionKeys).not.toContain(suggestionKey(q3));
    expect(state.host).toBe('bob');
    expect(remote.writeOrbitHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing outbox instead of creating a duplicate', async () => {
    remote.readOrbitState.mockResolvedValue(buildState());
    playlists.getPlaylists.mockResolvedValue([
      { id: 'ob-existing', name: '__psyorbit_feedface_from_bob__' },
    ]);

    await resumeOrbitSessionAsHost('feedface');

    expect(playlists.createPlaylist).not.toHaveBeenCalled();
    expect(useOrbitStore.getState().outboxPlaylistId).toBe('ob-existing');
  });

  it('throws and stays idle when the session is gone', async () => {
    remote.findSessionPlaylistId.mockResolvedValue(null);
    await expect(resumeOrbitSessionAsHost('feedface')).rejects.toThrow();
    expect(useOrbitStore.getState().role).toBeNull();
    expect(useOrbitStore.getState().phase).toBe('idle');
  });

  it('throws when the session has ended', async () => {
    remote.readOrbitState.mockResolvedValue(buildState({ ended: true }));
    await expect(resumeOrbitSessionAsHost('feedface')).rejects.toThrow();
    expect(useOrbitStore.getState().phase).toBe('idle');
  });

  it('throws when we are not the session host', async () => {
    remote.readOrbitState.mockResolvedValue(buildState({ host: 'someone-else' }));
    await expect(resumeOrbitSessionAsHost('feedface')).rejects.toThrow();
    expect(useOrbitStore.getState().role).toBeNull();
  });

  it('throws when there is no active user', async () => {
    authState.username = undefined;
    await expect(resumeOrbitSessionAsHost('feedface')).rejects.toThrow();
  });
});
