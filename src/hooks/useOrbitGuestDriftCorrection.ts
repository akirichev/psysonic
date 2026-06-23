import { useEffect } from 'react';

import { useOrbitStore } from '../store/orbitStore';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { estimateLivePosition } from '../api/orbit';
import {
  computeOrbitDriftMs,
  planOrbitDriftCorrection,
  stepRateToward,
  applyOrbitDriftRate,
  resetOrbitDriftRate,
  setOrbitDriftStatus,
  resetOrbitDriftStatus,
  pushDriftSample,
  makeDriftSmoother,
  ORBIT_DRIFT_LOOP_TICK_MS,
  ORBIT_DRIFT_SMOOTH_WINDOW,
  ORBIT_DRIFT_SMOOTH_MIN_SAMPLES,
} from '../utils/orbit';
import { clampCrossfadeSecs } from '../utils/playback/autodjAutoAdvance';
import { pushOrbitEvent } from '../utils/orbitDiag';

/**
 * Orbit — guest-side drift correction (v4: proportional + smooth ramp).
 *
 * Once per `LOOP_TICK_MS`, while we're an active guest playing the host's track,
 * nudge our playback rate toward the host. The raw drift is median-smoothed
 * (host position lands in coarse ~5 s quanta). A proportional planner picks a
 * target rate — gentle near synced, up to the ±10% cap when far — and the loop
 * ramps the live rate one step per tick toward it. Proportional + gradual
 * converges without the bang-bang overshoot ("can't lock on"); the speed
 * changes are stable now that the backend restamp is fixed.
 *
 * No auto-seek: past a hard threshold the loop sets status 'seek' and the Orbit
 * bar shows the manual Catch-Up button. Mounted from `useOrbitGuest`.
 */
export function useOrbitGuestDriftCorrection(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let timer: number | null = null;
    let currentRate = 1.0;
    let lastAction: string | null = null;
    const smoother = makeDriftSmoother(ORBIT_DRIFT_SMOOTH_WINDOW, ORBIT_DRIFT_SMOOTH_MIN_SAMPLES);

    const note = (action: string, detail: string) => {
      if (action !== lastAction) {
        pushOrbitEvent('drift-correction', `${action}: ${detail}`);
        lastAction = action;
      }
    };

    /** Abort to neutral (pause / track change / teardown). */
    const resetToNeutral = (reason: string) => {
      if (currentRate === 1.0 && lastAction === null) return;
      note('reset', reason);
      lastAction = null;
      currentRate = 1.0;
      smoother.reset();
      resetOrbitDriftRate();
      resetOrbitDriftStatus();
    };

    /** Ramp the live rate one step toward `target` and push it to the engine. */
    const rampTo = (target: number) => {
      currentRate = stepRateToward(currentRate, target);
      applyOrbitDriftRate(currentRate);
    };

    const step = () => {
      const state = useOrbitStore.getState().state;
      const player = usePlayerStore.getState();

      // ── Abort guards → neutral ──
      if (!state?.currentTrack || !player.currentTrack) { resetToNeutral('no track'); return; }
      const hostTrackId = state.currentTrack.trackId;
      if (player.currentTrack.id !== hostTrackId) { resetToNeutral('different track'); return; }
      if (!player.isPlaying || !state.isPlaying) { resetToNeutral('paused'); return; }

      const now = Date.now();
      const durationSec = player.currentTrack.duration;
      const trackDurationMs = durationSec * 1000;
      const hostPositionMs = estimateLivePosition(state, now);
      const tTrackRemSec = (trackDurationMs - hostPositionMs) / 1000;

      // ── Blend guard ──
      // Ramp to 1.0× through a crossfade / AutoDJ smooth-skip blend near the
      // track end. Gapless has no overlap, so no guard.
      const a = useAuthStore.getState();
      let blendGuardSec = 0;
      if (a.crossfadeEnabled) blendGuardSec = clampCrossfadeSecs(a.crossfadeSecs);
      if (a.autodjSmoothSkip) blendGuardSec = Math.max(blendGuardSec, 2);
      if (blendGuardSec > 0) blendGuardSec += 2;
      if (blendGuardSec > 0 && tTrackRemSec <= blendGuardSec) {
        rampTo(1.0);
        setOrbitDriftStatus({ action: 'blend', currentRate, smoothedDriftMs: smoother.value() });
        note('blend-guard', `ramping to 1.0× for blend, ${tTrackRemSec.toFixed(1)}s left`);
        return;
      }

      const guestPosMs = (player.currentTime ?? 0) * 1000;
      const rawDrift = computeOrbitDriftMs(state, guestPosMs, now);
      smoother.push(rawDrift);
      const smoothed = smoother.value();

      pushDriftSample({
        ts: now,
        driftMs: rawDrift,
        smoothedMs: smoothed,
        rate: currentRate,
        action: lastAction ?? 'idle',
        trackRemSec: tTrackRemSec,
        hostPosMs: hostPositionMs,
        guestPosMs,
      });

      // Window not full yet → ramp to neutral and wait for a stable reading.
      if (smoothed === null) {
        rampTo(1.0);
        setOrbitDriftStatus({ action: 'hold', currentRate, smoothedDriftMs: null });
        return;
      }

      const plan = planOrbitDriftCorrection({ driftMs: smoothed, hostIsPlaying: state.isPlaying });

      if (plan.action === 'seek') {
        // Too far for a soft nudge — ramp to 1.0× and surface the manual
        // Catch-Up button (OrbitSessionBar reads this 'seek' status). Never
        // auto-seek; the host stays the driver, the user takes the jump.
        rampTo(1.0);
        setOrbitDriftStatus({ action: 'seek', currentRate, smoothedDriftMs: smoothed });
        note('giveup', `smoothed drift ${Math.round(smoothed)}ms — too far, offering manual catch-up`);
        return;
      }

      if (plan.action === 'correct') {
        rampTo(plan.targetRate);
        setOrbitDriftStatus({ action: 'correct', currentRate, smoothedDriftMs: smoothed });
        note('correct', `smoothed drift ${Math.round(smoothed)}ms → target ${plan.targetRate.toFixed(2)}×`);
      } else {
        rampTo(1.0);
        setOrbitDriftStatus({ action: 'hold', currentRate, smoothedDriftMs: smoothed });
        note('hold', `smoothed drift ${Math.round(smoothed)}ms within band`);
      }
    };

    const tick = () => {
      timer = null;
      if (cancelled) return;
      try { step(); } catch { /* best-effort; retry next tick */ }
      if (!cancelled) timer = window.setTimeout(tick, ORBIT_DRIFT_LOOP_TICK_MS);
    };
    void tick();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      resetOrbitDriftRate();
      resetOrbitDriftStatus();
    };
  }, [active]);
}
