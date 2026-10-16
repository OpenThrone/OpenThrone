import { describe, expect, it } from 'bun:test';

import {
  isInsideViewport,
  SPOTLIGHT_PADDING,
  toHighlightRect,
} from './spotlight';

const VIEWPORT = { width: 1365, height: 768 };

const rect = (top: number, left: number, width: number, height: number) =>
  ({
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
  }) as DOMRect;

describe('isInsideViewport', () => {
  it('accepts a section fully inside the viewport', () => {
    expect(isInsideViewport(rect(100, 300, 1000, 200), VIEWPORT)).toBe(true);
  });

  it('rejects a section that is only partially below the fold', () => {
    // The overview stats row on a 768px window: top 712, bottom 855.
    expect(isInsideViewport(rect(712, 302, 1031, 143), VIEWPORT)).toBe(false);
  });

  it('rejects a section that is entirely above or below the viewport', () => {
    expect(isInsideViewport(rect(-200, 10, 100, 100), VIEWPORT)).toBe(false);
    expect(isInsideViewport(rect(900, 10, 100, 100), VIEWPORT)).toBe(false);
  });
});

describe('toHighlightRect', () => {
  it('never lets the highlight extend past the viewport', () => {
    const below = toHighlightRect(rect(712, 302, 1031, 143), VIEWPORT);
    const tall = toHighlightRect(rect(40, 300, 1000, 2400), VIEWPORT);
    const above = toHighlightRect(rect(-300, 300, 1000, 200), VIEWPORT);
    const beside = toHighlightRect(rect(100, -50, 200, 100), VIEWPORT);

    for (const box of [below, tall, above, beside]) {
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top + box.height).toBeLessThanOrEqual(VIEWPORT.height);
      expect(box.left + box.width).toBeLessThanOrEqual(VIEWPORT.width);
    }
  });

  it('keeps the gap around a section that already fits', () => {
    const box = toHighlightRect(rect(100, 300, 1000, 200), VIEWPORT);
    expect(box.top).toBe(100 - SPOTLIGHT_PADDING);
    expect(box.left).toBe(300 - SPOTLIGHT_PADDING);
    expect(box.width).toBe(1000 + SPOTLIGHT_PADDING * 2);
    expect(box.height).toBe(200 + SPOTLIGHT_PADDING * 2);
  });

  it('shrinks a section taller than the window to the visible part', () => {
    const box = toHighlightRect(rect(0, 300, 1000, 2400), VIEWPORT);
    expect(box.top).toBe(SPOTLIGHT_PADDING);
    expect(box.height).toBe(VIEWPORT.height - SPOTLIGHT_PADDING * 2);
  });

  it('truncates a below-the-fold section to what the window shows', () => {
    const box = toHighlightRect(rect(712, 302, 1031, 143), VIEWPORT);
    expect(box.top).toBe(712 - SPOTLIGHT_PADDING);
    expect(box.top + box.height).toBe(VIEWPORT.height - SPOTLIGHT_PADDING);
  });
});
