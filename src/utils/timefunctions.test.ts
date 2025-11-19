import { getTimeRemaining } from './timefunctions';
import { describe, it, expect, vi } from 'bun:test';

describe('getTimeRemaining', () => {
  it('should return the correct time remaining', () => {
    const endtime = '2022-12-31T23:59:59Z';
    const currentTime = new Date('2022-12-31T12:00:00Z');

    // Monkeypatch Date.prototype.getTime so new Date().getTime() returns the fixed currentTime.
    // Use a typed reference and Object.defineProperty to avoid unsafe `as any` casts.
    const originalGetTime = Date.prototype.getTime as (this: Date) => number;
    const patchedGetTime = function (this: Date) {
      // Call the original getTime on the fixed currentTime to avoid recursion
      return originalGetTime.call(currentTime);
    };

    // Replace the property descriptor so we can restore it later exactly as it was.
    const originalDescriptor = Object.getOwnPropertyDescriptor(Date.prototype, 'getTime');
    Object.defineProperty(Date.prototype, 'getTime', {
      value: patchedGetTime,
      configurable: true,
      writable: true,
    });

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
      // Restore the original getTime implementation (descriptor if present to preserve attributes)
      if (originalDescriptor) {
        Object.defineProperty(Date.prototype, 'getTime', originalDescriptor);
      } else {
        Date.prototype.getTime = originalGetTime;
      }
    }
  });

  // Add more test cases for different endtime values and expected results
});