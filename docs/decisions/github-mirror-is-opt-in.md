# Releases end at Forgejo and production; GitHub is opt-in

Date: 2026-11-08. Details: [Git workflow](../git-workflow.md#releases).

## Decision

A release is deployed to Forgejo `master` and to production. Nothing is pushed to the public GitHub repository (mirror commit, tag or Release) unless the owner explicitly approves GitHub for that release. A general approval of the release does not cover GitHub.

## Reason given

After v0.12.1 was mirrored to GitHub as part of an approved release, the owner said releases should only go to Forgejo `master` and production at openthrone.dev. The releases already on GitHub (v0.5.1 to v0.12.1) stay as they are.

## What follows from it

- The release steps keep the GitHub mirror as step 5, marked opt-in; agents ask for it separately.
- A release that is not mirrored is folded into the next approved mirror commit unless the owner asks for its own.
- `master` must still be safe to publish (no hostnames, credentials or player data), because the owner may approve a mirror later.
