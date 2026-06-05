import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runLocalBrowseAlbums = vi.fn();
const runNetworkBrowseAlbums = vi.fn();
const isClusterMultiLibraryScopeBrowse = vi.fn();
const isClusterMode = vi.fn();

vi.mock('../utils/library/browseTextSearch', () => ({
  BROWSE_TEXT_DEBOUNCE_RACE_MS: 0,
  BROWSE_TEXT_DEBOUNCE_NETWORK_MS: 0,
  runLocalBrowseAlbums: (...args: unknown[]) => runLocalBrowseAlbums(...args),
  runNetworkBrowseAlbums: (...args: unknown[]) => runNetworkBrowseAlbums(...args),
}));

vi.mock('../utils/serverCluster/clusterScope', () => ({
  isClusterMode: () => isClusterMode(),
}));

vi.mock('../utils/serverCluster/clusterLibraryScopes', () => ({
  isClusterMultiLibraryScopeBrowse: () => isClusterMultiLibraryScopeBrowse(),
}));

import { useBrowseAlbumTextSearch } from './useBrowseAlbumTextSearch';

beforeEach(() => {
  vi.clearAllMocks();
  isClusterMultiLibraryScopeBrowse.mockReturnValue(false);
  isClusterMode.mockReturnValue(false);
  runLocalBrowseAlbums.mockResolvedValue([
    { id: 'al-1', name: 'Local', artist: 'A', artistId: 'a', songCount: 1, duration: 1 },
  ]);
  runNetworkBrowseAlbums.mockResolvedValue([
    { id: 'net-1', name: 'Net', artist: 'B', artistId: 'b', songCount: 1, duration: 1 },
  ]);
});

describe('useBrowseAlbumTextSearch', () => {
  it('uses local cluster index only when multi-library scope is active', async () => {
    isClusterMultiLibraryScopeBrowse.mockReturnValue(true);

    const { result } = renderHook(() =>
      useBrowseAlbumTextSearch('beatles', true, 'srv-a'),
    );

    await waitFor(() => {
      expect(result.current.textSearchLoading).toBe(false);
      expect(runLocalBrowseAlbums).toHaveBeenCalled();
    });

    expect(runLocalBrowseAlbums).toHaveBeenCalledWith('srv-a', 'beatles', undefined, false, true);
    expect(runNetworkBrowseAlbums).not.toHaveBeenCalled();
    expect(result.current.textSearchAlbums).toHaveLength(1);
    expect(result.current.textSearchAlbums![0].id).toBe('al-1');
  });

  it('uses local index only in cluster mode', async () => {
    isClusterMode.mockReturnValue(true);

    const { result } = renderHook(() =>
      useBrowseAlbumTextSearch('beatles', true, 'srv-a'),
    );

    await waitFor(() => {
      expect(result.current.textSearchLoading).toBe(false);
      expect(runLocalBrowseAlbums).toHaveBeenCalled();
    });

    expect(runNetworkBrowseAlbums).not.toHaveBeenCalled();
  });

  it('prefers local index when enabled and falls back to network only when local is unavailable', async () => {
    const { result } = renderHook(() =>
      useBrowseAlbumTextSearch('beatles', true, 'srv-a'),
    );

    await waitFor(() => {
      expect(result.current.textSearchLoading).toBe(false);
      expect(runLocalBrowseAlbums).toHaveBeenCalled();
    });

    expect(runLocalBrowseAlbums).toHaveBeenCalledWith('srv-a', 'beatles', undefined, false, false);
    expect(runNetworkBrowseAlbums).not.toHaveBeenCalled();
    expect(result.current.textSearchAlbums![0].id).toBe('al-1');
  });

  it('falls back to network when the local index cannot serve the query', async () => {
    runLocalBrowseAlbums.mockResolvedValueOnce(null);

    const { result } = renderHook(() =>
      useBrowseAlbumTextSearch('beatles', true, 'srv-a'),
    );

    await waitFor(() => {
      expect(result.current.textSearchLoading).toBe(false);
      expect(runNetworkBrowseAlbums).toHaveBeenCalled();
    });

    expect(result.current.textSearchAlbums![0].id).toBe('net-1');
  });
});
