import glob from 'fast-glob';
import fs from 'fs';
import path from 'path';

import { logError, logInfo } from '../src/utils/logger';

const replacements: Array<{ pattern: RegExp; replace: string }> = [
  { pattern: /\.json\(\)\s*\{/g, replace: '.json({' },
  { pattern: /\.findUnique\(\)\s*\{/g, replace: '.findUnique({' },
  { pattern: /\.findMany\(\)\s*\{/g, replace: '.findMany({' },
  { pattern: /\.findFirst\(\)\s*\{/g, replace: '.findFirst({' },
  { pattern: /\.update\(\)\s*\{/g, replace: '.update({' },
  { pattern: /\.create\(\)\s*\{/g, replace: '.create({' },
  { pattern: /\.delete\(\)\s*\{/g, replace: '.delete({' },
  { pattern: /\.count\(\)\s*\{/g, replace: '.count({' },
  { pattern: /\.upsert\(\)\s*\{/g, replace: '.upsert({' },
  // arrow function extra paren: async (tx) => ){
  { pattern: /=>\s*\)\s*\{/g, replace: '=> {' },
  // double close before brace: ')){' -> '){'
  { pattern: /\)\s*\)\s*\{/g, replace: '){' },
];

async function main() {
  const files = await glob(
    ['src/pages/api/**/*.ts', 'src/pages/api/**/*.tsx'],
    { dot: true },
  );
  let patched = 0;
  for (const f of files) {
    try {
      const p = path.resolve(f);
      let content = fs.readFileSync(p, 'utf8');
      const original = content;
      for (const r of replacements) {
        content = content.replace(r.pattern, r.replace);
      }
      if (content !== original) {
        fs.writeFileSync(p, content, 'utf8');
        logInfo('Fixed patterns in', p);
        patched++;
      }
    } catch (err) {
      logError('Error', f, err);
    }
  }
  logInfo(`Done. Patched ${patched} files.`);
}

main().catch((err) => {
  logError(err);
  process.exit(1);
});
