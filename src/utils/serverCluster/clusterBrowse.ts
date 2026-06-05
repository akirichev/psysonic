/**
 * Cluster-mode browse helpers — merged index reads when `activeClusterId` is set.
 */
import {
  libraryClusterListAlbums,
  libraryClusterListArtists,
  libraryClusterListTracks,
  librarySearchCluster,
} from '../../api/library';
import { getActiveClusterId, isClusterMode } from './clusterScope';
import { getClusterMergeMemberIds } from './representative';
import { albumToAlbum, artistToArtist, trackToSong } from '../library/advancedSearchLocal';
import type { AlbumBrowsePageResult, AlbumBrowseQuery } from '../library/albumBrowseTypes';
import { albumBrowseHasServerFilters } from '../library/albumBrowseFilters';
import type { SubsonicArtist, SubsonicSong } from '../../api/subsonicTypes';

export async function resolveClusterBrowseMembers(): Promise<string[] | null> {
  if (!isClusterMode()) return null;
  const clusterId = getActiveClusterId();
  if (!clusterId) return null;
  const ids = await getClusterMergeMemberIds(clusterId);
  return ids.length > 0 ? ids : null;
}

export function canUseClusterAlbumBrowse(
  query: AlbumBrowseQuery,
  restrictAlbumIds?: string[],
): boolean {
  if (!isClusterMode()) return false;
  if (restrictAlbumIds != null) return false;
  if (albumBrowseHasServerFilters(query)) return false;
  if (query.compFilter !== 'all') return false;
  return true;
}

export async function clusterBrowseTracksPage(
  offset: number,
  pageSize: number,
): Promise<SubsonicSong[] | null> {
  const members = await resolveClusterBrowseMembers();
  if (!members) return null;
  try {
    const env = await libraryClusterListTracks({
      serversOrdered: members,
      limit: pageSize,
      offset,
    });
    return env.tracks.map(trackToSong);
  } catch {
    return null;
  }
}

export async function clusterBrowseAlbumsPage(
  offset: number,
  pageSize: number,
): Promise<AlbumBrowsePageResult | null> {
  const members = await resolveClusterBrowseMembers();
  if (!members) return null;
  try {
    const resp = await libraryClusterListAlbums({
      serversOrdered: members,
      limit: pageSize,
      offset,
    });
    return {
      albums: resp.albums.map(albumToAlbum),
      hasMore: resp.hasMore,
    };
  } catch {
    return null;
  }
}

export async function clusterBrowseArtistsPage(
  offset: number,
  pageSize: number,
): Promise<{ artists: SubsonicArtist[]; hasMore: boolean } | null> {
  const members = await resolveClusterBrowseMembers();
  if (!members) return null;
  try {
    const resp = await libraryClusterListArtists({
      serversOrdered: members,
      limit: pageSize,
      offset,
    });
    const artists = resp.artists.map(artistToArtist);
    return { artists, hasMore: resp.hasMore };
  } catch {
    return null;
  }
}

export async function clusterBrowseTextSearch(
  query: string,
  limit: number,
): Promise<SubsonicSong[] | null> {
  const members = await resolveClusterBrowseMembers();
  if (!members) return null;
  const q = query.trim();
  if (!q) return null;
  try {
    const resp = await librarySearchCluster({
      query: q,
      limit,
      serversOrdered: members,
    });
    return resp.hits.map(trackToSong);
  } catch {
    return null;
  }
}

/** Paginated cluster text search (fetch-through then slice — no Rust offset yet). */
export async function clusterBrowseTextSearchPage(
  query: string,
  offset: number,
  pageSize: number,
): Promise<SubsonicSong[] | null> {
  const all = await clusterBrowseTextSearch(query, offset + pageSize);
  if (!all) return null;
  return all.slice(offset, offset + pageSize);
}
