import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { loadCaptures } from './capture-manifest';

let dir: string;
const page = { key: 'public', name: 'home', url: '/' };
const manifest = () =>
  writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ captureId: 'new-run', pages: [page] }),
  );
const tree = (captureId = 'new-run') =>
  writeFileSync(
    path.join(dir, 'dom/public/home.json'),
    JSON.stringify({
      captureId,
      name: 'home',
      url: '/',
      root: {},
      width: 1440,
      height: 900,
    }),
  );

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'ot-capture-test-'));
  mkdirSync(path.join(dir, 'dom/public'), { recursive: true });
  mkdirSync(path.join(dir, 'screens/public'), { recursive: true });
  manifest();
  tree();
  const png = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  png.writeUInt32BE(1440, 16);
  png.writeUInt32BE(900, 20);
  writeFileSync(path.join(dir, 'screens/public/home.png'), png);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('completed design captures', () => {
  test('accepts a completed public-only extraction without old game captures', () => {
    expect(loadCaptures(dir, null).map((capture) => capture.key)).toEqual([
      'public',
    ]);
  });
  test('rejects stale trees from a previous extraction', () => {
    tree('old-run');
    expect(() => loadCaptures(dir, null)).toThrow('stale capture');
  });
  test('requires every explicitly selected page', () => {
    expect(() => loadCaptures(dir, new Set(['home', 'overview']))).toThrow(
      'missing',
    );
  });
  test('rejects missing screenshots', () => {
    rmSync(path.join(dir, 'screens/public/home.png'));
    expect(() => loadCaptures(dir, null)).toThrow('Incomplete');
  });
  test('rejects corrupt screenshots', () => {
    writeFileSync(path.join(dir, 'screens/public/home.png'), 'incomplete png');
    expect(() => loadCaptures(dir, null)).toThrow('Invalid screenshot');
  });
  test('rejects duplicate manifest pages', () => {
    writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({ captureId: 'new-run', pages: [page, page] }),
    );
    expect(() => loadCaptures(dir, null)).toThrow('duplicate');
  });
  test('rejects missing trees', () => {
    rmSync(path.join(dir, 'dom/public/home.json'));
    expect(() => loadCaptures(dir, null)).toThrow();
  });
  test('rejects empty and unknown selections', () => {
    writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({ captureId: 'new-run', pages: [] }),
    );
    expect(() => loadCaptures(dir, null)).toThrow('missing');
  });
  test('a failed build preserves existing output without invoking FigCraft', async () => {
    rmSync(path.join(dir, 'manifest.json'));
    const output = path.join(dir, 'existing.figcraft');
    writeFileSync(output, 'previous design');
    const child = Bun.spawn(
      [
        process.execPath,
        '--no-env-file',
        'scripts/design/build-figcraft.ts',
        '--in',
        dir,
        '--out',
        output,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(await child.exited).toBe(1);
    expect(readFileSync(output, 'utf8')).toBe('previous design');
  });
});
