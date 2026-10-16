#!/usr/bin/env node
import fs from 'fs';
import glob from 'glob';
import path from 'path';

import { logInfo } from '../src/utils/logger';

const root = process.cwd();
const pattern = 'src/**/*.{ts,tsx}';
const files = glob.sync(pattern, { cwd: root, absolute: true });
logInfo(`Found ${files.length} files to scan`);
let edits = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  let out = src;

  // Collapse sequences like Number(session.user.id))) -> Number(session.user.id)
  out = out.replace(/(Number\([^)]*session[^)]*\))\)+/g, '$1');

  // Fix patterns like if (!Number(session?.user?.id))) -> if (!Number(session?.user?.id))
  out = out.replace(
    /if\s*\(\s*!\s*(Number\([^)]*session[^)]*\))\)+/g,
    'if (!$1',
  );

  // Fix trailing ) after Number(...) in arguments: foo(Number(session.user.id)); -> foo(Number(session.user.id)); (no-op) but remove double ))
  out = out.replace(/Number\([^)]*session[^)]*\)\)\s*\)/g, (m) =>
    m.replace(/\)\)\s*\)/, '))'),
  );

  if (out !== src) {
    fs.writeFileSync(file, out, 'utf8');
    edits++;
    logInfo(`Cleaned ${path.relative(root, file)}`);
  }
}

logInfo(`Done. Cleaned ${edits} files.`);
