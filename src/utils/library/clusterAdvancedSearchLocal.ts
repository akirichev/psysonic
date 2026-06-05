import {
  libraryClusterAdvancedSearch,
  type LibraryAdvancedSearchResponse,
  type LibraryClusterAdvancedSearchRequest,
} from '../../api/library';
import { buildClusterRestrictAlbumScopes } from './albumBrowseLibraryScope';
import { resolveClusterBrowseMembers } from '../serverCluster/clusterBrowse';
import { buildClusterLibraryScopes } from '../serverCluster/clusterLibraryScopes';
import { isClusterMode } from '../serverCluster/clusterScope';

export async function clusterAdvancedSearchLocal(
  request: Omit<LibraryClusterAdvancedSearchRequest, 'serversOrdered'>,
): Promise<LibraryAdvancedSearchResponse | null> {
  if (!isClusterMode()) return null;
  const members = await resolveClusterBrowseMembers();
  if (!members?.length) return null;
  try {
    const restrictAlbumScopes = await buildClusterRestrictAlbumScopes(members);
    return await libraryClusterAdvancedSearch({
      ...request,
      serversOrdered: members,
      libraryScopes: buildClusterLibraryScopes(members),
      restrictAlbumScopes,
    });
  } catch {
    return null;
  }
}
