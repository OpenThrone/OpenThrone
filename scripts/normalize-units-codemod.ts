#!/usr/bin/env node
import fg from 'fast-glob';
import path from 'path';
import { Node, Project, SyntaxKind } from 'ts-morph';

import { logError, logInfo } from '../src/utils/logger';

function parseArgs() {
  const args = process.argv.slice(2);
  const out: any = {
    glob: ['src/**/__tests__/**', 'src/**/*.test.ts*', 'src/**/*.spec.ts*'],
    dryRun: true,
    fix: false,
    importPath: '',
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--glob' && args[i + 1]) {
      out.glob = [args[i + 1]];
      i++;
    }
    if (a === '--fix') out.fix = true;
    if (a === '--dry-run') out.dryRun = true;
    if (a === '--importPath' && args[i + 1]) {
      out.importPath = args[i + 1];
      i++;
    }
  }
  return out;
}

const opts = parseArgs();
const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
  skipAddingFilesFromTsConfig: true,
});

const candidateEdits: Array<{
  file: string;
  loc: { line: number; col: number };
  before: string;
  after: string;
}> = [];

const files = fg.sync(opts.glob, { absolute: true, dot: true });
if (files.length === 0) {
  logInfo('No files matched glob(s):', opts.glob);
  process.exit(0);
}

logInfo(`Found ${files.length} files to scan (globs: ${opts.glob.join(',')})`);

for (const file of files) {
  if (
    !file.endsWith('.ts') &&
    !file.endsWith('.tsx') &&
    !file.endsWith('.js') &&
    !file.endsWith('.jsx')
  )
    continue;
  const sf = project.addSourceFileAtPathIfExists(file);
  if (!sf) continue;
  const originalText = sf.getFullText();
  let changed = false;

  const arrayLits = sf.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression);
  for (const arr of arrayLits) {
    // skip if already wrapped in normUnits call
    const parent = arr.getParent();
    if (
      parent &&
      Node.isCallExpression(parent) &&
      parent.getExpression().getText() === 'normUnits'
    )
      continue;

    const elements = arr.getElements();
    if (elements.length === 0) continue;
    // count object literal elements that look like legacy unit/item shapes
    let objectCount = 0;
    let candidateCount = 0;
    let hasIdOrUserId = false;
    for (const el of elements) {
      if (!Node.isObjectLiteralExpression(el)) continue;
      objectCount++;
      const props = el
        .getProperties()
        .map((p) => {
          // property name
          try {
            return (p as any).getName ? (p as any).getName() : undefined;
          } catch (e) {
            return undefined;
          }
        })
        .filter(Boolean) as string[];
      const hasType = props.includes('type');
      const hasQuantity = props.includes('quantity');
      const hasLevel = props.includes('level');
      if (props.includes('id') || props.includes('userId'))
        hasIdOrUserId = true;
      if (hasType && (hasQuantity || hasLevel)) candidateCount++;
    }

    // heuristics: at least one object literal and at least one candidate-looking element, and NOT already normalized (no id/userId)
    if (objectCount === 0 || candidateCount === 0 || hasIdOrUserId) continue;

    // also skip large arrays that are not likely fixtures (safety)
    if (elements.length > 200) continue;

    // capture snippet and line BEFORE mutating the node
    const before = arr.getText();
    const line =
      arr.getStartLineNumber && typeof arr.getStartLineNumber === 'function'
        ? arr.getStartLineNumber()
        : 0;
    const col = 0;

    // replace arr with normUnits(arr)
    arr.replaceWithText(`normUnits(${before})`);
    changed = true;

    candidateEdits.push({
      file,
      loc: { line, col },
      before: before.slice(0, 400),
      after: `normUnits(${before.slice(0, 400)})`,
    });
  }

  if (changed) {
    // ensure import exists
    const importName = 'normUnits';
    const alreadyImported = sf
      .getImportDeclarations()
      .some((id) =>
        id.getNamedImports().some((ni) => ni.getName() === importName),
      );
    if (!alreadyImported) {
      // compute import path: prefer provided importPath, otherwise relative path to test/utils/factories
      let { importPath } = opts;
      if (!importPath) {
        const target = path.resolve(process.cwd(), 'test/utils/factories');
        let rel = path.relative(path.dirname(file), target).replace(/\\/g, '/');
        if (!rel.startsWith('.')) rel = `./${rel}`;
        importPath = rel;
      }
      sf.insertImportDeclaration(0, {
        namedImports: [importName],
        moduleSpecifier: importPath,
      });
    }

    if (opts.fix) {
      // use synchronous save to avoid top-level await issues in some runners
      try {
        sf.saveSync();
      } catch (err) {
        logError('Failed to save file synchronously:', file, err);
      }
    }
  }
}

if (candidateEdits.length === 0) {
  logInfo('No candidate edits found.');
} else {
  logInfo(`Found ${candidateEdits.length} candidate edits:`);
  for (const e of candidateEdits) {
    logInfo('\n---');
    logInfo(`${e.file}:${e.loc.line}:${e.loc.col}`);
    logInfo('BEFORE (snippet):');
    logInfo(e.before.replace(/\n/g, '\n'));
    logInfo('\nAFTER (snippet):');
    logInfo(e.after.replace(/\n/g, '\n'));
  }
}

if (opts.fix) {
  logInfo(
    '\nSaved changes to disk. Remember to run your type-check and tests.',
  );
} else {
  logInfo('\nDry-run complete. To apply changes run with --fix');
}

// end
