import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeInitialOrbitState } from '../../api/orbit';

const playlists = vi.hoisted(() => ({ getPlaylists: vi.fn(), deletePlaylist: vi.fn() }));
const lastSession = vi.hoisted(() => ({ readOrbitLastSessionSid: vi.fn() }));
const orbitStoreState = vi.hoisted(() => ({ sessionId: null as string | null }));

vi.mock('../../api/subsonicPlaylists', () => playlists);
vi.mock('../../store/authStore', () => ({
  useAuthStore: { getState: () => ({ getActiveServer: () => ({ username: 'bob' }) }) },
}));
vi.mock('../../store/orbitStore', () => ({
  useOrbitStore: { getState: () => orbitStoreState },
}));
vi.mock('./lastSession', () => lastSession);

import { cleanupOrphanedOrbitPlaylists } from './cleanup';

function sessionComment(sid: string, ageMs = 0): string {
  const s = makeInitialOrbitState({ sid, host: 'bob', name: 'X' });
  return JSON.stringify({ ...s, positionAt: Date.now() - ageMs });
}
const pl = (name: string, comment: string | undefined, id = name) => ({
  id, name, owner: 'bob', comment, changed: undefined as string | undefined,
});

beforeEach(() => {
  vi.clearAllMocks();
  orbitStoreState.sessionId = null;
  lastSession.readOrbitLastSessionSid.mockReturnValue(null);
  playlists.deletePlaylist.mockResolvedValue(undefined);
});

describe('cleanupOrphanedOrbitPlaylists', () => {
  it('does not prune a live session protected by the reconnect breadcrumb', async () => {
    // Regression: the bare session name (`__psyorbit_<sid>__`) must match the
    // regex so the sid-skip is reached. A mis-anchored regex treated it as
    // corrupt and deleted it before the breadcrumb guard — killing reconnect.
    lastSession.readOrbitLastSessionSid.mockReturnValue('aaaa1111');
    playlists.getPlaylists.mockResolvedValue([
      pl('__psyorbit_aaaa1111__', sessionComment('aaaa1111', 60 * 60_000)),
      pl('__psyorbit_aaaa1111_from_bob__', JSON.stringify({ ts: Date.now() - 60 * 60_000 })),
    ]);

    const deleted = await cleanupOrphanedOrbitPlaylists();

    expect(deleted).toBe(0);
    expect(playlists.deletePlaylist).not.toHaveBeenCalled();
  });

  it('recognises a fresh session playlist instead of pruning the bare name', async () => {
    playlists.getPlaylists.mockResolvedValue([
      pl('__psyorbit_bbbb2222__', sessionComment('bbbb2222', 0)),
    ]);
    const deleted = await cleanupOrphanedOrbitPlaylists();
    expect(deleted).toBe(0);
    expect(playlists.deletePlaylist).not.toHaveBeenCalled();
  });

  it('prunes a stale, unprotected session', async () => {
    playlists.getPlaylists.mockResolvedValue([
      pl('__psyorbit_cccc3333__', sessionComment('cccc3333', 60 * 60_000)),
    ]);
    const deleted = await cleanupOrphanedOrbitPlaylists();
    expect(deleted).toBe(1);
    expect(playlists.deletePlaylist).toHaveBeenCalledWith('__psyorbit_cccc3333__');
  });

  it('prunes a corrupt / unrecognised orbit name', async () => {
    playlists.getPlaylists.mockResolvedValue([
      pl('__psyorbit_not-hex-no-suffix', undefined),
    ]);
    const deleted = await cleanupOrphanedOrbitPlaylists();
    expect(deleted).toBe(1);
  });
});
