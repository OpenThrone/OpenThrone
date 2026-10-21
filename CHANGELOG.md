# Changelog

OpenThrone follows [Semantic Versioning](https://semver.org/) on the 0.x line:
each production release raises the minor version and hotfixes raise the patch
version. Alpha builds carry the next version with an `-alpha` suffix.

## v0.6.0 (2026-10-20)

### Changed
- **One look across the game.** Pages, dialogs, tables and alerts now share
  the same frames, fonts and colours in every race theme:
  - Confirmation dialogs say what is at stake: red for actions you can't undo
    (some ask you to type a name first), the race colour for normal actions
    and green for positive ones. Red and green buttons now actually look red
    and green.
  - Alerts appear in one themed style in the bottom-right corner, and respect
    reduced motion.
  - Pages show a loading placeholder instead of zeros while they load, and a
    clear message when there is nothing to show.
  - War history, the attack target list, the armory and every alliance tab
    use one table style, and the tables scroll instead of overflowing on small
    screens.
  - Each page has one title. Bank, upgrades and armory share one tab bar.
  - Gold amounts are formatted the same way everywhere, in your language.
- **One quantity control** for training, the armory, battle upgrades, the
  bank, repairs and the alliance treasury, with the same Max button. Repairs
  and treasury deposits gain a Max button.
- **Upgrade tables** (fortifications, housing, economy, offense, armory and
  clandestine) follow one rule: they show what you own and what you can buy
  next, and explain what a locked row is waiting for.
- Player names show race and class in your language, with the race in its own
  colour, and online status is consistent on friends, enemies and profiles.
  The enemies list shows players instead of bare IDs.
- Alliance panels, role badges and the infighting tab use the race colours.
- The sidebar advisor arrows and stats refresh button are dark on the
  parchment so they are readable.

### Fixed
- The armory showed Buy on every level above yours; it now shows it only on
  the next level, which is the only one the server accepts.
- Gold dialogs, the session dialog, player profiles and the battle simulator
  are translated into German and Spanish, and long German button labels no
  longer get cut off.
- The friends and enemies pages no longer break when the server returns an
  error, and a failed load no longer leaves them loading forever.
- Upgrade Buy buttons can't be pressed twice while a purchase is in progress.
- Keyboard and screen-reader fixes for the XP info, loading animations and
  dialog buttons.
- Starting a new era no longer times out with many players, and battles
  running at the moment the era changes can no longer leak into the new era.
  A repeated request to start the same era is refused instead of running
  twice.

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
