import { describe, expect, it } from 'bun:test';

import {
  REDIRECT_GRACE_MS,
  toastsToHideOnNavigation,
} from '@/utils/toastScope';

describe('toastsToHideOnNavigation', () => {
  it('dismisses a page toast when the player moves to another page (#277)', () => {
    const toasts = new Map([['trained', 10_000]]);
    expect(toastsToHideOnNavigation(toasts, 13_000)).toEqual(['trained']);
  });

  it('keeps a toast raised just before a redirect', () => {
    const toasts = new Map([
      ['old', 1_000],
      ['created', 20_000 - REDIRECT_GRACE_MS + 100],
    ]);
    expect(toastsToHideOnNavigation(toasts, 20_000)).toEqual(['old']);
  });
});
