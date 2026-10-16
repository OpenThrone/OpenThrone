import { describe, expect, it } from 'bun:test';

import { loadManifest, loadSchedule } from '../config';

describe('loadManifest', () => {
  it('loads the default manifest with expected shape', () => {
    const manifest = loadManifest('default');
    expect(manifest.name).toBe('default');
    expect(manifest.distribution).toBeDefined();
    expect(manifest.distribution?.count).toBe(35);
  });

  it('throws on missing manifest', () => {
    expect(() => loadManifest('does-not-exist')).toThrow();
  });

  it('default manifest has even race distribution', () => {
    const manifest = loadManifest('default');
    const races = manifest.distribution?.races;
    expect(races).toBeDefined();
    expect(races?.ELF).toBeCloseTo(0.25);
    expect(races?.HUMAN).toBeCloseTo(0.25);
    expect(races?.GOBLIN).toBeCloseTo(0.25);
    expect(races?.UNDEAD).toBeCloseTo(0.25);
  });
});

describe('loadSchedule', () => {
  it('loads the default schedule with expected allocations', () => {
    const schedule = loadSchedule('default');
    expect(schedule.name).toBe('default');
    expect(schedule.allocations.recruit).toBeCloseTo(0.3);
    expect(schedule.allocations.idle).toBeCloseTo(0.2);
  });

  it('default schedule allocations sum to 1.0', () => {
    const schedule = loadSchedule('default');
    const sum =
      schedule.allocations.recruit +
      schedule.allocations.trainWorkers +
      schedule.allocations.trainOffense +
      schedule.allocations.trainDefense +
      schedule.allocations.idle;
    expect(sum).toBeCloseTo(1, 3);
  });

  it('throws on missing schedule', () => {
    expect(() => loadSchedule('does-not-exist')).toThrow();
  });
});
