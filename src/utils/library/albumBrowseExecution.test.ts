import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAdvancedSearch = vi.fn();
const mockListByGenre = vi.fn();
const mockListLossless = vi.fn();
const mockScopeArgs = vi.fn();
const mockScopedAllowlist = vi.fn();

vi.mock('../../api/library', () => ({
  libraryAdvancedSearch: (...args: unknown[]) => mockAdvancedSearch(...args),
  libraryListAlbumsByGenre: (...args: unknown[]) => mockListByGenre(...args),
  libraryListLosslessAlbums: (...args: unknown[]) => mockListLossless(...args),
}));

vi.mock('../musicLibraryFilter', () => ({
  libraryScopeInvokeArgs: (...args: unknown[]) => mockScopeArgs(...args),
}));

vi.mock('./albumBrowseLibraryScope', async importOriginal => {
  const actual = await importOriginal<typeof import('./albumBrowseLibraryScope')>();
  return {
    ...actual,
    resolveScopedAlbumAllowlist: (...args: unknown[]) => mockScopedAllowlist(...args),
  };
});

import { searchSingleServerAlbumBrowse } from './albumBrowseExecution';

const baseQuery = {
  sort: 'alphabeticalByName' as const,
  genres: [] as string[],
  losslessOnly: false,
  starredOnly: false,
  compFilter: 'all' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockScopeArgs.mockReturnValue({ libraryScopeIds: ['lib-1'], libraryScope: 'lib-1' });
  mockScopedAllowlist.mockResolvedValue(null);
});

describe('searchSingleServerAlbumBrowse', () => {
  it('pure lossless uses libraryListLosslessAlbums with scope and sort', async () => {
    mockListLossless.mockResolvedValue({
      source: 'local',
      albums: [{ id: 'flac-1', name: 'Hi-Res', serverId: 's1' }],
      hasMore: false,
    });

    const result = await searchSingleServerAlbumBrowse(
      'srv-1',
      { ...baseQuery, losslessOnly: true },
      0,
      30,
    );

    expect(mockListLossless).toHaveBeenCalledWith({
      serverId: 'srv-1',
      libraryScopeIds: ['lib-1'],
      libraryScope: 'lib-1',
      sort: [{ field: 'name', dir: 'asc' }],
      limit: 30,
      offset: 0,
    });
    expect(mockAdvancedSearch).not.toHaveBeenCalled();
    expect(result?.albums.map(a => a.id)).toEqual(['flac-1']);
  });

  it('scoped lossless passes SQL allowlist and post-filters leaked albums', async () => {
    mockScopedAllowlist.mockResolvedValue(new Set(['flac-1']));
    mockListLossless.mockResolvedValue({
      source: 'local',
      albums: [
        { id: 'flac-1', name: 'In scope', serverId: 's1' },
        { id: 'flac-2', name: 'Out of scope', serverId: 's1' },
      ],
      hasMore: false,
    });

    const result = await searchSingleServerAlbumBrowse(
      'srv-1',
      { ...baseQuery, losslessOnly: true },
      0,
      30,
    );

    expect(mockListLossless).toHaveBeenCalledWith(
      expect.objectContaining({
        restrictAlbumIds: ['flac-1'],
      }),
    );
    expect(result?.albums.map(a => a.id)).toEqual(['flac-1']);
  });

  it('lossless combined with year still uses advanced search', async () => {
    mockAdvancedSearch.mockResolvedValue({
      source: 'local',
      albums: [{ id: 'a1', name: 'A', serverId: 's1' }],
    });

    await searchSingleServerAlbumBrowse(
      'srv-1',
      { ...baseQuery, losslessOnly: true, year: { from: 1990 } },
      0,
      30,
    );

    expect(mockListLossless).not.toHaveBeenCalled();
    expect(mockAdvancedSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.arrayContaining([
          { field: 'lossless', op: 'is_true' },
          expect.objectContaining({ field: 'year' }),
        ]),
      }),
    );
  });

  it('multi-genre union uses advanced search per genre', async () => {
    mockAdvancedSearch
      .mockResolvedValueOnce({
        source: 'local',
        albums: [{ id: 'r1', name: 'Rock', serverId: 's1', genre: 'Rock' }],
      })
      .mockResolvedValueOnce({
        source: 'local',
        albums: [{ id: 'j1', name: 'Jazz', serverId: 's1', genre: 'Jazz' }],
      });

    const result = await searchSingleServerAlbumBrowse(
      'srv-1',
      { ...baseQuery, genres: ['Rock', 'Jazz'] },
      0,
      30,
    );

    expect(mockAdvancedSearch).toHaveBeenCalledTimes(2);
    expect(result?.albums.map(a => a.id).sort()).toEqual(['j1', 'r1']);
  });
});
