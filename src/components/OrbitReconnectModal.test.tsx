import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeInitialOrbitState } from '../api/orbit';

const { authState, orbitState, orbitApi } = vi.hoisted(() => ({
  authState: { isLoggedIn: true, activeServerId: 'srv-1' as string | null, username: 'bob' as string | undefined },
  orbitState: { role: null as 'host' | 'guest' | null },
  orbitApi: {
    readOrbitLastSession: vi.fn(),
    findSessionPlaylistId: vi.fn(),
    readOrbitState: vi.fn(),
    clearOrbitLastSession: vi.fn(),
    resumeOrbitSessionAsHost: vi.fn(),
    joinOrbitSession: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('../store/authStore', () => {
  const hook = (sel: (s: typeof authState) => unknown) => sel(authState);
  (hook as unknown as { getState: () => unknown }).getState = () => ({
    ...authState,
    getActiveServer: () => (authState.username ? { username: authState.username } : undefined),
  });
  return { useAuthStore: hook };
});
vi.mock('../store/orbitStore', () => {
  const hook = (sel: (s: typeof orbitState) => unknown) => sel(orbitState);
  (hook as unknown as { getState: () => unknown }).getState = () => orbitState;
  return { useOrbitStore: hook };
});
vi.mock('../utils/ui/toast', () => ({ showToast: vi.fn() }));
vi.mock('../utils/orbit', () => ({
  ...orbitApi,
  ORBIT_RECONNECT_COUNTDOWN_S: 30,
  ORBIT_RECONNECT_MAX_AGE_MS: 30 * 60_000,
}));

import OrbitReconnectModal from './OrbitReconnectModal';

const hostBreadcrumb = {
  sid: 'feedface',
  sessionPlaylistId: 'pl-1',
  outboxPlaylistId: 'ob-1',
  role: 'host' as const,
  sessionName: 'Night Run',
  hostUsername: 'bob',
  serverId: 'srv-1',
  savedAt: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.isLoggedIn = true;
  authState.activeServerId = 'srv-1';
  authState.username = 'bob';
  orbitState.role = null;
  orbitApi.readOrbitLastSession.mockReturnValue(hostBreadcrumb);
  orbitApi.findSessionPlaylistId.mockResolvedValue('pl-1');
  orbitApi.readOrbitState.mockResolvedValue(
    makeInitialOrbitState({ sid: 'feedface', host: 'bob', name: 'Night Run' }),
  );
});

describe('OrbitReconnectModal', () => {
  // Regression: StrictMode double-invokes effects (mount → cleanup → mount).
  // The old one-shot guard let the cancelled first run block the second, so the
  // prompt never appeared in dev builds. This must survive the double-invoke.
  it('shows the reconnect prompt under StrictMode for a live host session', async () => {
    render(
      <StrictMode>
        <OrbitReconnectModal />
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(orbitApi.clearOrbitLastSession).not.toHaveBeenCalled();
  });

  it('does not prompt when the breadcrumb is for a different server', async () => {
    authState.activeServerId = 'other-server';
    render(
      <StrictMode>
        <OrbitReconnectModal />
      </StrictMode>,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(orbitApi.findSessionPlaylistId).not.toHaveBeenCalled();
  });

  it('wipes the breadcrumb and stays silent when the session is gone', async () => {
    orbitApi.findSessionPlaylistId.mockResolvedValue(null);
    render(
      <StrictMode>
        <OrbitReconnectModal />
      </StrictMode>,
    );
    await waitFor(() => expect(orbitApi.clearOrbitLastSession).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not prompt while already bound to a session', async () => {
    orbitState.role = 'host';
    render(
      <StrictMode>
        <OrbitReconnectModal />
      </StrictMode>,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(orbitApi.findSessionPlaylistId).not.toHaveBeenCalled();
  });
});
