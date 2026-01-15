#!/usr/bin/env node
import fs from 'fs';
import glob from 'glob';
import path from 'path';

import { logInfo } from '../src/utils/logger';

const root = process.cwd();
const pattern = 'src/pages/api/**/*.ts*';

const files = glob.sync(pattern, { cwd: root, absolute: true });
logInfo(`Found ${files.length} files to scan`);
let edits = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  let out = src;
  // Replace common patterns. Keep idempotent by not replacing if already Number(...)
  out = out.replace(
    /(?<!Number\()req\.session\.user\.id/g,
    'Number(req.session.user.id)',
  );
  out = out.replace(
    /(?<!Number\()session\.user\.id/g,
    'Number(session.user.id)',
  );
  out = out.replace(
    /(?<!Number\()req\.session\?\.user\?\.id/g,
    'Number(req.session?.user?.id)',
  );
  out = out.replace(
    /(?<!Number\()session\?\.user\?\.id/g,
    'Number(session?.user?.id)',
  );
  if (out !== src) {
    fs.writeFileSync(file, out, 'utf8');
    edits++;
    logInfo(`Edited ${path.relative(root, file)}`);
  }
}
logInfo(`Done. Edited ${edits} files.`);
