import { useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { usePlayerStore } from '../store/playerStore';
import { getPlaybackServerId, resolveStreamServerIdForTrack } from '../utils/playback/playbackServer';

/**
 * Subsonic server that owns the current queue / stream (may differ from the browsed
 * server). When a track is playing, resolves the cluster member for that track.
 * Use for Now Playing metadata without calling `ensurePlaybackServerActive`.
 */
export function usePlaybackServerId(): string {
  const queueServerId = usePlayerStore(s => s.queueServerId);
  const queueLength = usePlayerStore(s => s.queueItems.length);
  const queueIndex = usePlayerStore(s => s.queueIndex);
  const queueRefServerId = usePlayerStore(s => s.queueItems[s.queueIndex]?.serverId);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const activeServerId = useAuthStore(s => s.activeServerId);
  return useMemo(
    () => (currentTrack
      ? resolveStreamServerIdForTrack(currentTrack, queueRefServerId)
      : getPlaybackServerId()),
    [currentTrack, queueRefServerId, queueServerId, queueLength, queueIndex, activeServerId],
  );
}
