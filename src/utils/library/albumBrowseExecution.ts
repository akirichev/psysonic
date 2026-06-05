/**
 * Album browse — filter layering (every path must follow this order):
 *
 * 1. **Library scope** — SQL `libraryScopeIds` on tracks with missing `library_id`
 * 2. **Scoped album allowlist** — cached `getAlbumList2` ids (SQL `IN` when ≤900, else post-filter)
 * 3. **Album attributes** (AND) — year, lossless, compilation, starred*
 * 4. **Genre** (OR union) — one `genre = ?` query per selected genre, results merged
 * 5. **Starred allowlist** — favorites `restrictAlbumIds` (intersected with step 2)
 */
import {
  libraryAdvancedSearch,
  libraryListAlbumsByGenre,
  libraryListLosslessAlbums,
  type LibraryFilterClause,
} from '../../api/library';
import type { SubsonicAlbum } from '../../api/subsonicTypes';
import { libraryScopeInvokeArgs } from '../musicLibraryFilter';
import {
  filterAlbumsByScopedAllowlist,
  intersectAlbumRestrictIds,
  resolveScopedAlbumAllowlist,
  scopedSqlAlbumAllowlist,
} from './albumBrowseLibraryScope';
import { dedupeById } from '../dedupeById';
import { albumToAlbum } from './advancedSearchLocal';
import { albumBrowseIsPureLossless, sharedServerFilters } from './albumBrowseFilters';
import { albumSortClauses, sortSubsonicAlbums } from './albumBrowseSort';
import type { AlbumBrowsePageResult, AlbumBrowseQuery } from './albumBrowseTypes';
import { GENRE_ALBUM_FETCH_LIMIT } from './albumBrowseTypes';

export type AlbumBrowseInvokeContext = {
  scopeArgs: ReturnType<typeof libraryScopeInvokeArgs>;
  invokeScope: ReturnType<typeof libraryScopeInvokeArgs> & {
    restrictAlbumIds?: string[];
  };
  scopedAllowlist: Set<string> | null;
  useServerStarredIds: boolean;
  starredOnly: boolean | undefined;
  attributeFilters: LibraryFilterClause[];
};

export async function resolveAlbumBrowseInvokeContext(
  serverId: string,
  query: AlbumBrowseQuery,
  restrictAlbumIds?: string[],
): Promise<AlbumBrowseInvokeContext> {
  const scopeArgs = libraryScopeInvokeArgs(serverId);
  const scopedAllowlist = await resolveScopedAlbumAllowlist(serverId);
  const allowlistArr = scopedAllowlist ? [...scopedAllowlist] : undefined;
  const scopeSqlAllowlist = scopedSqlAlbumAllowlist(scopedAllowlist);
  const useServerStarredIds = restrictAlbumIds != null;
  const favoriteAllowlist = useServerStarredIds
    ? intersectAlbumRestrictIds(restrictAlbumIds, allowlistArr)
    : undefined;
  const sqlRestrict = favoriteAllowlist ?? scopeSqlAllowlist;
  const invokeScope = {
    ...scopeArgs,
    ...(sqlRestrict?.length ? { restrictAlbumIds: sqlRestrict } : {}),
  };

  return {
    scopeArgs,
    invokeScope,
    scopedAllowlist,
    useServerStarredIds,
    starredOnly: useServerStarredIds ? undefined : (query.starredOnly || undefined),
    attributeFilters: sharedServerFilters(query, useServerStarredIds),
  };
}

function genreEqFilter(genre: string): LibraryFilterClause {
  return { field: 'genre', op: 'eq', value: genre };
}

function markServerStarredAlbums(albums: SubsonicAlbum[]): SubsonicAlbum[] {
  return albums.map(a => ({ ...a, starred: a.starred ?? 'true' }));
}

/** Step 3 — OR union via parallel per-genre advanced search (offset 0 only). */
async function fetchMultiGenreAlbumUnion(
  serverId: string,
  query: AlbumBrowseQuery,
  ctx: AlbumBrowseInvokeContext,
): Promise<SubsonicAlbum[]> {
  const pages = await Promise.all(
    query.genres.map(genre =>
      libraryAdvancedSearch({
        serverId,
        ...ctx.invokeScope,
        entityTypes: ['album'],
        filters: [genreEqFilter(genre), ...ctx.attributeFilters],
        starredOnly: ctx.starredOnly,
        sort: albumSortClauses(query.sort),
        limit: GENRE_ALBUM_FETCH_LIMIT,
        offset: 0,
        skipTotals: true,
      }),
    ),
  );
  if (pages.some(p => p.source !== 'local')) {
    throw new Error('local index unavailable');
  }
  return dedupeById(pages.flatMap(p => p.albums.map(albumToAlbum)));
}

/** Single-server local index browse — one entry point for all filter combinations. */
export async function searchSingleServerAlbumBrowse(
  serverId: string,
  query: AlbumBrowseQuery,
  offset: number,
  pageSize: number,
  restrictAlbumIds?: string[],
): Promise<AlbumBrowsePageResult | null> {
  const ctx = await resolveAlbumBrowseInvokeContext(serverId, query, restrictAlbumIds);
  const sort = albumSortClauses(query.sort);

  const finish = (
    albums: SubsonicAlbum[],
    hasMore: boolean,
  ): AlbumBrowsePageResult => {
    const scoped = filterAlbumsByScopedAllowlist(albums, ctx.scopedAllowlist);
    const out = ctx.useServerStarredIds ? markServerStarredAlbums(scoped) : scoped;
    return { albums: out, hasMore };
  };

  if (query.genres.length > 1) {
    if (offset > 0) return { albums: [], hasMore: false };
    try {
      const merged = await fetchMultiGenreAlbumUnion(serverId, query, ctx);
      return {
        albums: sortSubsonicAlbums(finish(merged, false).albums, query.sort),
        hasMore: false,
      };
    } catch {
      return null;
    }
  }

  if (query.genres.length === 1) {
    const genre = query.genres[0];
    const pureGenreQuery = ctx.attributeFilters.length === 0 && !ctx.starredOnly;
    try {
      if (pureGenreQuery && !ctx.useServerStarredIds) {
        const resp = await libraryListAlbumsByGenre({
          serverId,
          genre,
          ...ctx.scopeArgs,
          sort,
          limit: pageSize,
          offset,
        });
        if (resp.source !== 'local') return null;
        return finish(resp.albums.map(albumToAlbum), resp.hasMore);
      }
      const resp = await libraryAdvancedSearch({
        serverId,
        ...ctx.invokeScope,
        entityTypes: ['album'],
        filters: [genreEqFilter(genre), ...ctx.attributeFilters],
        starredOnly: ctx.starredOnly,
        sort,
        limit: pageSize,
        offset,
        skipTotals: true,
      });
      if (resp.source !== 'local') return null;
      return finish(resp.albums.map(albumToAlbum), resp.albums.length === pageSize);
    } catch {
      return null;
    }
  }

  try {
    if (albumBrowseIsPureLossless(query)) {
      const resp = await libraryListLosslessAlbums({
        serverId,
        ...ctx.scopeArgs,
        restrictAlbumIds: ctx.invokeScope.restrictAlbumIds,
        sort,
        limit: pageSize,
        offset,
      });
      if (resp.source !== 'local') return null;
      return finish(resp.albums.map(albumToAlbum), resp.hasMore);
    }
    const resp = await libraryAdvancedSearch({
      serverId,
      ...ctx.invokeScope,
      entityTypes: ['album'],
      filters: ctx.attributeFilters,
      starredOnly: ctx.starredOnly,
      sort,
      limit: pageSize,
      offset,
      skipTotals: true,
    });
    if (resp.source !== 'local') return null;
    return finish(resp.albums.map(albumToAlbum), resp.albums.length === pageSize);
  } catch {
    return null;
  }
}
