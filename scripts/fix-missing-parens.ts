import glob from 'fast-glob';
import fs from 'fs';
import path from 'path';

import { logError, logInfo } from '../src/utils/logger';

function processFile(filePath: string): boolean {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // We'll scan for '{' characters and look back up to 3 lines to check
  // if there are unbalanced parentheses. If so, and the line contains
  // heuristics like 'session' or 'Number(' or 'isAdmin' or 'await',
  // insert the missing ')' characters before the '{'.

  let offset = 0;
  const idxs: number[] = [];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') idxs.push(i);
  }

  for (const origPos of idxs) {
    const pos = origPos + offset;
    // find up to 3 previous newlines
    let start = pos - 1;
    for (let i = 0; i < 3; i++) {
      const nl = content.lastIndexOf('\n', start - 1);
      if (nl === -1) break;
      start = nl;
    }
    const segment = content.slice(start === -1 ? 0 : start + 1, pos);

    // quick heuristic: only operate on segments that look like code with '('
    if (!segment.includes('(')) continue;

    // additional heuristics: ensure it's likely the problematic lines
    const heuristics = [
      'session',
      'Number(',
      'isAdmin',
      'await',
      'if ',
      'parseInt',
      'typeof',
    ];
    if (!heuristics.some((h) => segment.includes(h))) continue;

    const open = (segment.match(/\(/g) || []).length;
    const close = (segment.match(/\)/g) || []).length;
    const need = open - close;
    if (need > 0 && need <= 4) {
      // insert the required number of ')' before the '{'
      const insertion = ')'.repeat(need);
      content = content.slice(0, pos) + insertion + content.slice(pos);
      offset += insertion.length;
    }
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    logInfo('Patched', filePath);
    return true;
  }
  return false;
}

async function main() {
  const files = await glob(
    ['src/pages/api/**/*.ts', 'src/pages/api/**/*.tsx'],
    { dot: true },
  );
  let patched = 0;
  for (const f of files) {
    try {
      if (processFile(path.resolve(f))) patched++;
    } catch (err) {
      logError('Error processing', f, err);
    }
  }
  logInfo(`Done. Patched ${patched} files.`);
}

main().catch((err) => {
  logError(err);
  process.exit(1);
});
