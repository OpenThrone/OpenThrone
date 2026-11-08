# Era totals outlive the logs they came from

Date: 2026-11-06. Rules: [Eras and era resets](../mechanics/era-reset.md).

## Decision

Attack, bank and recruit logs stay on the 20-day limit. Ended-era leaderboards keep working from totals saved as those logs expire.

## Why

Leaderboards read the logs directly, so they shrank during an era and emptied 20 days after it ended. Keeping the logs longer would have fixed that but broken the 20 days stated in the privacy policy. The saved totals are per-player game data, not individual log entries.
