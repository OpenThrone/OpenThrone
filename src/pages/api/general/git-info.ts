import { execSync } from 'child_process';

import { withApiGuard } from '@/middleware/apiGuard';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'none',
});

function handler(_req, res) {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    // Get the latest commit hash
    const latestCommit = execSync('git rev-parse HEAD').toString().trim();

    // Get the latest commit message
    const latestCommitMessage = execSync('git log -1 --pretty=format:"%s"')
      .toString()
      .trim();

    // Get the number of pending changes
    const modifiedFiles = execSync('git diff --shortstat').toString().trim();
    const untrackedFilesCount = execSync(
      'git ls-files --others --exclude-standard',
    )
      .toString()
      .split('\n')
      .filter(Boolean).length;

    // Formulate pending changes message
    const pendingChanges = `${modifiedFiles}, ${untrackedFilesCount} untracked files`;

    // Send the git information as a response
    res.status(200).json({ latestCommit, latestCommitMessage, pendingChanges });
  } catch {
    res.status(500).json({ error: 'Failed to retrieve git information' });
  }
}

export default guardedHandler(handler);
