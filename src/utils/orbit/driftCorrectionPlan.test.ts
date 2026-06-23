import { describe, expect, it } from 'vitest';

import { planOrbitDriftCorrection, stepRateToward, type DriftCorrectionInput } from './driftCorrectionPlan';
import { RATE_STEP } from './driftCorrectionConstants';

function input(over: Partial<DriftCorrectionInput> = {}): DriftCorrectionInput {
  return { driftMs: 0, hostIsPlaying: true, ...over };
}

// Speed correction is disabled (audible wobble in practice). The planner now
// only holds 1.0× or surfaces the manual Catch-Up button past a moderate drift.
describe('planOrbitDriftCorrection (speed correction disabled)', () => {
  it('holds when the host is paused', () => {
    expect(planOrbitDriftCorrection(input({ driftMs: -9000, hostIsPlaying: false }))).toEqual({ action: 'hold' });
  });

  it('holds for small and moderate drift — never nudges the rate', () => {
    for (const d of [-2900, -1500, -1000, 0, 1000, 2900]) {
      expect(planOrbitDriftCorrection(input({ driftMs: d }))).toEqual({ action: 'hold' });
    }
  });

  it('surfaces the catch-up button (seek) once drift passes the threshold', () => {
    expect(planOrbitDriftCorrection(input({ driftMs: -3100 }))).toEqual({ action: 'seek' });
    expect(planOrbitDriftCorrection(input({ driftMs: 4000 }))).toEqual({ action: 'seek' });
    expect(planOrbitDriftCorrection(input({ driftMs: 13000 }))).toEqual({ action: 'seek' });
  });

  it('never proposes a speed correction while disabled', () => {
    for (const d of [-50000, -3000, -1600, 1600, 3000, 50000]) {
      expect(planOrbitDriftCorrection(input({ driftMs: d })).action).not.toBe('correct');
    }
  });
});

describe('stepRateToward', () => {
  it('moves at most one step and snaps on arrival', () => {
    let rate = 1.0;
    for (let i = 0; i < 50 && rate !== 1.1; i += 1) {
      const next = stepRateToward(rate, 1.1);
      expect(Math.abs(next - rate)).toBeLessThanOrEqual(RATE_STEP + 1e-9);
      rate = next;
    }
    expect(rate).toBeCloseTo(1.1, 9);
  });

  it('ramps back to exactly 1.0× without float dust', () => {
    let rate = 1.07;
    for (let i = 0; i < 50 && rate !== 1.0; i += 1) rate = stepRateToward(rate, 1.0);
    expect(rate).toBe(1.0);
  });
});
