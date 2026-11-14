# Git workflow

How every change moves through Git, from a feature branch to a public release. It applies to people and agents alike. Hostnames, deploy steps and credentials are kept outside this repository; [AGENTS.md](../AGENTS.md) says where.

## Remotes and branches

| Remote | Role |
| --- | --- |
| `origin` | Internal Forgejo. The real history, pull requests, issues and tags. |
| `github` | Public mirror. One squashed commit per production release, nothing else, and only when the owner explicitly asks for that release. |

| Branch | Role |
| --- | --- |
| `alpha` | Integration branch. Deploys to the alpha server. Every change reaches it through a pull request. |
| `master` | Production. Only release pull requests from `alpha` merge into it. |
| Feature branches | Short-lived, one pull request each, deleted once merged. |

Nobody commits to `alpha` or `master` directly. Any other long-lived branch must be named in its pull request or issue; otherwise it is treated as stale (see [Cleaning up](#cleaning-up)).

Point the local default branch at `alpha`, so tools that start worktrees from the default branch start from the right place:

```bash
git remote set-head origin alpha
```

`git remote set-head origin -a` resets it to Forgejo's default (`master`). Run the command above again if that happens.

## Feature branch lifecycle

1. **Check the base.** `git fetch origin`, then `git log origin/alpha..origin/master --no-merges --oneline` must print nothing. If it prints commits, `master` has changes `alpha` lacks: stop and ask before branching. Merge-only differences are expected after every release.
2. **Branch from `alpha`.** `git switch -c <type>/<short-name> origin/alpha`. Types in use: `feat`, `fix`, `chore`, `docs`, `test`. Add the issue number when there is one (`fix/352-bank-error`).
3. **Use a worktree for parallel work.** `git worktree add ../next-DC-<name> -b <type>/<name> origin/alpha`. A new worktree has no generated files: copy `.husky/_` from an existing checkout, link or copy `node_modules` (a symlink is enough for commits, builds need a real copy), and run `prisma generate`.
4. **Commit focused changes.** Stage explicit paths, not `git add -A`: worktree setup leaves `prisma/generated`, `node_modules` and `bun.lock` behind, and none of them belong in a commit. Agents commit and push through `agent-forgejo` (see [AGENTS.md](../AGENTS.md#publishing-to-forgejo)).
5. **Stay current.** When `alpha` moves on, merge it into the branch (`Merge branch alpha into <branch>`) rather than rebasing a branch someone else may have fetched.
6. **Open a pull request into `alpha`.** It states the problem, the behavior after the change, the checks run, the feature touchpoints and a `Docs:` line ([AGENTS.md](../AGENTS.md) sections 14 and 16).
7. **Merge, then confirm.** Merge with a merge commit. Right after a push, Forgejo may still be computing mergeability and the merge can fail quietly, so read the pull request back and confirm `merged: true` before deploying or deleting anything. Deleting the branch of an unmerged pull request closes it unmerged.
8. **Deploy to alpha** and verify there.
9. **Clean up in the same session.** Delete the remote branch, the local branch and the worktree (`git worktree remove <path>`). A worktree with uncommitted changes is never left behind: commit the changes, or save them as a patch and say where.

## Never commit

- **Generated files:** `design/openthrone.figcraft` (rebuilt with `bun run design:sync`), `.next`, `prisma/generated`, `node_modules`, `bun.lock` (the repository uses `package-lock.json`). Never `git add -f` a file `.gitignore` excludes.
- **Large files:** keep every file well under 50 MB. GitHub rejects any file over 100 MB, which blocks the release mirror.
- **Secrets and private data:** `.env*` files, keys, tokens, real player data, private hostnames. `master` becomes public, so anything merged into `alpha` will be published.

## Releases

A release is finished when steps 1 to 4, 6 and 7 are done; skipping them leaves the tags and version numbers behind production. Step 5, the GitHub mirror, is opt-in: nothing is pushed to GitHub unless the owner explicitly approves GitHub for that release. A general approval of the release does not cover it.

1. **Version pull request into `alpha`.** Set `version` in `package.json` and `package-lock.json` to `X.Y.Z` (drop `-alpha`) and turn the `CHANGELOG.md` heading into `## vX.Y.Z (<date>)`.
2. **Release pull request from `alpha` into `master`.** Complete the release documentation gate ([AGENTS.md](../AGENTS.md) section 16). It merges only with the owner's go-ahead.
3. **Deploy production** and confirm the footer shows `vX.Y.Z` and the release merge commit.
4. **Tag Forgejo.** Create the tag `vX.Y.Z` on the release merge commit, with the message `Release vX.Y.Z (production)`. Agents create it through the Forgejo tags API under their bot login, because `agent-forgejo` does not push tags.
5. **Mirror to GitHub (only with the owner's explicit go-ahead for this release).** Ask separately; skip this step otherwise. One commit per release, whose parent is the previous release on `github/master` and whose tree is exactly Forgejo `master`'s tree:

   ```bash
   git fetch origin master && git fetch github master
   tree=$(git rev-parse origin/master^{tree})
   commit=$(git commit-tree "$tree" -p github/master -F release-message.txt)
   git diff --stat github/master "$commit"      # review: no secrets, private hosts or player data
   git push github "$commit:refs/heads/master"  # fast-forward only
   git push github "$commit:refs/tags/vX.Y.Z"
   gh release create vX.Y.Z -R OpenThrone/OpenThrone --verify-tag --latest --notes-file notes.md
   ```

   The message is `Release vX.Y.Z`, the Forgejo commit and tree it snapshots, what the release includes, and how it was validated. The commit is authored by the repository owner, set through `GIT_AUTHOR_*` and `GIT_COMMITTER_*` variables for that one command; never change Git configuration. The release notes are the version's `CHANGELOG.md` entry. A release that was not mirrored is folded into the next approved mirror commit unless the owner asks for its own.
6. **Start the next pre-release.** A pull request into `alpha` sets `version` to `X.(Y+1).0-alpha` in both package files and adds `## vX.(Y+1).0-alpha (unreleased)` to the top of `CHANGELOG.md`, so alpha's footer stops showing the production version.
7. **Check the versions.** Forgejo `master` and Forgejo `alpha` show the expected versions (`git show <ref>:package.json`) and Forgejo has the tag. If the release was mirrored, also check `github/master`, the GitHub tag, and that `gh release list` shows `vX.Y.Z` as Latest.

## Cleaning up

Run this after a release, or whenever branches pile up.

- **Merged branches**, whose tip is an ancestor of `origin/alpha`: delete the remote and local branch and any worktree on it.
- **Unmerged branches:** look up the branch's pull request and run `git cherry origin/alpha <branch>`. Delete it if its pull request merged, or if the pull request was closed and its work landed elsewhere. Archive the tip first with `git update-ref refs/archive/<date>/<branch> <sha>`, so it stays recoverable locally. When a branch holds work that never landed and nobody said to drop it, ask its owner.
- **Keep** `alpha`, `master`, branches with an open pull request, and long-lived branches that are named as such.
- **Worktrees with uncommitted changes:** compare the changes with `origin/alpha`. Save anything that is not already there as a patch before removing the worktree.
