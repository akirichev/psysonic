/**
 * Player stats (local listening history) + genre/catalog aggregate reads. Split
 * out of the former single `lib/api/library.ts`; re-exported via the
 * `@/lib/api/library` barrel.
 */
import { invoke } from '@tauri-apps/api/core';
import { commands } from '@/generated/bindings';
import { serverIndexKeyForId, mapServerIdFromIndexKey } from './internal';
import type {
  CatalogYearBounds,
  GenreAlbumCountRow,
  LibraryGenreAlbumsRequest,
  LibraryGenreAlbumsResponse,
  PlaySessionInput,
  PlaySessionYearSummary,
  PlaySessionHeatmapDay,
  PlaySessionDayDetail,
  PlaySessionYearBounds,
  PlaySessionRecentDay,
  PlaySessionRecentTrack,
} from './dto';

export async function libraryGetCatalogYearBounds(args: {
  serverId: string;
}): Promise<CatalogYearBounds> {
  const indexKey = serverIndexKeyForId(args.serverId);
  const res = await commands.libraryGetCatalogYearBounds(indexKey);
  if (res.status === 'error') throw new Error(res.error);
  return res.data;
}

export async function libraryGetGenreAlbumCounts(args: {
  serverId: string;
  libraryScope?: string;
}): Promise<GenreAlbumCountRow[]> {
  const indexKey = serverIndexKeyForId(args.serverId);
  const res = await commands.libraryGetGenreAlbumCounts(indexKey, args.libraryScope ?? null);
  if (res.status === 'error') throw new Error(res.error);
  return res.data;
}

/** Paginated albums for one genre from the local track index. */
export function libraryListAlbumsByGenre(
  request: LibraryGenreAlbumsRequest,
): Promise<LibraryGenreAlbumsResponse> {
  const indexKey = serverIndexKeyForId(request.serverId);
  return invoke<LibraryGenreAlbumsResponse>('library_list_albums_by_genre', {
    request: {
      serverId: indexKey,
      genre: request.genre,
      libraryScope: request.libraryScope ?? undefined,
      sort: request.sort ?? [],
      limit: request.limit ?? 50,
      offset: request.offset ?? 0,
      includeTotal: request.includeTotal ?? false,
    },
  }).then(response => ({
    ...response,
    albums: response.albums.map(album => ({
      ...album,
      serverId: mapServerIdFromIndexKey(album.serverId, request.serverId),
    })),
  }));
}

export function libraryRecordPlaySession(input: PlaySessionInput): Promise<void> {
  const indexKey = serverIndexKeyForId(input.serverId);
  return invoke<void>('library_record_play_session', { input: { ...input, serverId: indexKey } });
}

export function libraryGetPlayerStatsYearSummary(year: number): Promise<PlaySessionYearSummary> {
  return invoke<PlaySessionYearSummary>('library_get_player_stats_year_summary', { year });
}

export function libraryGetPlayerStatsHeatmap(year: number): Promise<PlaySessionHeatmapDay[]> {
  return invoke<PlaySessionHeatmapDay[]>('library_get_player_stats_heatmap', { year });
}

export function libraryGetPlayerStatsDayDetail(dateIso: string): Promise<PlaySessionDayDetail> {
  return invoke<PlaySessionDayDetail>('library_get_player_stats_day_detail', { dateIso })
    .then(detail => ({
      ...detail,
      tracks: detail.tracks.map(track => ({
        ...track,
        serverId: mapServerIdFromIndexKey(track.serverId),
      })),
    }));
}

export function libraryGetPlayerStatsYearBounds(): Promise<PlaySessionYearBounds> {
  return invoke<PlaySessionYearBounds>('library_get_player_stats_year_bounds');
}

export function libraryGetPlayerStatsRecentDays(limit = 30): Promise<PlaySessionRecentDay[]> {
  return invoke<PlaySessionRecentDay[]>('library_get_player_stats_recent_days', { limit });
}

export function libraryGetRecentPlaySessions(args?: {
  limit?: number;
  sinceMs?: number;
}): Promise<PlaySessionRecentTrack[]> {
  return invoke<PlaySessionRecentTrack[]>('library_get_recent_play_sessions', {
    limit: args?.limit,
    sinceMs: args?.sinceMs,
  }).then(rows =>
    rows.map(row => ({
      ...row,
      serverId: mapServerIdFromIndexKey(row.serverId),
    })),
  );
}
