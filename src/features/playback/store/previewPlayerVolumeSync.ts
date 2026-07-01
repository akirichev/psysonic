/**
 * Side-effect wiring: keep the Rust preview sink volume aligned with the main
 * player slider while a track preview is active.
 */
import { invoke } from '@tauri-apps/api/core';
import { computePreviewVolume, usePreviewStore } from '@/features/playback/store/previewStore';
import { usePlayerStore } from '@/features/playback/store/playerStore';

usePlayerStore.subscribe((state, prev) => {
  if (state.volume === prev.volume) return;
  if (!usePreviewStore.getState().previewingId) return;
  invoke('audio_preview_set_volume', { volume: computePreviewVolume() }).catch(() => {});
});
