import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearDriftTrace,
  driftTraceCount,
  formatDriftTraceCsv,
  pushDriftSample,
  type DriftSample,
} from './driftTrace';

function sample(over: Partial<DriftSample> = {}): DriftSample {
  return {
    ts: Date.parse('2026-06-22T20:00:00.000Z'),
    driftMs: -812.4,
    rate: 1.03,
    targetRate: 1.1,
    action: 'soft',
    trackRemSec: 118.7,
    hostPosMs: 60_000,
    guestPosMs: 59_188,
    ...over,
  };
}

beforeEach(() => clearDriftTrace());

describe('driftTrace', () => {
  it('is empty until something is sampled', () => {
    expect(driftTraceCount()).toBe(0);
    expect(formatDriftTraceCsv()).toBe('');
  });

  it('formats a header and one rounded row per sample', () => {
    pushDriftSample(sample());
    const csv = formatDriftTraceCsv();
    const [header, row] = csv.split('\n');
    expect(header).toBe('iso_ts,drift_ms,rate,target,action,rem_s,host_ms,guest_ms');
    // drift/positions rounded to whole ms; rate/target to 2 dp; rem to 1 dp.
    expect(row).toBe('2026-06-22T20:00:00.000Z,-812,1.03,1.10,soft,118.7,60000,59188');
  });

  it('keeps samples in insertion order', () => {
    pushDriftSample(sample({ driftMs: -800, action: 'soft' }));
    pushDriftSample(sample({ driftMs: -200, action: 'hold' }));
    const rows = formatDriftTraceCsv().split('\n').slice(1);
    expect(rows[0]).toContain(',soft,');
    expect(rows[1]).toContain(',hold,');
  });

  it('caps the ring at 1200 samples, dropping the oldest', () => {
    for (let i = 0; i < 1300; i += 1) pushDriftSample(sample({ driftMs: i }));
    expect(driftTraceCount()).toBe(1200);
    const rows = formatDriftTraceCsv().split('\n').slice(1);
    // First surviving sample is #100 (0..99 dropped), last is #1299.
    expect(rows[0]).toContain(',100,');
    expect(rows[rows.length - 1]).toContain(',1299,');
  });

  it('clears the buffer', () => {
    pushDriftSample(sample());
    clearDriftTrace();
    expect(driftTraceCount()).toBe(0);
    expect(formatDriftTraceCsv()).toBe('');
  });
});
