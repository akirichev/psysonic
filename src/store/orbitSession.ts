import { useOrbitStore } from './orbitStore';

/**
 * True when the user is part of an Orbit session (any role, any phase short
 * of `idle` / `error` / `ended`). Used by `next()` and its async fallback
 * callbacks to suppress local queue-extension paths (radio top-up, infinite
 * queue, queue-exhausted refill) — those would either pop the
 * `orbitBulkGuard` modal or silently inject tracks the host didn't pick.
 * Also called inside in-flight `.then()` callbacks so a fetch scheduled
 * just before the user joined Orbit doesn't fire a `playTrack` after the
 * join.
 */
export function isInOrbitSession(): boolean {
  const o = useOrbitStore.getState();
  if (o.role !== 'host' && o.role !== 'guest') return false;
  return o.phase === 'active' || o.phase === 'joining' || o.phase === 'starting';
}

/**
 * True when this client is a *guest* in an Orbit session. The host drives every
 * track change; a guest must never advance through its queue on its own (it
 * only mirrors the host's queue locally as preload fodder for the hot cache).
 * `runNext` uses this to no-op the auto-advance — at track end the guest waits
 * for `syncToHost` to load the host's next track instead of skipping itself.
 */
export function isOrbitGuestSession(): boolean {
  const o = useOrbitStore.getState();
  return o.role === 'guest'
    && (o.phase === 'active' || o.phase === 'joining' || o.phase === 'starting');
}
