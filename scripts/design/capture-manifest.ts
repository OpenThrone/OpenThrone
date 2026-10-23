import { existsSync, readFileSync } from 'fs';
import path from 'path';

import { DESIGN_PAGES } from './pages';

/** Reject incomplete runs before the builder touches the existing design document. */
export const loadCaptures = (input: string, only: Set<string> | null) => {
  const manifest = JSON.parse(
    readFileSync(path.join(input, 'manifest.json'), 'utf8'),
  );
  if (
    typeof manifest.captureId !== 'string' ||
    !manifest.captureId ||
    !Array.isArray(manifest.pages)
  )
    throw new Error('Invalid capture manifest; run design:extract again');
  const { pages }: { pages: { key: string; name: string; url: string }[] } =
    manifest;
  const selected = pages.filter((p) => !only || only.has(p.name));
  if (
    !selected.length ||
    (only && [...only].some((name) => !selected.some((p) => p.name === name)))
  )
    throw new Error(
      'Requested pages are missing from the completed extraction',
    );
  const seen = new Set<string>();
  return selected.map((p) => {
    const known = DESIGN_PAGES.find((group) => group.key === p.key)?.pages.some(
      (page) => page.name === p.name && page.url === p.url,
    );
    const key = `${p.key}/${p.name}`;
    if (!known || seen.has(key))
      throw new Error('Invalid or duplicate page in capture manifest');
    seen.add(key);
    const tree = JSON.parse(
      readFileSync(path.join(input, 'dom', p.key, `${p.name}.json`), 'utf8'),
    );
    const shot = path.join(input, 'screens', p.key, `${p.name}.png`);
    if (
      tree.captureId !== manifest.captureId ||
      tree.name !== p.name ||
      tree.url !== p.url ||
      !tree.root ||
      !(tree.width > 0) ||
      !(tree.height > 0) ||
      !existsSync(shot)
    )
      throw new Error(`Incomplete or stale capture: ${key}`);
    const png = readFileSync(shot);
    if (
      png.length < 24 ||
      png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      !png.readUInt32BE(20)
    )
      throw new Error(`Invalid screenshot: ${key}`);
    return { key: p.key, tree };
  });
};
