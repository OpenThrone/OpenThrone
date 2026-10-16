import { afterEach, describe, expect, test } from 'bun:test';

import { getArtworkBaseUrl, resolveArtworkSource } from './artwork';
import {
  getArtworkPreviewMode,
  isArtworkPreviewHost,
  setArtworkPreviewMode,
} from './artworkPreview';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalMode = process.env.NEXT_PUBLIC_ARTWORK_MODE;
const originalBase = process.env.NEXT_PUBLIC_ARTWORK_BASE_URL;
function host(hostname: string) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { hostname },
      localStorage: { setItem() {} },
    },
  });
}
afterEach(() => {
  host('ot.aioxhost.com');
  setArtworkPreviewMode('default');
  if (originalWindow)
    Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
  if (originalMode === undefined) delete process.env.NEXT_PUBLIC_ARTWORK_MODE;
  else process.env.NEXT_PUBLIC_ARTWORK_MODE = originalMode;
  if (originalBase === undefined)
    delete process.env.NEXT_PUBLIC_ARTWORK_BASE_URL;
  else process.env.NEXT_PUBLIC_ARTWORK_BASE_URL = originalBase;
});

describe('OT-only artwork comparison', () => {
  test('only the exact preview hostname can enable an override', () => {
    for (const name of [
      'openthrone.dev',
      'alpha.openthrone.dev',
      'ot.aioxhost.com.example.test',
      'localhost',
    ]) {
      expect(isArtworkPreviewHost(name)).toBe(false);
      host(name);
      setArtworkPreviewMode('r2');
      expect(getArtworkPreviewMode()).toBe('default');
    }
    expect(isArtworkPreviewHost('ot.aioxhost.com')).toBe(true);
  });
  test('R2 comparison can bypass the pure default, and switching back restores it', () => {
    host('ot.aioxhost.com');
    process.env.NEXT_PUBLIC_ARTWORK_MODE = 'pure';
    process.env.NEXT_PUBLIC_ARTWORK_BASE_URL = 'https://art.example.test';
    expect(getArtworkBaseUrl()).toBeNull();
    setArtworkPreviewMode('r2');
    expect(getArtworkBaseUrl()).toBe('https://art.example.test');
    setArtworkPreviewMode('default');
    expect(getArtworkBaseUrl()).toBeNull();
  });
  test('pure comparison disables themed images while preserving uploaded avatars', () => {
    host('ot.aioxhost.com');
    process.env.NEXT_PUBLIC_ARTWORK_BASE_URL = 'https://art.example.test';
    setArtworkPreviewMode('pure');
    expect(resolveArtworkSource('/assets/shields/HUMAN.webp')).toBeNull();
    expect(resolveArtworkSource('https://avatars.example.test/me.png')).toBe(
      'https://avatars.example.test/me.png',
    );
  });
  test('an override cannot carry over to another hostname', () => {
    host('ot.aioxhost.com');
    setArtworkPreviewMode('r2');
    host('openthrone.dev');
    process.env.NEXT_PUBLIC_ARTWORK_MODE = 'pure';
    expect(getArtworkBaseUrl()).toBeNull();
  });
});
