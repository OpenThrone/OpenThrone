import { afterEach, describe, expect, test } from 'bun:test';

import {
  getArtworkBaseUrl,
  getArtworkUrl,
  getPureCrest,
  resolveArtworkSource,
} from './artwork';

const names = [
  'NEXT_PUBLIC_ARTWORK_MODE',
  'NEXT_PUBLIC_ARTWORK_BASE_URL',
  'NEXT_PUBLIC_USE_AWS',
  'NEXT_PUBLIC_AWS_S3_ENDPOINT',
] as const;
const original = Object.fromEntries(
  names.map((name) => [name, process.env[name]]),
);
afterEach(() =>
  names.forEach((name) => {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }),
);

function configure(base?: string) {
  names.forEach((name) => {
    delete process.env[name];
  });
  if (base) process.env.NEXT_PUBLIC_ARTWORK_BASE_URL = base;
}

describe('optional artwork', () => {
  test('base checkout has no artwork network dependency', () => {
    configure();
    expect(getArtworkBaseUrl()).toBeNull();
    expect(resolveArtworkSource('/assets/shields/ELF.webp')).toBeNull();
    expect(getPureCrest('ELF')).toStartWith('data:image/svg+xml,');
  });
  test('remote uses the migration key, while uploaded avatars remain intact', () => {
    configure('https://art.example.test/');
    expect(resolveArtworkSource('/assets/images/ui/public/example.webp')).toBe(
      'https://art.example.test/artwork/v1/assets/images/ui/public/example.webp?v=1',
    );
    expect(resolveArtworkSource('https://avatars.example.test/me.png')).toBe(
      'https://avatars.example.test/me.png',
    );
  });
  test('pure mode overrides legacy and new configuration', () => {
    configure('https://art.example.test');
    process.env.NEXT_PUBLIC_ARTWORK_MODE = 'pure';
    process.env.NEXT_PUBLIC_USE_AWS = 'true';
    process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT = 'https://legacy.example.test';
    expect(
      getArtworkUrl('images/Characters/default-character.webp'),
    ).toBeNull();
  });
  test('legacy opt-in continues working', () => {
    configure();
    process.env.NEXT_PUBLIC_USE_AWS = 'true';
    process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT = 'https://legacy.example.test';
    expect(getArtworkUrl('images/avatarFrame-ELF.webp')).toBe(
      'https://legacy.example.test/images/avatarFrame-ELF.webp',
    );
  });
  test('invalid bases and object traversal cannot create remote URLs', () => {
    for (const base of [
      'bad',
      'http://art.example.test',
      'https://user:password@art.example.test',
      'https://art.example.test?secret=1',
    ]) {
      configure(base);
      expect(getArtworkBaseUrl()).toBeNull();
    }
    configure('https://art.example.test');
    for (const key of [
      '../secret',
      '/absolute',
      'images/../secret',
      'https://elsewhere.test/art',
      'images//art',
      'images/a?x=1',
    ])
      expect(getArtworkUrl(key)).toBeNull();
  });
});
