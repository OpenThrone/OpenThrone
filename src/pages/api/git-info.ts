import { execSync } from 'child_process';

export default function handler(req, res) {
  try {
    // Get the latest commit hash
    const latestCommit = execSync('git rev-parse HEAD').toString().trim();

    // Get the latest commit message
    const latestCommitMessage = execSync('git log -1 --pretty=format:"%s"').toString().trim();

    // Get the number of pending changes
    const modifiedFiles = execSync('git diff --shortstat').toString().trim();
    const untrackedFilesCount = execSync('git ls-files --others --exclude-standard').toString().split('\n').filter(Boolean).length;

    // Formulate pending changes message
    const pendingChanges = `${modifiedFiles}, ${untrackedFilesCount} untracked files`;

    // Send the git information as a response
    res.status(200).json({ latestCommit, latestCommitMessage, pendingChanges });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve git information' });
  }
}
