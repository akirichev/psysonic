import { useMemo } from 'react';
import { resolveCoverScopeForPlaybackTrack } from './ref';
import type { CoverArtHandle, CoverArtRef } from './types';
import { useCoverArt } from './useCoverArt';
import { useAuthStore } from '../store/authStore';
import { usePlayerStore } from '../store/playerStore';
import type { Track } from '../store/playerStoreTypes';

/** Cover art for playback queue — uses queue server when it differs from browsed server. */
export function usePlaybackCoverArt(
  coverRef: CoverArtRef | undefined,
  displayCssPx: number,
  track?: Pick<Track, 'clusterBrowseServerId'> | null,
): CoverArtHandle {
  const storeTrack = usePlayerStore(s => s.currentTrack);
  const resolvedTrack = track ?? storeTrack ?? null;
  const queueServerId = usePlayerStore(s => s.queueServerId);
  const queueIndex = usePlayerStore(s => s.queueIndex);
  const queueRefServerId = usePlayerStore(s => s.queueItems[s.queueIndex]?.serverId ?? null);
  const queueLength = usePlayerStore(s => s.queueItems.length);
  const activeServerId = useAuthStore(s => s.activeServerId);
  const serversFingerprint = useAuthStore(s =>
    s.servers
      .map(srv => `${srv.id}\u0001${srv.url}\u0001${srv.username}\u0001${srv.password}`)
      .join('\u0002'),
  );

  const scope = useMemo(
    () => resolveCoverScopeForPlaybackTrack(resolvedTrack, queueRefServerId),
    [
      resolvedTrack,
      resolvedTrack?.clusterBrowseServerId,
      queueRefServerId,
      queueServerId,
      queueIndex,
      queueLength,
      activeServerId,
      serversFingerprint,
    ],
  );
  const refWithScope = useMemo(
    () => (coverRef ? { ...coverRef, serverScope: scope } : null),
    [coverRef, scope],
  );
  return useCoverArt(refWithScope, displayCssPx, {
    surface: 'sparse',
  });
}
