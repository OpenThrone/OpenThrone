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

  // Fix accidental 'req.Number(' -> 'Number('
  out = out.replace(/req\.Number\(/g, 'Number(');
  out = out.replace(/Number\(req\.Number\(/g, 'Number(');

  // Fix accidental 'req.Number(session' -> 'Number(session'
  out = out.replace(/req\.Number\(session/g, 'Number(session');

  // Fix repeated Number(...) wrapping like Number(Number(session...)) -> Number(session...)
  out = out.replace(/Number\(\s*Number\(/g, 'Number(');

  // Fix malformed typeof checks that use Number(...) around session.user.id
  // Common broken form produced earlier:
  // typeof Number(session.user.id) === 'string' ? parseInt(Number(session.user.id), 10) : Number(session.user.id)
  out = out.replace(
    /typeof\s+Number\(session(?:\?\.|\.)user(?:\?\.|\.)id\)\s*===\s*['"]string['"]\s*\?\s*parseInt\(Number\(session(?:\?\.|\.)user(?:\?\.|\.)id\)\s*,\s*10\)\s*:\s*Number\(session(?:\?\.|\.)user(?:\?\.|\.)id\)/g,
    `typeof session?.user?.id === 'string' ? parseInt(session.user.id, 10) : Number(session?.user?.id)`,
  );

  // Also fix variants that include req.Number or Number(req.Number(...))
  out = out.replace(
    /typeof\s+Number\(req\.Number\(session(?:\?\.|\.)user(?:\?\.|\.)id\)\)\s*===\s*['"]string['"]\s*\?\s*parseInt\(Number\(req\.Number\(session(?:\?\.|\.)user(?:\?\.|\.)id\)\)\s*,\s*10\)\s*:\s*Number\(req\.Number\(session(?:\?\.|\.)user(?:\?\.|\.)id\)\)/g,
    `typeof session?.user?.id === 'string' ? parseInt(session.user.id, 10) : Number(session?.user?.id)`,
  );

  // Fix occurrences where parseInt(Number(session.user.id)) -> parseInt(String(session.user.id))
  out = out.replace(
    /parseInt\(Number\(session(?:\?\.|\.)user(?:\?\.|\.)id\)\s*,\s*10\)/g,
    'parseInt(String(session.user.id), 10)',
  );
  out = out.replace(
    /parseInt\(Number\(req\.Number\(session(?:\?\.|\.)user(?:\?\.|\.)id\)\)\s*,\s*10\)/g,
    'parseInt(String(session.user.id), 10)',
  );

  if (out !== src) {
    fs.writeFileSync(file, out, 'utf8');
    edits++;
    logInfo(`Patched ${path.relative(root, file)}`);
  }
}

logInfo(`Done. Patched ${edits} files.`);
