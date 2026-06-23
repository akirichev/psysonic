/**
 * Orbit drift correction — pure proportional planner (v4).
 *
 * From the **smoothed** drift, pick a target rate proportional to how far off we
 * are: gentle near synced, up to the ±10% cap when far. The loop then ramps the
 * live rate gradually toward that target. Proportional + gradual converges
 * asymptotically instead of overshooting (bang-bang's "can't lock on"), and the
 * pitch-preserving speed changes are stable now that the backend restamp is
 * fixed.
 *
 * Past a hard threshold (real desync after a stall) we don't auto-seek — the
 * loop surfaces the manual Catch-Up button instead.
 *
 * `driftMs` MUST be median-smoothed (see `driftSmoothing`).
 */

import {
  DRIFT_CATCHUP_BUTTON_MS,
  DRIFT_DEADBAND_MS,
  DRIFT_FULL_SCALE_MS,
  DRIFT_SEEK_HARD_MS,
  RATE_MAX,
  RATE_MIN,
  RATE_STEP,
} from './driftCorrectionConstants';

/**
 * Automatic speed nudging is **disabled**: in practice every pitch-preserving
 * rate change is audible (tempo wobble / DSP distortion), and the host's sync
 * at track change plus the manual Catch-Up button keep the guest aligned well
 * enough. The proportional controller below is kept behind this flag in case the
 * preserve-pitch DSP improves enough to revisit it.
 */
const SPEED_CORRECTION_ENABLED = false;

export interface DriftCorrectionInput {
  /** Smoothed, signed drift: `> 0` guest ahead (slow down), `< 0` behind (speed up). */
  driftMs: number;
  hostIsPlaying: boolean;
}

export type DriftCorrectionPlan =
  | { action: 'hold' }
  | { action: 'correct'; targetRate: number }
  | { action: 'seek' };

const HOLD: DriftCorrectionPlan = { action: 'hold' };

export function planOrbitDriftCorrection(input: DriftCorrectionInput): DriftCorrectionPlan {
  const { driftMs, hostIsPlaying } = input;
  if (!hostIsPlaying) return HOLD;

  const absDrift = Math.abs(driftMs);

  if (!SPEED_CORRECTION_ENABLED) {
    // Hold 1.0× (no audible nudging) and only surface the manual Catch-Up
    // button once the drift is large enough to be worth a clean seek.
    return absDrift > DRIFT_CATCHUP_BUTTON_MS ? { action: 'seek' } : HOLD;
  }

  // ── Proportional speed correction (disabled — kept for a future DSP revisit) ──
  // Real desync (e.g. after a network stall) — too far to nudge; offer the
  // manual catch-up jump rather than auto-seeking.
  if (absDrift > DRIFT_SEEK_HARD_MS) return { action: 'seek' };

  // Inside the deadband: acceptable, leave the rate at 1.0×.
  if (absDrift <= DRIFT_DEADBAND_MS) return HOLD;

  // Proportional magnitude: 0 at the deadband edge, full ±10% at FULL_SCALE.
  // Continuous across the deadband boundary (no step in target rate).
  const span = Math.max(1, DRIFT_FULL_SCALE_MS - DRIFT_DEADBAND_MS);
  const frac = Math.min(1, (absDrift - DRIFT_DEADBAND_MS) / span);
  const magnitude = (RATE_MAX - 1) * frac;
  // Behind (drift < 0) → speed up; ahead → slow down.
  const targetRate = driftMs < 0 ? 1 + magnitude : 1 - magnitude;

  return { action: 'correct', targetRate: clampRate(targetRate) };
}

function clampRate(rate: number): number {
  return Math.max(RATE_MIN, Math.min(RATE_MAX, rate));
}

/**
 * Move `current` one `RATE_STEP` toward `target`, never overshooting. The loop
 * calls this once per tick so the rate ramps gradually; snaps exactly to
 * `target` once within a step (avoids float dust).
 */
export function stepRateToward(current: number, target: number, step: number = RATE_STEP): number {
  const delta = target - current;
  if (Math.abs(delta) <= step) return target;
  return current + Math.sign(delta) * step;
}
