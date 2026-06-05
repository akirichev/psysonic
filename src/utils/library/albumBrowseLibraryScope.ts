import { albumIdsInLibraryScope } from '../../api/subsonicLibrary';
import type { SubsonicAlbum } from '../../api/subsonicTypes';
import { libraryScopeIdsForServer } from '../musicLibraryFilter';
import { resolveClusterBrowseMembers } from '../serverCluster/clusterBrowse';

/** SQLite bind-parameter budget for `restrictAlbumIds` IN clauses. */
export const SQL_ALBUM_ALLOWLIST_MAX = 900;

/**
 * Navidrome-scoped album ids from getAlbumList2 (per musicFolderId).
 * Cached per server + filter version — safe to call on every browse page.
 */
export async function resolveScopedAlbumAllowlist(
  serverId: string,
): Promise<Set<string> | null> {
  if (!libraryScopeIdsForServer(serverId)?.length) return null;
  try {
    return await albumIdsInLibraryScope(serverId);
  } catch {
    return null;
  }
}

export async function resolveScopedAlbumRestrictIds(
  serverId: string,
): Promise<string[] | undefined> {
  const allowlist = await resolveScopedAlbumAllowlist(serverId);
  return allowlist ? [...allowlist] : undefined;
}

export function filterAlbumsByScopedAllowlist(
  albums: SubsonicAlbum[],
  allowlist: Set<string> | null | undefined,
): SubsonicAlbum[] {
  if (!allowlist?.size) return albums;
  return albums.filter(a => allowlist.has(a.id));
}

/** Client-side scope filter (server getAlbumList2 ids). Idempotent after SQL restrict. */
export async function filterAlbumsToServerLibraryScope(
  serverId: string,
  albums: SubsonicAlbum[],
  precomputedRestrict?: string[],
): Promise<SubsonicAlbum[]> {
  if (!libraryScopeIdsForServer(serverId)?.length) return albums;
  const restrict = precomputedRestrict ?? await resolveScopedAlbumRestrictIds(serverId);
  if (!restrict) return albums;
  const allowed = new Set(restrict);
  return albums.filter(a => allowed.has(a.id));
}

export function intersectAlbumRestrictIds(
  primary: string[] | undefined,
  scopeRestrict: string[] | undefined,
): string[] | undefined {
  if (!scopeRestrict?.length) return primary;
  if (!primary?.length) return scopeRestrict;
  const allowed = new Set(scopeRestrict);
  return primary.filter(id => allowed.has(id));
}

export function scopedSqlAlbumAllowlist(
  allowlist: Set<string> | null | undefined,
): string[] | undefined {
  if (!allowlist?.size) return undefined;
  const ids = [...allowlist];
  return ids.length > 0 && ids.length <= SQL_ALBUM_ALLOWLIST_MAX ? ids : undefined;
}

/** Per-server getAlbumList2 allowlists for cluster SQL `restrictAlbumIds` (≤900 ids). */
export async function buildClusterRestrictAlbumScopes(
  memberIds: string[],
): Promise<Record<string, string[]> | undefined> {
  const scopes: Record<string, string[]> = {};
  await Promise.all(
    memberIds.map(async sid => {
      if (!libraryScopeIdsForServer(sid)?.length) return;
      const allowlist = await resolveScopedAlbumAllowlist(sid);
      const sql = scopedSqlAlbumAllowlist(allowlist);
      if (sql?.length) scopes[sid] = sql;
    }),
  );
  return Object.keys(scopes).length > 0 ? scopes : undefined;
}

/**
 * Per-member scoped album ids for merged cluster browse.
 * When any member is narrowed, albums from unscoped members are excluded.
 */
export async function filterClusterAlbumsToLibraryScope(
  albums: SubsonicAlbum[],
): Promise<SubsonicAlbum[]> {
  const members = await resolveClusterBrowseMembers();
  if (!members?.length) return albums;

  const scopedMembers = members.filter(sid => libraryScopeIdsForServer(sid)?.length);
  if (scopedMembers.length === 0) return albums;

  const restrictByServer = new Map<string, Set<string>>();
  await Promise.all(
    scopedMembers.map(async sid => {
      const allowlist = await resolveScopedAlbumAllowlist(sid);
      if (allowlist?.size) restrictByServer.set(sid, allowlist);
    }),
  );
  if (restrictByServer.size === 0) return albums;

  return albums.filter(a => {
    const seedServerId = a.clusterSeedServerId;
    if (!seedServerId || !scopedMembers.includes(seedServerId)) return false;
    const allowed = restrictByServer.get(seedServerId);
    return allowed?.has(a.id) ?? false;
  });
}
