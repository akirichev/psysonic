import { describe, expect, it } from 'vitest';

import { makeHostPositionStamper } from './hostPositionStamp';

describe('makeHostPositionStamper', () => {
  it('stamps now when the position advances', () => {
    const stamp = makeHostPositionStamper();
    expect(stamp(1000, true, 100)).toEqual({ positionMs: 1000, positionAt: 100 });
    expect(stamp(1500, true, 600)).toEqual({ positionMs: 1500, positionAt: 600 });
  });

  it('keeps the original timestamp while a playing position is frozen', () => {
    const stamp = makeHostPositionStamper();
    stamp(124664, true, 1000); // real measurement
    // Next ticks: position frozen (coarse update), wall-clock advances.
    expect(stamp(124664, true, 3500)).toEqual({ positionMs: 124664, positionAt: 1000 });
    expect(stamp(124664, true, 6000)).toEqual({ positionMs: 124664, positionAt: 1000 });
  });

  it('re-stamps when the position finally jumps', () => {
    const stamp = makeHostPositionStamper();
    stamp(124664, true, 1000);
    stamp(124664, true, 3500);
    expect(stamp(130236, true, 6000)).toEqual({ positionMs: 130236, positionAt: 6000 });
  });

  it('keeps the guest extrapolation continuous across a coarse position jump', () => {
    // Host plays 1.0×, so posMs tracks wall-clock. currentTime updates in coarse
    // steps: frozen at 100000 for three 2.5 s ticks, then jumps to 107500 at
    // t=7500. The guest extrapolates `posMs + (now - posAt)`.
    const stamp = makeHostPositionStamper();
    stamp(100000, true, 0);
    stamp(100000, true, 2500);
    const frozen = stamp(100000, true, 5000);
    const jumped = stamp(107500, true, 7500);

    const extrapolate = (s: { positionMs: number; positionAt: number }, now: number) =>
      s.positionMs + (now - s.positionAt);

    // At the moment of the jump (t=7500) the old frozen stamp and the fresh one
    // agree exactly — no leap. Without the fix `frozen` would carry posAt=5000,
    // read 102500, and then jump 5 s to 107500.
    expect(extrapolate(frozen, 7500)).toBe(107500);
    expect(extrapolate(jumped, 7500)).toBe(107500);
  });

  it('always stamps now when paused (no extrapolation happens then anyway)', () => {
    const stamp = makeHostPositionStamper();
    stamp(5000, false, 100);
    // Same position while paused → still stamps fresh now (guest stops
    // extrapolating on pause, so consistency isn't needed).
    expect(stamp(5000, false, 600)).toEqual({ positionMs: 5000, positionAt: 600 });
  });
});
