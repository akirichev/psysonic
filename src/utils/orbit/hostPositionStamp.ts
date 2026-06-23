/**
 * Orbit host — consistent playback-position stamping.
 *
 * The host's `currentTime` updates in coarse steps (decode / progress
 * granularity gives ~5.6 s jumps) while the state-write tick runs every 2.5 s.
 * Stamping `positionAt = now` on every tick while `positionMs` is frozen breaks
 * the guest's extrapolation `posMs + (now - posAt)`: it stalls while the
 * position is frozen, then jumps ~5.6 s when it finally updates — and the
 * measured drift oscillates ±5 s, which no controller can track.
 *
 * The stamper keeps the timestamp paired with the *position it belongs to*:
 * while playing and the position is unchanged, it returns the original
 * `(positionMs, positionAt)` pair, so the guest extrapolates smoothly from the
 * last real measurement.
 */

export interface PositionStamp {
  positionMs: number;
  positionAt: number;
}

export type HostPositionStamper = (curMs: number, isPlaying: boolean, now: number) => PositionStamp;

export function makeHostPositionStamper(): HostPositionStamper {
  let lastPosMs = -1;
  let lastPosAt = 0;
  return (curMs, isPlaying, now) => {
    if (isPlaying && curMs === lastPosMs) {
      // Frozen this tick — keep the stamp from when the position was real.
      return { positionMs: curMs, positionAt: lastPosAt };
    }
    lastPosMs = curMs;
    lastPosAt = now;
    return { positionMs: curMs, positionAt: now };
  };
}
