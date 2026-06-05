import {
  libraryClusterPlayerStatsHeatmap,
  libraryClusterPlayerStatsYearSummary,
  libraryGetPlayerStatsHeatmap,
  libraryGetPlayerStatsYearBounds,
  libraryGetPlayerStatsYearSummary,
  type PlaySessionHeatmapDay,
  type PlaySessionYearSummary,
} from '../../api/library';
import { resolveClusterBrowseMembers } from './clusterBrowse';

export async function loadPlayerStatsYearSummary(year: number): Promise<PlaySessionYearSummary> {
  const members = await resolveClusterBrowseMembers();
  if (members) {
    return libraryClusterPlayerStatsYearSummary({ serversOrdered: members, year });
  }
  return libraryGetPlayerStatsYearSummary(year);
}

export async function loadPlayerStatsHeatmap(year: number): Promise<PlaySessionHeatmapDay[]> {
  const members = await resolveClusterBrowseMembers();
  if (members) {
    return libraryClusterPlayerStatsHeatmap({ serversOrdered: members, year });
  }
  return libraryGetPlayerStatsHeatmap(year);
}

export async function loadPlayerStatsYearBounds() {
  return libraryGetPlayerStatsYearBounds();
}
