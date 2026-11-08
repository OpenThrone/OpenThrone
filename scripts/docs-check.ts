/**
 * Keeps the maintained docs honest. See AGENTS.md section 16.
 *
 *   bun run docs:check            dead links and mechanics doc shape
 *   bun run docs:check --release  also fails on docs whose source changed
 *                                 since they were last verified
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

const ROOT_DOCS = [
  'AGENTS.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'DESIGN.md',
  'PRODUCT.md',
  'README.md',
];
const MECHANICS_DIR = 'docs/mechanics';
const MECHANICS_INDEX = `${MECHANICS_DIR}/README.md`;
const VERIFIED_DIRS = [MECHANICS_DIR, 'docs/features'];
/** Generated output, ignored by Git. */
const SKIPPED_DIRS = new Set(['docs/api']);

const LINK_PATTERN = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const VERIFIED_PATTERN =
  /^Last verified against code: (\d{4}-\d{2}-\d{2}) \(alpha ([0-9a-f]{7,40})\)$/m;

export type DocProblem = { file: string; problem: string };

/** Relative link targets in a Markdown document, without their anchors. */
export function extractRelativeLinks(markdown: string): string[] {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, '');
  const links: string[] = [];
  for (const [, href] of withoutCode.matchAll(LINK_PATTERN)) {
    const isExternal = /^[a-z][a-z0-9+.-]*:/i.test(href);
    if (isExternal || href.startsWith('/') || href.startsWith('#')) continue;
    links.push(decodeURI(href.split('#')[0]));
  }
  return links;
}

export function parseVerified(
  markdown: string,
): { date: string; commit: string } | null {
  const match = markdown.match(VERIFIED_PATTERN);
  return match ? { date: match[1], commit: match[2] } : null;
}

/** Repo-relative paths of the source files a doc's links point at. */
export function linkedSourceFiles(file: string, markdown: string): string[] {
  return extractRelativeLinks(markdown)
    .map((link) => normalize(join(dirname(file), link)))
    .filter((target) => /^(src|prisma|scripts)\//.test(target));
}

function listMarkdown(root: string, dir: string): string[] {
  if (SKIPPED_DIRS.has(dir) || !existsSync(join(root, dir))) return [];
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) {
      return listMarkdown(root, path);
    }
    return name.endsWith('.md') ? [path] : [];
  });
}

function maintainedDocs(root: string): string[] {
  return [
    ...ROOT_DOCS.filter((file) => existsSync(join(root, file))),
    ...listMarkdown(root, 'docs'),
  ];
}

export function findDeadLinks(root: string): DocProblem[] {
  return maintainedDocs(root).flatMap((file) =>
    extractRelativeLinks(readFileSync(join(root, file), 'utf8'))
      .filter((link) => !existsSync(join(root, dirname(file), link)))
      .map((link) => ({ file, problem: `dead link: ${link}` })),
  );
}

export function findMechanicsProblems(root: string): DocProblem[] {
  const indexPath = join(root, MECHANICS_INDEX);
  const index = existsSync(indexPath)
    ? extractRelativeLinks(readFileSync(indexPath, 'utf8'))
    : [];
  return listMarkdown(root, MECHANICS_DIR)
    .filter((file) => file !== MECHANICS_INDEX)
    .flatMap((file) => {
      const markdown = readFileSync(join(root, file), 'utf8');
      const problems: string[] = [];
      if (!parseVerified(markdown)) {
        problems.push('missing "Last verified against code" line');
      }
      if (!/^## Source$/m.test(markdown)) {
        problems.push('missing "## Source" section');
      } else if (linkedSourceFiles(file, markdown).length === 0) {
        problems.push('links no source files');
      }
      if (!/^## Tests$/m.test(markdown)) {
        problems.push('missing "## Tests" section');
      }
      if (
        !index.some((link) => normalize(join(MECHANICS_DIR, link)) === file)
      ) {
        problems.push(`not listed in ${MECHANICS_INDEX}`);
      }
      return problems.map((problem) => ({ file, problem }));
    });
}

/** Docs whose linked source files changed after their verified commit. */
export function findStaleDocs(root: string): DocProblem[] {
  const files = VERIFIED_DIRS.flatMap((dir) => listMarkdown(root, dir));
  return files.flatMap((file) => {
    const markdown = readFileSync(join(root, file), 'utf8');
    const verified = parseVerified(markdown);
    if (!verified) return [];
    const sources = [...new Set(linkedSourceFiles(file, markdown))];
    if (sources.length === 0) return [];
    let output: string;
    try {
      output = execFileSync(
        'git',
        ['diff', '--name-only', verified.commit, 'HEAD', '--', ...sources],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
    } catch {
      return [{ file, problem: `unknown commit: ${verified.commit}` }];
    }
    const changed = output.split('\n').filter(Boolean);
    return changed.length === 0
      ? []
      : [
          {
            file,
            problem: `stale since ${verified.commit}: ${changed.join(', ')}`,
          },
        ];
  });
}

function main() {
  const root = relative(process.cwd(), join(import.meta.dir, '..')) || '.';
  const release = process.argv.includes('--release');
  const problems = [...findDeadLinks(root), ...findMechanicsProblems(root)];
  const stale = findStaleDocs(root);

  for (const { file, problem } of problems)
    console.error(`${file}: ${problem}`);
  for (const { file, problem } of stale) {
    (release ? console.error : console.warn)(`${file}: ${problem}`);
  }

  const blocking = problems.length + (release ? stale.length : 0);
  console.log(
    `docs:check: ${problems.length} problem(s), ${stale.length} stale doc(s)`,
  );
  if (blocking > 0) process.exit(1);
}

if (import.meta.main) main();
