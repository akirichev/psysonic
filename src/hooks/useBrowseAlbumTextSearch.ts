import type { SubsonicAlbum } from '../api/subsonicTypes';
import { useEffect, useRef, useState } from 'react';
import {
  BROWSE_TEXT_DEBOUNCE_NETWORK_MS,
  BROWSE_TEXT_DEBOUNCE_RACE_MS,
  runLocalBrowseAlbums,
  runNetworkBrowseAlbums,
} from '../utils/library/browseTextSearch';
import { isClusterMultiLibraryScopeBrowse } from '../utils/serverCluster/clusterLibraryScopes';
import { isClusterMode } from '../utils/serverCluster/clusterScope';

/**
 * Debounced album title search with local-vs-network race when the
 * library index is enabled; network-only when it is not.
 */
export function useBrowseAlbumTextSearch(
  filter: string,
  indexEnabled: boolean,
  serverId: string | null | undefined,
  losslessOnly = false,
  musicLibraryFilterVersion = 0,
) {
  const [debouncedFilter, setDebouncedFilter] = useState('');
  const [textSearchAlbums, setTextSearchAlbums] = useState<SubsonicAlbum[] | null>(null);
  const [textSearchLoading, setTextSearchLoading] = useState(false);
  const searchGenRef = useRef(0);

  useEffect(() => {
    const ms = indexEnabled ? BROWSE_TEXT_DEBOUNCE_RACE_MS : BROWSE_TEXT_DEBOUNCE_NETWORK_MS;
    const timer = window.setTimeout(() => setDebouncedFilter(filter.trim()), ms);
    return () => window.clearTimeout(timer);
  }, [filter, indexEnabled]);

  useEffect(() => {
    const q = debouncedFilter;
    if (!q || !serverId) {
      setTextSearchAlbums(null);
      setTextSearchLoading(false);
      return;
    }

    const gen = ++searchGenRef.current;
    const isStale = () => gen !== searchGenRef.current;
    setTextSearchLoading(true);

    void (async () => {
      if (!indexEnabled) {
        const albums = await runNetworkBrowseAlbums(q);
        if (isStale()) return;
        setTextSearchAlbums(albums);
        setTextSearchLoading(false);
        return;
      }

      const skipReadyCheck = isClusterMode() || isClusterMultiLibraryScopeBrowse();
      const localAlbums = await runLocalBrowseAlbums(
        serverId,
        q,
        undefined,
        losslessOnly,
        skipReadyCheck,
      );
      if (isStale()) return;
      if (localAlbums != null) {
        setTextSearchAlbums(localAlbums);
        setTextSearchLoading(false);
        return;
      }

      const networkAlbums = await runNetworkBrowseAlbums(q);
      if (isStale()) return;
      setTextSearchAlbums(networkAlbums);
      setTextSearchLoading(false);
    })();
  }, [debouncedFilter, indexEnabled, serverId, losslessOnly, musicLibraryFilterVersion]);

  const effectiveFilter = textSearchAlbums != null ? '' : filter;
  return { textSearchAlbums, textSearchLoading, effectiveFilter };
}
