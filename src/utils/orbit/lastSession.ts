import { useOrbitStore, type OrbitRole } from '../../store/orbitStore';
import { useAuthStore } from '../../store/authStore';

/**
 * Orbit — last-session breadcrumb (survives an app restart).
 *
 * The Orbit store itself is intentionally in-memory only (see orbitStore.ts):
 * a session is transient and we never resurrect a stale local mirror. This
 * module persists the one small thing we *do* need across a restart — enough
 * to recognise "this client was in session X (as host/guest) on server Y" and
 * offer a one-click rejoin on next launch.
 *
 * Written on host-start / guest-join, wiped on any clean exit (host end, guest
 * leave, kick/remove/host-timeout, or the user declining the reconnect prompt).
 * A process crash / force-quit leaves it in place — that's exactly the case the
 * reconnect prompt exists for.
 */

const STORAGE_KEY = 'psysonic_orbit_last_session';

export interface OrbitLastSession {
  /** Session id (8 hex). */
  sid: string;
  /** Navidrome playlist id of the canonical session playlist. */
  sessionPlaylistId: string;
  /** Navidrome playlist id of our own outbox. */
  outboxPlaylistId: string;
  /** Our role in the session. */
  role: OrbitRole;
  /** Human-readable session name (for the reconnect prompt copy). */
  sessionName: string;
  /** Host's Navidrome username (for the reconnect prompt copy). */
  hostUsername: string;
  /** Active server id at save time — reconnect is only offered on the same server. */
  serverId: string;
  /** Wall-clock ms the breadcrumb was written. */
  savedAt: number;
}

export function saveOrbitLastSession(rec: OrbitLastSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
  } catch {
    /* quota / disabled storage — non-fatal, we just won't offer reconnect */
  }
}

export function readOrbitLastSession(): OrbitLastSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<OrbitLastSession>;
    if (
      typeof o?.sid === 'string' &&
      typeof o.sessionPlaylistId === 'string' &&
      typeof o.outboxPlaylistId === 'string' &&
      (o.role === 'host' || o.role === 'guest') &&
      typeof o.sessionName === 'string' &&
      typeof o.hostUsername === 'string' &&
      typeof o.serverId === 'string' &&
      typeof o.savedAt === 'number'
    ) {
      return o as OrbitLastSession;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Cheap sid-only read, used by the app-start orphan sweep to protect a
 * pending-reconnect session from deletion regardless of effect ordering.
 */
export function readOrbitLastSessionSid(): string | null {
  return readOrbitLastSession()?.sid ?? null;
}

export function clearOrbitLastSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

/**
 * Snapshot the currently-bound session into the breadcrumb. Called right after
 * a host-start / guest-join binds the store. No-op unless a session is fully
 * bound and an active server id is known.
 */
export function persistCurrentOrbitSession(): void {
  const s = useOrbitStore.getState();
  if (!s.role || !s.sessionId || !s.sessionPlaylistId || !s.outboxPlaylistId || !s.state) return;
  const serverId = useAuthStore.getState().activeServerId;
  if (!serverId) return;
  saveOrbitLastSession({
    sid: s.sessionId,
    sessionPlaylistId: s.sessionPlaylistId,
    outboxPlaylistId: s.outboxPlaylistId,
    role: s.role,
    sessionName: s.state.name,
    hostUsername: s.state.host,
    serverId,
    savedAt: Date.now(),
  });
}
