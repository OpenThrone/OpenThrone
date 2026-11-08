import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  extractRelativeLinks,
  findDeadLinks,
  findMechanicsProblems,
  findStaleDocs,
  linkedSourceFiles,
  parseVerified,
} from './docs-check';

const REPO_ROOT = join(import.meta.dir, '..');
const VERIFIED = 'Last verified against code: 2026-11-06 (alpha 5afb2d50)';

function withFiles(files: Record<string, string>, run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'docs-check-'));
  try {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('extractRelativeLinks', () => {
  it('keeps relative links and drops anchors', () => {
    expect(
      extractRelativeLinks('[a](one.md) and [b](../two.md#section)'),
    ).toEqual(['one.md', '../two.md']);
  });

  it('skips external, absolute and same-page links', () => {
    expect(
      extractRelativeLinks(
        '[a](https://example.com) [b](mailto:x@example.com) [c](/abs.png) [d](#top)',
      ),
    ).toEqual([]);
  });

  it('ignores links inside fenced code', () => {
    expect(extractRelativeLinks('```md\n[a](gone.md)\n```')).toEqual([]);
  });

  it('decodes encoded paths such as Next dynamic routes', () => {
    expect(extractRelativeLinks('[a](../src/pages/api/%5Bid%5D.ts)')).toEqual([
      '../src/pages/api/[id].ts',
    ]);
  });
});

describe('parseVerified', () => {
  it('reads the date and commit', () => {
    expect(parseVerified(`# Title\n\n${VERIFIED}\n`)).toEqual({
      date: '2026-11-06',
      commit: '5afb2d50',
    });
  });

  it('rejects a line with no commit', () => {
    expect(
      parseVerified('Last verified against code: 2026-11-06\n'),
    ).toBeNull();
  });
});

describe('linkedSourceFiles', () => {
  it('resolves links from the doc and keeps only code paths', () => {
    expect(
      linkedSourceFiles(
        'docs/mechanics/combat.md',
        '[a](../../src/a.ts) [b](stamina.md) [c](../../prisma/schema.prisma)',
      ),
    ).toEqual(['src/a.ts', 'prisma/schema.prisma']);
  });
});

describe('findDeadLinks', () => {
  it('reports a link to a missing file', () => {
    withFiles(
      { 'README.md': '[ok](docs/a.md) [bad](docs/gone.md)', 'docs/a.md': 'a' },
      (root) => {
        expect(findDeadLinks(root)).toEqual([
          { file: 'README.md', problem: 'dead link: docs/gone.md' },
        ]);
      },
    );
  });
});

describe('findMechanicsProblems', () => {
  const complete = `# X\n\n${VERIFIED}\n\n## Source\n[a](../../src/a.ts)\n\n## Tests\n`;

  it('accepts a complete, indexed doc', () => {
    withFiles(
      {
        'docs/mechanics/README.md': '[X](x.md)',
        'docs/mechanics/x.md': complete,
      },
      (root) => expect(findMechanicsProblems(root)).toEqual([]),
    );
  });

  it('reports each missing piece', () => {
    withFiles(
      {
        'docs/mechanics/README.md': '',
        'docs/mechanics/x.md': '# X\n\n## Source\nnothing linked\n',
      },
      (root) => {
        expect(
          findMechanicsProblems(root).map(({ problem }) => problem),
        ).toEqual([
          'missing "Last verified against code" line',
          'links no source files',
          'missing "## Tests" section',
          'not listed in docs/mechanics/README.md',
        ]);
      },
    );
  });
});

describe('findStaleDocs', () => {
  const git = (root: string, ...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args],
      { cwd: root, encoding: 'utf8' },
    ).trim();

  const docAt = (commit: string) =>
    `# X\n\nLast verified against code: 2026-11-06 (alpha ${commit})\n\n[a](../../src/a.ts)\n`;

  it('flags a doc only once its linked source changes', () => {
    withFiles({ 'src/a.ts': 'one', 'src/b.ts': 'one' }, (root) => {
      git(root, 'init', '-q');
      git(root, 'add', '.');
      git(root, 'commit', '-q', '-m', 'first');
      const commit = git(root, 'rev-parse', 'HEAD');

      mkdirSync(join(root, 'docs/mechanics'), { recursive: true });
      writeFileSync(join(root, 'docs/mechanics/x.md'), docAt(commit));
      writeFileSync(join(root, 'src/b.ts'), 'two');
      git(root, 'add', '.');
      git(root, 'commit', '-q', '-m', 'unrelated source');
      expect(findStaleDocs(root)).toEqual([]);

      writeFileSync(join(root, 'src/a.ts'), 'two');
      git(root, 'add', '.');
      git(root, 'commit', '-q', '-m', 'linked source');
      expect(findStaleDocs(root)).toEqual([
        {
          file: 'docs/mechanics/x.md',
          problem: `stale since ${commit}: src/a.ts`,
        },
      ]);
    });
  });
});

describe('findStaleDocs with a commit git cannot find', () => {
  it('reports the doc instead of crashing', () => {
    withFiles(
      {
        'docs/mechanics/x.md': `# X\n\n${VERIFIED}\n\n[a](../../src/a.ts)\n`,
        'src/a.ts': 'one',
      },
      (root) => {
        execFileSync('git', ['init', '-q'], { cwd: root });
        expect(findStaleDocs(root)).toEqual([
          {
            file: 'docs/mechanics/x.md',
            problem: 'unknown commit: 5afb2d50',
          },
        ]);
      },
    );
  });
});

describe('the repository docs', () => {
  it('have no dead relative links', () => {
    expect(findDeadLinks(REPO_ROOT)).toEqual([]);
  });

  it('keep every mechanics doc complete and indexed', () => {
    expect(findMechanicsProblems(REPO_ROOT)).toEqual([]);
  });
});
