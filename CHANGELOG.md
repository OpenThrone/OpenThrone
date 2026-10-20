# Changelog

OpenThrone follows [Semantic Versioning](https://semver.org/) on the 0.x line:
each production release raises the minor version and hotfixes raise the patch
version. Alpha builds carry the next version with an `-alpha` suffix.

## v0.5.1 (2026-10-20)

### Fixed
- Rate limits now count each player's own connection. Before, every player
  shared one limit, so busy moments could block attacks and logins for
  everyone.
- Staff multi-account checks no longer group every player together.
- The attack recommendation shows reported defense strength and the observed
  number of defensive units separately, and intel reports label their armory
  rings by unit type (offensive units, defensive units, spies, sentries).

## v0.5.0 (2026-10-19)

### New
- **Attack recommendation.** The attack window has a collapsible
  recommendation below the Attack button. It reviews your own recent attacks
  on the target and spy reports you can read from the last 24 hours, then
  suggests whether conditions look favorable, call for a limited attack or
  call for caution. Evidence loses confidence over time, faster while the
  defender is online, and every report it used is linked. It is guidance,
  not a win probability or a turn recommendation.

### Changed
- **Attacking no longer ends new-player protection.** Protection lasts until
  you reach level 10, reach the population limit or the protection period
  runs out. Players who lost protection this era by attacking have it back
  if they still qualify.
- Attack and spy missions use sliders with exact number entry for turns and
  units, and show what the action commits before you send it.

### Fixed
- Spy mission buttons fit the window instead of overflowing sideways.

## v0.4.1 (2026-10-18)

### Fixed
- The new-player protection meter fills toward whichever limit ends
  protection first (time, population or level) instead of showing only the
  days left, and shows the population and level against their limits.

## v0.4.0 (2026-10-18)

### New
- **Game events.** Admins can schedule bonuses: extra XP or gold, extra daily
  citizens or a citizen multiplier (for daily growth, recruiting or both),
  bonus turns, and training or armory discounts. Events can run until the era
  ends, and running events show in the sidebar.
- **Training** has a Clear button for each section and a page-wide Clear all.
  MAX leaves room for gold already queued in other sections.
- **Alliances:**
  - Leaders can invite players.
  - Attacking a fellow member asks for confirmation first, and a members-only
    Infighting tab lists attacks between members.
  - A rank permission decides who may approve their own gold requests and
    loans.
  - Announcements, intel calls and loan notices arrive in the alliance chat.
- **Messaging** can be switched off by admins; while it is off, only admins
  and moderators can message (alliance chat always works).
- The Intelligence Report uses the battle report theme.
- The site footer shows the game version.

### Changed
- **Spy missions:** a spy force greater than the defender's sentry force
  wins, and a successful mission loses no spies.
- **New-player protection** lasts until the population reaches 50 + 14 days of
  housing growth + 14 days of recruiting (daily cap 25, set by admins), plus
  any citizens received from events.
- Profiles no longer show gold to visitors who are not signed in.
- German text uses the formal "Sie" throughout, and many remaining English
  strings are translated into German and Spanish.
- New Discord invite link.

### Fixed
- The Levels page no longer crashes after spending a proficiency point.
- War History, housing upgrades, bank history paging, the assassination target
  and the profile population are fixed. Training can no longer charge twice
  on a double-click.
- Alliance join requests, settings, ending wars and loan terms work as
  intended.
- Player reports, the email unsubscribe link and several admin tools work
  again.

## v0.3.0 (2026-10-17)

### New
- **Alliances, rebuilt:** ranks and permissions, leaving, kicking, leadership
  transfer and disbanding; a treasury with deposits, transfers, gold requests
  and loans; Farm, Hit and Block lists; ally diplomacy; announcements; an
  intel feed with shared reports and target calls. Players can belong to up to
  three alliances (leading at most one).
- **Battle protection rework:** protection lasts 14 days per era, ends earlier
  at a population cap or level 10, and is forfeited by attacking; a sidebar
  meter shows what is left.
- The recruit page shows the recruits left today and when the limit resets.
- The Overview offense breakdown shows real units.

### Changed
- Loot from protected-level players rises from 40% to 80%.
- SENTRY upgrades unlock with the SPY structure.

### Fixed
- Alliance pages no longer return "not found".
- The bank Withdraw card no longer says "up to 0 gold" when gold is banked.

## v0.2.0 (2026-10-16)

The large rework of combat, economy, eras, mercenaries, the admin panel and
the audit log (GitHub #317), published as one release.
