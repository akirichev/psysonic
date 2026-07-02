/**
 * Typed facade over the generated device-sync (syncfs) commands. Plain commands
 * pass through (reject on error like invoke); Result-wrapped ones re-throw on
 * error so the call sites keep their existing reject semantics.
 *
 * `calculate_sync_payload` / `write_device_manifest` / `write_playlist_m3u8`
 * stay on raw `invoke` (untypeable — `serde_json::Value` in their signatures).
 */
import { commands } from '@/generated/bindings';
import type { RemovableDrive, SyncBatchResult, TrackSyncInfo } from '@/generated/bindings';

export function computeSyncPaths(args: { tracks: TrackSyncInfo[]; destDir: string }): Promise<string[]> {
  return commands.computeSyncPaths(args.tracks, args.destDir);
}

export function getRemovableDrives(): Promise<RemovableDrive[]> {
  return commands.getRemovableDrives();
}

export function cancelDeviceSync(args: { jobId: string }): Promise<void> {
  return commands.cancelDeviceSync(args.jobId);
}

export async function listDeviceDirFiles(args: { dir: string }): Promise<string[]> {
  const res = await commands.listDeviceDirFiles(args.dir);
  if (res.status === 'error') throw new Error(res.error);
  return res.data;
}

export async function deleteDeviceFiles(args: { paths: string[] }): Promise<number> {
  const res = await commands.deleteDeviceFiles(args.paths);
  if (res.status === 'error') throw new Error(res.error);
  return res.data;
}

export async function syncBatchToDevice(args: {
  tracks: TrackSyncInfo[];
  destDir: string;
  jobId: string;
  expectedBytes: number;
}): Promise<SyncBatchResult> {
  const res = await commands.syncBatchToDevice(args.tracks, args.destDir, args.jobId, args.expectedBytes);
  if (res.status === 'error') throw new Error(res.error);
  return res.data;
}
