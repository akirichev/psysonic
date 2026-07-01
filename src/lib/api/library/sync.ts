/**
 * Session + lifecycle commands (PR-5b) — bind/clear sync sessions, start/cancel
 * syncs, mutate tracks, write artifacts/facts, purge. Split out of the former
 * single `lib/api/library.ts`; re-exported via the `@/lib/api/library` barrel.
 */
import { invoke } from '@tauri-apps/api/core';
import { serverIndexKeyForId } from './internal';
import type {
  PlaybackHint,
  SyncMode,
  SyncJobDto,
  PurgeReportDto,
  ArtifactInputDto,
  FactInputDto,
} from './dto';

export function librarySyncBindSession(args: {
  serverId: string;
  baseUrl: string;
  username: string;
  password: string;
  libraryScope?: string;
}): Promise<void> {
  const indexKey = serverIndexKeyForId(args.serverId);
  return invoke<void>('library_sync_bind_session', { ...args, serverId: indexKey });
}

export function librarySyncClearSession(serverId: string): Promise<void> {
  const indexKey = serverIndexKeyForId(serverId);
  return invoke<void>('library_sync_clear_session', { serverId: indexKey });
}

export function libraryGetPlaybackHint(): Promise<PlaybackHint> {
  return invoke<PlaybackHint>('library_get_playback_hint');
}

export function librarySetPlaybackHint(hint: PlaybackHint): Promise<void> {
  return invoke<void>('library_set_playback_hint', { hint });
}

export function librarySyncStart(args: {
  serverId: string;
  mode: SyncMode;
  libraryScope?: string;
}): Promise<SyncJobDto> {
  const indexKey = serverIndexKeyForId(args.serverId);
  return invoke<SyncJobDto>('library_sync_start', { ...args, serverId: indexKey })
    .then(job => ({ ...job, serverId: args.serverId }));
}

/** Forced full-budget tombstone delta — Settings → «Verify integrity». */
export function librarySyncVerifyIntegrity(args: {
  serverId: string;
  libraryScope?: string;
}): Promise<SyncJobDto> {
  const indexKey = serverIndexKeyForId(args.serverId);
  return invoke<SyncJobDto>('library_sync_verify_integrity', { ...args, serverId: indexKey })
    .then(job => ({ ...job, serverId: args.serverId }));
}

export function librarySyncCancel(jobId?: string): Promise<void> {
  return invoke<void>('library_sync_cancel', { jobId });
}

export function libraryPatchTrack(args: {
  serverId: string;
  trackId: string;
  patch: {
    starredAt?: number | null;
    userRating?: number | null;
    playCount?: number | null;
    playedAt?: number | null;
    /** E2: playback-derived `md5_16kb` content fingerprint. Normally written
     *  by the Rust analysis bridge; exposed here for contract completeness. */
    contentHash?: string | null;
  };
}): Promise<void> {
  const indexKey = serverIndexKeyForId(args.serverId);
  return invoke<void>('library_patch_track', { ...args, serverId: indexKey });
}

/** Server favorites → `album.starred_at` (UPDATE only, no stub rows). */
export function libraryReconcileAlbumStars(args: {
  serverId: string;
  starredAlbums: Array<{ id: string; starredAt: number }>;
}): Promise<void> {
  const indexKey = serverIndexKeyForId(args.serverId);
  return invoke<void>('library_reconcile_album_stars', {
    serverId: indexKey,
    starredAlbums: args.starredAlbums.map(a => ({ id: a.id, starredAt: a.starredAt })),
  });
}

export function libraryPutArtifact(args: {
  serverId: string;
  trackId: string;
  artifact: ArtifactInputDto;
}): Promise<void> {
  const indexKey = serverIndexKeyForId(args.serverId);
  return invoke<void>('library_put_artifact', { ...args, serverId: indexKey });
}

export function libraryPutFact(args: {
  serverId: string;
  trackId: string;
  fact: FactInputDto;
}): Promise<void> {
  const indexKey = serverIndexKeyForId(args.serverId);
  return invoke<void>('library_put_fact', { ...args, serverId: indexKey });
}

export function libraryPurgeServer(args: {
  serverId: string;
  includeAnalysis?: boolean;
  includeOffline?: boolean;
}): Promise<PurgeReportDto> {
  const indexKey = serverIndexKeyForId(args.serverId);
  return invoke<PurgeReportDto>('library_purge_server', { ...args, serverId: indexKey });
}

export function libraryDeleteServerData(serverId: string): Promise<void> {
  const indexKey = serverIndexKeyForId(serverId);
  return invoke<void>('library_delete_server_data', { serverId: indexKey });
}
