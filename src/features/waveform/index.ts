/**
 * Waveform seekbar feature — the canvas seekbar, its waveform-bin loading, and
 * the per-track refresh generation guard. Co-located mirror of `cover/` /
 * `music-network/`. `waveformSilence` stays in `utils/waveform/` (crossfade /
 * auto-dj concern, not seekbar rendering).
 */
export { default as WaveformSeek } from './components/WaveformSeek';
export { SeekbarPreview } from './components/WaveformSeekPreview';
export { fetchWaveformBins, refreshWaveformForTrack } from './store/waveformRefresh';
export type { WaveformCachePayload } from './store/waveformRefresh';
export { bumpWaveformRefreshGen, getWaveformRefreshGen } from './store/waveformRefreshGen';
