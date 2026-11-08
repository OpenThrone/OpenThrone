import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8');

// "Wealthiest" counts gear; the Overview's Net Worth does not. The list says
// so, so the two numbers no longer look like a bug (#321).
describe('World Stats wealthiest list', () => {
  for (const lang of ['en', 'de', 'es']) {
    it(`explains what it counts (${lang})`, () => {
      const { stats } = JSON.parse(
        read('public/locales', lang, 'community.json'),
      ) as { stats: Record<string, string> };
      expect(stats.top10WealthiestPlayersDescription?.length).toBeGreaterThan(
        20,
      );
    });
  }

  it('shows the description on the page', () => {
    expect(read('src/pages/community/stats.tsx')).toContain(
      "t('stats.top10WealthiestPlayersDescription')",
    );
  });
});
