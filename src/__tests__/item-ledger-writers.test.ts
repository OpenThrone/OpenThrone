import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'bun:test';

/**
 * The daily item check (#370) only works if every UserItem writer records its
 * change. A new writer outside this list would show up as false drift, so it
 * must add a recordItemLedger call and then join the list.
 */
const INSTRUMENTED = [
  'src/pages/api/admin/users/[userId].ts',
  'src/pages/api/admin/users/[userId]/upgrades.ts',
  'src/services/TemporaryForceLedger.service.ts',
  'src/services/UserDefaults.service.ts',
  // The armory's replace-all. It records nothing by design: Armory.service
  // records each operation's delta, so a bad save here shows up as drift.
  'src/services/User.service.ts',
];
const WRITE =
  /\.userItem\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b|\bUserItem:\s*\{\s*(create|createMany|update|updateMany|upsert|delete|deleteMany|set)\b|(INSERT INTO|UPDATE|DELETE FROM)\s+"UserItem"/;

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === '__tests__' ? [] : sources(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });

describe('UserItem writers record their changes', () => {
  const files = sources('src').map((file) => ({
    file,
    text: readFileSync(file, 'utf8'),
  }));

  it('writes UserItem only from instrumented files', () => {
    expect(
      files.filter(({ text }) => WRITE.test(text)).map(({ file }) => file),
    ).toEqual(expect.arrayContaining(INSTRUMENTED));
    expect(
      files
        .filter(({ text }) => WRITE.test(text))
        .map(({ file }) => file)
        .filter((file) => !INSTRUMENTED.includes(file)),
    ).toEqual([]);
  });

  it('records a change in every instrumented file but the replace-all', () => {
    for (const { file, text } of files) {
      if (INSTRUMENTED.includes(file) && !file.endsWith('User.service.ts'))
        expect(`${file}: ${text.includes('recordItemLedger(')}`).toBe(
          `${file}: true`,
        );
    }
  });

  it('saves items through the replace-all only from Armory.service', () => {
    const callers = files
      .filter(({ text }) =>
        /updateUserAndBankHistory\([^;]*?'items',?\s*\)/.test(text),
      )
      .map(({ file }) => file);
    expect(callers).toEqual(['src/services/Armory.service.ts']);
  });
});
