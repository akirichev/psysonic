import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeInitialOrbitState } from '../../api/orbit';

const { orbitState, authState } = vi.hoisted(() => ({
  orbitState: {
    role: null as 'host' | 'guest' | null,
    sessionId: null as string | null,
    sessionPlaylistId: null as string | null,
    outboxPlaylistId: null as string | null,
    state: null as ReturnType<typeof makeInitialOrbitState> | null,
  },
  authState: { activeServerId: null as string | null },
}));

vi.mock('../../store/orbitStore', () => ({
  useOrbitStore: { getState: () => orbitState },
}));
vi.mock('../../store/authStore', () => ({
  useAuthStore: { getState: () => authState },
}));

import {
  clearOrbitLastSession,
  persistCurrentOrbitSession,
  readOrbitLastSession,
  readOrbitLastSessionSid,
  saveOrbitLastSession,
  type OrbitLastSession,
} from './lastSession';

const sample: OrbitLastSession = {
  sid: 'deadbeef',
  sessionPlaylistId: 'pl-1',
  outboxPlaylistId: 'ob-1',
  role: 'guest',
  sessionName: 'Velvet Orbit',
  hostUsername: 'alice',
  serverId: 'srv-1',
  savedAt: 1700000000000,
};

beforeEach(() => {
  localStorage.clear();
  orbitState.role = null;
  orbitState.sessionId = null;
  orbitState.sessionPlaylistId = null;
  orbitState.outboxPlaylistId = null;
  orbitState.state = null;
  authState.activeServerId = null;
});

describe('orbit lastSession breadcrumb', () => {
  it('round-trips a saved record', () => {
    saveOrbitLastSession(sample);
    expect(readOrbitLastSession()).toEqual(sample);
    expect(readOrbitLastSessionSid()).toBe('deadbeef');
  });

  it('clears the record', () => {
    saveOrbitLastSession(sample);
    clearOrbitLastSession();
    expect(readOrbitLastSession()).toBeNull();
    expect(readOrbitLastSessionSid()).toBeNull();
  });

  it('returns null for a malformed / partial blob', () => {
    localStorage.setItem('psysonic_orbit_last_session', JSON.stringify({ sid: 'x' }));
    expect(readOrbitLastSession()).toBeNull();
  });

  it('returns null for a non-JSON value', () => {
    localStorage.setItem('psysonic_orbit_last_session', 'not json{');
    expect(readOrbitLastSession()).toBeNull();
  });

  it('persistCurrentOrbitSession snapshots a bound session', () => {
    orbitState.role = 'host';
    orbitState.sessionId = 'feedface';
    orbitState.sessionPlaylistId = 'pl-9';
    orbitState.outboxPlaylistId = 'ob-9';
    orbitState.state = makeInitialOrbitState({ sid: 'feedface', host: 'bob', name: 'Night Run' });
    authState.activeServerId = 'srv-7';

    persistCurrentOrbitSession();

    const rec = readOrbitLastSession();
    expect(rec).toMatchObject({
      sid: 'feedface',
      sessionPlaylistId: 'pl-9',
      outboxPlaylistId: 'ob-9',
      role: 'host',
      sessionName: 'Night Run',
      hostUsername: 'bob',
      serverId: 'srv-7',
    });
    expect(typeof rec?.savedAt).toBe('number');
  });

  it('persistCurrentOrbitSession is a no-op when no session is bound', () => {
    authState.activeServerId = 'srv-7';
    persistCurrentOrbitSession();
    expect(readOrbitLastSession()).toBeNull();
  });

  it('persistCurrentOrbitSession is a no-op without an active server', () => {
    orbitState.role = 'host';
    orbitState.sessionId = 'feedface';
    orbitState.sessionPlaylistId = 'pl-9';
    orbitState.outboxPlaylistId = 'ob-9';
    orbitState.state = makeInitialOrbitState({ sid: 'feedface', host: 'bob', name: 'Night Run' });
    persistCurrentOrbitSession();
    expect(readOrbitLastSession()).toBeNull();
  });
});
