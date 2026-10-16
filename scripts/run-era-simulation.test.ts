import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  createExhaustiveManifest,
  parseCliOptions,
  runManifest,
  SMOKE_MANIFEST,
} from './run-era-simulation';

describe('ERA simulation CLI', () => {
  it('builds the documented smoke and exhaustive cell counts', () => {
    expect(SMOKE_MANIFEST.cells).toHaveLength(1);
    expect(createExhaustiveManifest().cells).toHaveLength(1500);
  });

  it('rejects unsafe worker counts', () => {
    expect(() => parseCliOptions(['--max-workers', '3'])).toThrow(
      '--max-workers maximum is 2',
    );
    expect(() => parseCliOptions(['--per-run-timeout', '0'])).toThrow();
  });

  it('writes atomic completion artifacts and resumes a matching cell', async () => {
    const root = await mkdtemp(join(tmpdir(), 'era-cli-test-'));
    const manifestPath = join(root, 'manifest.json');
    const output = join(root, 'output');
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        name: 'tiny',
        cells: [
          {
            id: 'tiny-cell',
            seed: 7,
            days: 1,
            rulesetId: 'production',
            recruitmentBand: 5,
            allianceMode: 'none',
            population: { active: 10, passive: 20 },
          },
        ],
      }),
    );
    try {
      const options = parseCliOptions([
        '--manifest',
        manifestPath,
        '--output',
        output,
        '--per-run-timeout',
        '120000',
      ]);
      expect(await runManifest(options)).toBe(0);
      const complete = JSON.parse(
        await readFile(join(output, 'tiny-cell', 'complete.json'), 'utf8'),
      ) as { checksum: string };
      expect(complete.checksum).toHaveLength(64);

      const resumed = parseCliOptions([
        '--manifest',
        manifestPath,
        '--output',
        output,
        '--resume',
      ]);
      expect(await runManifest(resumed)).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a stale completed cell when its manifest hash changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'era-cli-manifest-hash-'));
    const manifestPath = join(root, 'manifest.json');
    const output = join(root, 'output');
    const cell = {
      id: 'hash-checked-cell',
      seed: 7,
      days: 1,
      rulesetId: 'production',
      recruitmentBand: 5,
      allianceMode: 'none',
      population: { active: 10, passive: 20 },
    };
    try {
      await writeFile(
        manifestPath,
        JSON.stringify({ version: 1, name: 'original', cells: [cell] }),
      );
      expect(
        await runManifest(
          parseCliOptions(['--manifest', manifestPath, '--output', output]),
        ),
      ).toBe(0);

      await writeFile(
        manifestPath,
        JSON.stringify({ version: 1, name: 'changed', cells: [cell] }),
      );
      expect(
        await runManifest(
          parseCliOptions([
            '--manifest',
            manifestPath,
            '--output',
            output,
            '--resume',
          ]),
        ),
      ).toBe(1);
      const index = JSON.parse(
        await readFile(join(output, 'index.json'), 'utf8'),
      ) as { results: Array<{ status: string; error?: string }> };
      expect(index.results[0]?.status).toBe('failed');
      expect(index.results[0]?.error).toContain('Manifest hash mismatch');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('requires an explicit overwrite flag before replacing completed artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'era-cli-overwrite-'));
    const manifestPath = join(root, 'manifest.json');
    const output = join(root, 'output');
    const manifest = {
      version: 1,
      name: 'overwrite',
      cells: [
        {
          id: 'overwrite-cell',
          seed: 7,
          days: 1,
          rulesetId: 'production',
          recruitmentBand: 5,
          allianceMode: 'none',
          population: { active: 10, passive: 20 },
        },
      ],
    };
    try {
      await writeFile(manifestPath, JSON.stringify(manifest));
      const baseArgs = ['--manifest', manifestPath, '--output', output];
      expect(await runManifest(parseCliOptions(baseArgs))).toBe(0);
      expect(await runManifest(parseCliOptions(baseArgs))).toBe(1);
      const index = JSON.parse(
        await readFile(join(output, 'index.json'), 'utf8'),
      ) as { results: Array<{ status: string; error?: string }> };
      expect(index.results[0]?.status).toBe('failed');
      expect(index.results[0]?.error).toContain('use --resume or --overwrite');
      expect(
        await runManifest(parseCliOptions([...baseArgs, '--overwrite'])),
      ).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
