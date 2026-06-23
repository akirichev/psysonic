/**
 * Orbit drift correction — tunable constants (v4: proportional + smooth ramp).
 *
 * History: v2 stepped a fine ramp but the raw drift was too noisy; v3 went
 * bang-bang (full ±10% jumps) to dodge audio artifacts — but that was a
 * backend restamp bug (now fixed), and bang-bang *overshoots* (it drives the
 * full cap until almost caught up, then with the ~3.5 s measurement latency it
 * sails past and reverses — "can't lock on"). v4:
 *
 *   - Median-smooth the raw drift (host position lands in ~5 s quanta).
 *   - **Proportional** target rate: the further off, the closer to the ±10%
 *     cap; the closer to synced, the gentler — so it converges asymptotically
 *     instead of overshooting.
 *   - Ramp the rate gradually toward that target (no jumps). Pitch-preserving
 *     speed changes are stable now that the restamp is fixed.
 *   - No auto-seek: past a hard threshold we surface the manual Catch-Up button.
 */

/**
 * Smoothed drift at or below this is left alone — sized against the coarse
 * (~5 s) host position updates, below which "sync" isn't measurable anyway.
 */
export const DRIFT_DEADBAND_MS = 1000;

/**
 * Drift at which the proportional rate reaches the full ±10% cap. Below it the
 * rate scales linearly toward 1.0×, so a small drift gets a small nudge. Larger
 * = gentler/slower correction.
 */
export const DRIFT_FULL_SCALE_MS = 4000;

/** ±10% product cap on the correction rate. */
export const RATE_MIN = 0.9;
export const RATE_MAX = 1.1;

/** Rate ramps toward the proportional target by this much per tick (gradual). */
export const RATE_STEP = 0.01;

/**
 * Beyond this smoothed drift a soft nudge is pointless (real desync after a
 * network stall). We don't auto-seek — we surface the manual Catch-Up button.
 */
export const DRIFT_SEEK_HARD_MS = 8000;

/** Drift-correction loop cadence. Faster than the 2.5 s state poll. */
export const LOOP_TICK_MS = 500;

/** Median window over raw drift samples, and the minimum before acting. */
export const DRIFT_SMOOTH_WINDOW = 5;
export const DRIFT_SMOOTH_MIN_SAMPLES = 3;
