/**
 * Event subscriptions (`library:sync-progress` / `library:sync-idle`, §7.2) plus
 * the genre-tags startup backfill commands. Split out of the former single
 * `lib/api/library.ts`; re-exported via the `@/lib/api/library` barrel.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  LibrarySyncProgressPayload,
  LibrarySyncIdlePayload,
  GenreTagsInspectDto,
} from './dto';

export function subscribeLibrarySyncProgress(
  handler: (payload: LibrarySyncProgressPayload) => void,
): Promise<UnlistenFn> {
  return listen<LibrarySyncProgressPayload>('library:sync-progress', ({ payload }) =>
    handler(payload),
  );
}

export function subscribeLibrarySyncIdle(
  handler: (payload: LibrarySyncIdlePayload) => void,
): Promise<UnlistenFn> {
  return listen<LibrarySyncIdlePayload>('library:sync-idle', ({ payload }) =>
    handler(payload),
  );
}

export function libraryGenreTagsInspect(): Promise<GenreTagsInspectDto> {
  return invoke<GenreTagsInspectDto>('library_genre_tags_inspect');
}

export function libraryGenreTagsRun(): Promise<void> {
  return invoke<void>('library_genre_tags_run');
}
