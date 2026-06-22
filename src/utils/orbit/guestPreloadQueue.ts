/**
 * Orbit guest — mirror the host's queue into the local playerStore queue so the
 * hot-cache prefetcher and crossfade preload have an upcoming track to warm.
 *
 * Why this exists: the prefetcher and crossfade derive "the next track" purely
 * from `playerStore.queueItems[queueIndex + 1]`. A guest used to load every
 * track as a single-item queue (`playTrack(track, [track])`), so that lookahead
 * was always empty → nothing was ever prefetched → each AutoDJ/crossfade switch
 * cold-fetched the next track over HTTP, stalling the transition and drifting
 * the guest off the host.
 *
 * The mirrored queue is **invisible** (the guest's UI renders
 * `OrbitGuestQueue` / `state.playQueue`, not `queueItems`) and **never drives
 * playback** — `runNext` no-ops auto-advance for guests, so the host stays the
 * sole driver. This is purely preload fodder.
 */

import type { OrbitState } from '../../api/orbit';
import type { QueueItemRef } from '../../store/playerStoreTypes';
import { usePlayerStore } from '../../store/playerStore';

/**
 * Build the local preload refs: the host's current track first, then its
 * upcoming queue. De-duplicates by trackId — a repeated id would make the
 * "next track" lookahead ambiguous and could prefetch the wrong entry.
 */
export function buildGuestPreloadRefs(
  hostTrackId: string,
  playQueue: ReadonlyArray<{ trackId: string }> | undefined,
  serverId: string,
): QueueItemRef[] {
  const seen = new Set<string>();
  const refs: QueueItemRef[] = [];
  for (const trackId of [hostTrackId, ...(playQueue ?? []).map(q => q.trackId)]) {
    if (seen.has(trackId)) continue;
    seen.add(trackId);
    refs.push({ serverId, trackId });
  }
  return refs;
}

function sameTrackIds(a: readonly QueueItemRef[], b: readonly QueueItemRef[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i].trackId !== b[i].trackId) return false;
  return true;
}

/**
 * Sync the guest's local queue to the host's. Race-free: only runs once the
 * guest is actually playing the host's current track, so it never fights an
 * in-flight `syncToHost` `playTrack`. Idempotent: writes only when the ref list
 * or index actually changed, so the 2.5 s poll doesn't re-render every tick.
 */
export function syncGuestPreloadQueue(state: OrbitState): void {
  const hostTrackId = state.currentTrack?.trackId;
  if (!hostTrackId) return;

  const player = usePlayerStore.getState();
  // Load still pending — let syncToHost land first; we mirror on the next tick.
  if (player.currentTrack?.id !== hostTrackId) return;

  // Reuse the already-pinned server key from the playing track's ref.
  const serverId = player.queueItems[0]?.serverId;
  if (!serverId) return;

  const refs = buildGuestPreloadRefs(hostTrackId, state.playQueue, serverId);
  if (player.queueIndex === 0 && sameTrackIds(player.queueItems, refs)) return;

  usePlayerStore.setState({ queueItems: refs, queueIndex: 0 });
}
