import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SubsonicAlbum, SubsonicSong } from '../../api/subsonicTypes';
import {
  buildArtistTopSongPlayQueue,
  fetchArtistCatalogTracks,
} from './runArtistDetailPlay';

vi.mock('../../api/subsonicLibrary', () => ({
  getAlbum: vi.fn(),
  getAlbumForServer: vi.fn(),
}));

import { getAlbum, getAlbumForServer } from '../../api/subsonicLibrary';

const mockGetAlbum = vi.mocked(getAlbum);
const mockGetAlbumForServer = vi.mocked(getAlbumForServer);

describe('fetchArtistCatalogTracks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses getAlbumForServer when clusterSeedServerId is set', async () => {
    const albums: SubsonicAlbum[] = [
      { id: 'a1', name: 'Album', artist: 'A', artistId: 'ar1', songCount: 1, duration: 100, clusterSeedServerId: 'srv-1' },
    ];
    mockGetAlbumForServer.mockResolvedValue({
      album: { id: 'a1', name: 'Album', artist: 'A', artistId: 'ar1', songCount: 1, duration: 100, year: 2020 },
      songs: [{ id: 't1', title: 'Track 1', artist: 'A', artistId: 'ar1', album: 'Album', albumId: 'a1', track: 1, duration: 100 }],
    });

    const tracks = await fetchArtistCatalogTracks(albums);

    expect(mockGetAlbumForServer).toHaveBeenCalledWith('srv-1', 'a1');
    expect(mockGetAlbum).not.toHaveBeenCalled();
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('t1');
    expect(tracks[0].clusterBrowseServerId).toBe('srv-1');
  });

  it('uses getAlbum when no clusterSeedServerId', async () => {
    const albums: SubsonicAlbum[] = [
      { id: 'a2', name: 'Album 2', artist: 'A', artistId: 'ar1', songCount: 1, duration: 100 },
    ];
    mockGetAlbum.mockResolvedValue({
      album: { id: 'a2', name: 'Album 2', artist: 'A', artistId: 'ar1', songCount: 1, duration: 100, year: 2019 },
      songs: [{ id: 't2', title: 'Track 2', artist: 'A', artistId: 'ar1', album: 'Album 2', albumId: 'a2', track: 1, duration: 100 }],
    });

    const tracks = await fetchArtistCatalogTracks(albums);

    expect(mockGetAlbum).toHaveBeenCalledWith('a2');
    expect(mockGetAlbumForServer).not.toHaveBeenCalled();
    expect(tracks[0].id).toBe('t2');
  });
});

describe('buildArtistTopSongPlayQueue', () => {
  const topSongs: SubsonicSong[] = [
    { id: 'top1', title: 'Top 1', artist: 'A', artistId: 'ar1', album: 'X', albumId: 'ax', duration: 100, clusterBrowseServerId: 's1' },
    { id: 'top2', title: 'Top 2', artist: 'A', artistId: 'ar1', album: 'Y', albumId: 'ay', duration: 100, clusterBrowseServerId: 's1' },
  ];

  it('returns top songs from index when catalog is empty', () => {
    const queue = buildArtistTopSongPlayQueue(topSongs, 1, []);
    expect(queue.map(t => t.id)).toEqual(['top2']);
  });

  it('appends catalog tracks excluding top song ids', () => {
    const catalog = [
      { id: 'top1', title: 'Top 1', artist: 'A', artistId: 'ar1', album: 'X', albumId: 'ax', duration: 100 },
      { id: 'other', title: 'Other', artist: 'A', artistId: 'ar1', album: 'Z', albumId: 'az', duration: 100 },
    ];
    const queue = buildArtistTopSongPlayQueue(topSongs, 0, catalog);
    expect(queue.map(t => t.id)).toEqual(['top1', 'top2', 'other']);
  });
});
