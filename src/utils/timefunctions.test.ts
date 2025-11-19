import { getTimeRemaining } from './timefunctions';
import { describe, it, expect, vi } from 'bun:test';

describe('getTimeRemaining', () => {
  it('should return the correct time remaining', () => {
    const endtime = '2022-12-31T23:59:59Z';
    const currentTime = new Date('2022-12-31T12:00:00Z');

    // Mock Date.now() to return the fixed currentTime
    const originalDateNow = Date.now;
    Date.now = vi.fn(() => currentTime.getTime());

    const expectedTimeRemaining = {
      total: Date.parse(endtime) - currentTime.getTime(),
      days: 0,
      hours: 11,
      minutes: 59,
      seconds: 59,
    };

    try {
      expect(getTimeRemaining(endtime)).toEqual(expectedTimeRemaining);
    } finally {
      // Restore original Date.now
      Date.now = originalDateNow;
    }
  });

  // Add more test cases for different endtime values and expected results
});