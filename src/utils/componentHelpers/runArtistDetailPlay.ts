import type { TFunction } from 'i18next';
import { getAlbum, getAlbumForServer } from '../../api/subsonicLibrary';
import { getSimilarSongs2, getTopSongs } from '../../api/subsonicArtists';
import type { SubsonicAlbum, SubsonicArtist, SubsonicSong } from '../../api/subsonicTypes';
import type { Track } from '../../store/playerStoreTypes';
import { songToTrack } from '../playback/songToTrack';
import { runBulkPlayAll, runBulkShuffle } from '../playback/runBulkPlay';

async function fetchAlbumTracks(album: SubsonicAlbum): Promise<{ year: number; tracks: Track[] }> {
  const serverId = album.clusterSeedServerId;
  const data = serverId
    ? await getAlbumForServer(serverId, album.id)
    : await getAlbum(album.id);
  const genre = data.album.genre ?? album.genre;
  const tracks = [...data.songs]
    .sort((a, b) => (a.track ?? 0) - (b.track ?? 0))
    .map(s => {
      const track = songToTrack(
        serverId ? { ...s, clusterBrowseServerId: s.clusterBrowseServerId ?? serverId } : s,
      );
      if (!track.genre && genre) track.genre = genre;
      return track;
    });
  return { year: data.album.year ?? album.year ?? 0, tracks };
}

/** All album tracks for artist Play All / shuffle (cluster-aware per album). */
export async function fetchArtistCatalogTracks(albums: SubsonicAlbum[]): Promise<Track[]> {
  if (albums.length === 0) return [];
  const parts = await Promise.all(albums.map(fetchAlbumTracks));
  return [...parts]
    .sort((a, b) => a.year - b.year)
    .flatMap(p => p.tracks);
}

/** Top-song click queue: from index through top list, then rest of catalog without dupes. */
export function buildArtistTopSongPlayQueue(
  topSongs: SubsonicSong[],
  startIndex: number,
  catalogTracks: Track[],
): Track[] {
  const topTracksFromIndex = topSongs.slice(startIndex).map(songToTrack);
  if (catalogTracks.length === 0) return topTracksFromIndex;
  const topSongIds = new Set(topSongs.map(s => s.id));
  const remaining = catalogTracks.filter(tr => !topSongIds.has(tr.id));
  return [...topTracksFromIndex, ...remaining];
}

export interface RunArtistDetailPlayDeps {
  albums: SubsonicAlbum[];
  setPlayAllLoading: (v: boolean) => void;
  playTrack: (track: Track, queue: Track[]) => void;
}

export async function runArtistDetailPlayAll(deps: RunArtistDetailPlayDeps): Promise<void> {
  const { albums, setPlayAllLoading, playTrack } = deps;
  if (albums.length === 0) return;
  await runBulkPlayAll({
    fetchTracks: () => fetchArtistCatalogTracks(albums),
    setLoading: setPlayAllLoading,
    playTrack,
  });
}

export async function runArtistDetailShuffle(deps: RunArtistDetailPlayDeps): Promise<void> {
  const { albums, setPlayAllLoading, playTrack } = deps;
  if (albums.length === 0) return;
  await runBulkShuffle({
    fetchTracks: () => fetchArtistCatalogTracks(albums),
    setLoading: setPlayAllLoading,
    playTrack,
  });
}

export interface RunArtistDetailStartRadioDeps {
  artist: SubsonicArtist;
  t: TFunction;
  setRadioLoading: (v: boolean) => void;
  playTrack: (track: Track, queue: Track[]) => void;
  enqueue: (tracks: Track[]) => void;
}

export async function runArtistDetailStartRadio(deps: RunArtistDetailStartRadioDeps): Promise<void> {
  const { artist, t, setRadioLoading, playTrack, enqueue } = deps;
  setRadioLoading(true);
  try {
    // Fire both fetches in parallel
    const topPromise = getTopSongs(artist.name);
    const similarPromise = getSimilarSongs2(artist.id, 50);

    // Start playing as soon as top songs arrive
    const top = await topPromise;
    if (top.length > 0) {
      const firstTrack = songToTrack(top[0]);
      playTrack(firstTrack, [firstTrack]);
      setRadioLoading(false);
      // Enqueue remaining tracks when similar songs arrive
      const similar = await similarPromise;
      const remaining = [...top.slice(1), ...similar].map(songToTrack);
      if (remaining.length > 0) enqueue(remaining);
    } else {
      // No top songs — fall back to similar
      const similar = await similarPromise;
      if (similar.length > 0) {
        const tracks = similar.map(songToTrack);
        playTrack(tracks[0], tracks);
      } else {
        alert(t('artistDetail.noRadio'));
      }
      setRadioLoading(false);
    }
  } catch (e) {
    console.error('Radio start failed', e);
    setRadioLoading(false);
  }
}
