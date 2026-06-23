import { describe, expect, it } from 'vitest';

import { planOrbitDriftCorrection, stepRateToward, type DriftCorrectionInput } from './driftCorrectionPlan';
import { RATE_MAX, RATE_MIN, RATE_STEP } from './driftCorrectionConstants';

function input(over: Partial<DriftCorrectionInput> = {}): DriftCorrectionInput {
  return { driftMs: 0, hostIsPlaying: true, ...over };
}

// Proportional speed correction is re-enabled (SPEED_CORRECTION_ENABLED = true)
// for another round of live testing. These cover the active controller.
describe('planOrbitDriftCorrection (proportional)', () => {
  it('holds when the host is paused', () => {
    expect(planOrbitDriftCorrection(input({ driftMs: -3000, hostIsPlaying: false }))).toEqual({ action: 'hold' });
  });

  it('holds inside the deadband', () => {
    expect(planOrbitDriftCorrection(input({ driftMs: -900 }))).toEqual({ action: 'hold' }); // < 1000
    expect(planOrbitDriftCorrection(input({ driftMs: 900 }))).toEqual({ action: 'hold' });
  });

  it('reaches the full cap at the full-scale drift', () => {
    // FULL_SCALE = 4000: behind 4 s → +10%, ahead 4 s → −10%.
    const behind = planOrbitDriftCorrection(input({ driftMs: -4000 }));
    expect(behind).toEqual({ action: 'correct', targetRate: RATE_MAX });
    const ahead = planOrbitDriftCorrection(input({ driftMs: 4000 }));
    expect(ahead).toEqual({ action: 'correct', targetRate: RATE_MIN });
  });

  it('scales gently for a mid drift (no full whack near synced)', () => {
    // Halfway between deadband (1000) and full-scale (4000) → ~half the cap.
    const p = planOrbitDriftCorrection(input({ driftMs: -2500 }));
    expect(p.action).toBe('correct');
    if (p.action !== 'correct') return;
    // (2500-1000)/(4000-1000) = 0.5 → 1 + 0.10×0.5 = 1.05
    expect(p.targetRate).toBeCloseTo(1.05, 5);
  });

  it('is continuous across the deadband edge — a tiny over-deadband drift gets a tiny nudge', () => {
    const p = planOrbitDriftCorrection(input({ driftMs: -1001 }));
    expect(p.action).toBe('correct');
    if (p.action !== 'correct') return;
    expect(p.targetRate).toBeGreaterThan(1.0);
    expect(p.targetRate).toBeLessThan(1.001); // essentially neutral right at the edge
  });

  it('clamps beyond full-scale to the cap', () => {
    expect(planOrbitDriftCorrection(input({ driftMs: -7000 }))).toEqual({ action: 'correct', targetRate: RATE_MAX });
  });

  it('seeks (manual button) only past the hard threshold', () => {
    expect(planOrbitDriftCorrection(input({ driftMs: -9000 }))).toEqual({ action: 'seek' }); // > 8000
    expect(planOrbitDriftCorrection(input({ driftMs: 9000 }))).toEqual({ action: 'seek' });
  });

  it('never proposes a rate outside the ±10% cap', () => {
    for (const d of [-50000, -3000, 3000, 50000]) {
      const p = planOrbitDriftCorrection(input({ driftMs: d }));
      if (p.action === 'correct') {
        expect(p.targetRate).toBeGreaterThanOrEqual(RATE_MIN - 1e-9);
        expect(p.targetRate).toBeLessThanOrEqual(RATE_MAX + 1e-9);
      }
    }
  });
});

describe('stepRateToward', () => {
  it('moves at most one step and snaps on arrival', () => {
    let rate = 1.0;
    const seq = [rate];
    for (let i = 0; i < 50 && rate !== 1.1; i += 1) {
      const next = stepRateToward(rate, 1.1);
      expect(Math.abs(next - rate)).toBeLessThanOrEqual(RATE_STEP + 1e-9);
      rate = next;
      seq.push(rate);
    }
    expect(rate).toBeCloseTo(1.1, 9);
    expect(seq.length).toBe(11);
  });

  it('ramps back to exactly 1.0× without float dust', () => {
    let rate = 1.07;
    for (let i = 0; i < 50 && rate !== 1.0; i += 1) rate = stepRateToward(rate, 1.0);
    expect(rate).toBe(1.0);
  });

  it('tracks a lowered target mid-ramp (no overshoot)', () => {
    // Heading to 1.10 but the target drops to 1.03 — should settle at 1.03.
    let rate = 1.0;
    rate = stepRateToward(rate, 1.1); // 1.01
    rate = stepRateToward(rate, 1.1); // 1.02
    for (let i = 0; i < 10 && rate !== 1.03; i += 1) rate = stepRateToward(rate, 1.03);
    expect(rate).toBeCloseTo(1.03, 9);
  });
});
