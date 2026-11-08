# Changelog

OpenThrone follows [Semantic Versioning](https://semver.org/) on the 0.x line:
each production release raises the minor version and hotfixes raise the patch
version. Alpha builds carry the next version with an `-alpha` suffix.

## v0.12.0 (2026-11-08)

### Added
- **Daily item check (#370):** every armory purchase, sale and upgrade, admin
  edit, force contribution and account reset now records its item change.
  Each day a report-only check confirms every player's item counts follow
  from those records, and lists anything unexplained for staff under
  Administration → Ledgers → Item drift. It never changes a player's items.

### Changed
- **Battle XP follows real fights:** a lost attack now pays experience by how
  hard you pushed: nothing when your offense is a quarter of the defender's
  defense or less, rising to the full amount at three quarters. Defenders
  earn by the size of the threat too, at least 15% of the old amount, so
  trading deliberate losses no longer levels anyone. Wins pay as before.
  Defenders who stay at one level for more than three game days earn a
  quarter more defender experience for each further game day, up to three
  times as much, so nobody can camp at a low level forever. Earlier battles
  still replay under the rules they were fought with.
- **Small armies can take losses:** the per-battle casualty limit (8% of
  the army) used to round down, so an army of 12 or fewer never lost a unit.
  It now rounds up by chance in proportion to the fraction, so a 10-soldier
  army that is beaten loses about one soldier in every battle or so, the same
  rate as a large army. Earlier battles replay under their own rules.
- **Guard losses no longer grow with your civilians:** a defender's casualty
  allowance in a won assault used to be budgeted against the whole
  population, so idle workers and citizens made your guards lose more (or
  fewer) troops even though only guards can fall. The allowance is now
  anchored to the units that actually fight and can die, matching how an
  attacker's losses are budgeted on the attacking army alone. Civilians now
  join the fight, become targets and count toward that allowance at the same
  moment, when the fort's HP reaches 0; before then they neither help nor
  count. Earlier battles replay under their own rules.
- **Mercenaries open early (#335):** you can now hire mercenaries from level
  5, once your fort is a Village, instead of waiting for the Tavern at level
  70. Higher tiers no longer wait for the Copper Mine and the Meat Market:
  tier 2 opens with the Outpost at level 15 and tier 3 with the Stronghold at
  level 30, the same forts that train those units. Spy and Sentry mercenaries
  follow the later forts those units train at.
- **Bank capacity:** the bank now enforces the limit Economy upgrades have
  always listed, from 10,000,000 gold on the Farm up to 500,000,000. Gold
  already banked above the limit stays yours and can be withdrawn, but you
  can't deposit more until you are back under it. The Bank page shows your
  limit.

### Fixed
- **Intel reports show the exact population:** the attack list shows every
  kingdom's true population for free, but an intel report showed only the
  sampled share, so a report could say "Observed: 43" next to a list saying
  48. The report now shows the exact total ("Population: 48") while the
  per-unit troop breakdown stays sampled and is labeled as such ("Troops
  observed: 43 of 48 (intel quality 83%)"). Reports stored before the change
  keep the old sampled label.
- **New-player protection is called what it is (#284):** the sidebar badge and
  the attack list now say "Gold shielded" instead of "Protected", and their
  tooltips, the FAQ, How to Play and the first-kingdom guide explain that
  protection shields part of your gold on hand while attacks still take units
  and fort HP. The rule itself is unchanged.
- **Sidebar era (#360, #274):** the Era cell shows just the era number, not
  the full era name or an internal id.
- **Playtest fixes (#273–#348):**
  - Intel samples troops by headcount, shows its quality, reports every unit
    group when intel is near full and lists the kingdom stats your spies
    gathered. Spy reports show when the mission ran, not when you opened it.
  - Defense Log rows show fort damage and fort HP before and after.
  - Bank history lists structure purchases, and the training charge matches
    the training card.
  - Armory and training cards show what each unit or item adds.
  - The bank names the deposit window next to its countdown.
  - How to Play explains experience and levels, the classes, the structures,
    the turn interval and where mercenaries come from. Signup describes the
    classes.
  - The Levels page names its proficiency buttons, fort income includes the
    real proficiency bonus, Defense Ratio is explained, and income rows add
    up in whole gold.
  - The Overview shows your own fort, Spy Guild and Sentry Post levels.
  - The Attack list shows one rank per player and no longer formats gold
    twice.
  - Recruit again recruits again instead of only resetting the dialog.
  - War History outcomes read Won or Lost, the spy table is named Spy
    Missions, and the battle timeline counts lost units, not soldiers.
  - Page notices close when you leave the page, and a Learn lesson counts as
    done once its last step shows.
  - Alliance browse has an empty state, requirements show fort levels, and
    mercenary and gold transfer locks say where to build what they need.
  - World Stats says what its wealthiest list counts.
- **Mercenary costs in your bank history:** hiring and renewing mercenaries now
  appear in your bank history, so the gold they cost is no longer missing from
  your records. This applies from now on; earlier contracts aren't added.
- **Admin activity timeline:** Details now shows recorded unit and equipment
  quantities, conversions, bank transfer direction, upgrade levels and fort
  repairs. Older actions without recorded details are marked as such. Fort,
  housing and racial upgrades now show readable names, the armory building is
  listed under Upgrades, and action names are translated in German and Spanish.
- **Era leaderboards:** attack, casualty and recruiter leaderboards for ended
  eras no longer shrink or empty over time, and attacks and defends won at the
  end of an era now count the whole era. This applies from now on; eras that
  already ended keep what was left.
- **Friend requests:** a declined or ended friendship no longer blocks a
  pair forever, and limits stop anyone from repeating an unwanted request.
  After a decline you wait 7 days, and after three declines only the other
  player can reach out. After a friendship ends, both players wait 7 days.
  Cancelling a request means a 24-hour wait, and you can send 20 requests a
  day.
- **Fort repair:** asking to repair more than your fort is missing no longer
  fails with "Not enough gold" when you can afford the real repair.
- **Long Sword:** Humans can now buy it, at the top Armory level.
- **How to Play:** no longer says each level widens who you can attack. The
  attack range is a set number of levels either way.
- **Erasure leaves alliances cleanly (#318):** erasing an account now removes
  it from every alliance inside the erasure transaction. An erased leader is
  succeeded by the highest-ranked remaining member (ties go to the
  longest-standing one), and an erased last member dissolves the alliance
  through the regular disband path, treasury split and all. Borrowed alliance
  forces are returned to the reserve; outstanding loans are collected from
  gold on hand but never forgiven — the debt stays on the pseudonymous
  account, and each succession or dissolution is recorded in the audit log.
- **Clearer bank errors (#352):** if a deposit or withdrawal can't reach the
  server, the bank says so in your language and asks you to check your balance
  instead of showing a raw error.
- **Attack limit countdown (#359):** the refusal when you've hit the per-player
  attack limit now tells you when your next attack opens.
- **Staying signed in (#362):** a brief server or network failure no longer
  drops you to the logged-out view. The game retries and keeps your kingdom on
  screen.
- **Armory purchases (#361):** the confirmation names the quantity, the item
  and the units it's for, so items that share a name can't be confused.
- **Spy reports (#368):** every intel field now always appears, and anything
  your spies missed reads "Not Observed" instead of vanishing from the report.

## v0.11.0 (2026-10-31)

### Added
- **Era relaunch veterans:** before erasing long-inactive accounts, we can now
  email everyone inactive since a fixed cutoff (the era relaunch date) with a
  link to the news post and a shorter, admin-chosen deadline. Erased accounts
  keep only a one-way fingerprint of the email address and display name: if
  the same email registers again within two years, we email a claim link to
  that address; opening it restores the "Era 1 Tester" title, the original
  join date and, if they enter it, the old display name. The title shows as
  a badge on profiles and is editable in the admin Edit Player screen,
  alongside a read-only veteran records list on the inactive users page.
- **Chronicles and strategy guides:** a public Chronicles page tells the
  story of the Shattered Realms, the four peoples and the Great Turning
  between eras. Three new guides (your first kingdom, economy and growth,
  combat, spying and stamina) read their numbers from the live game rules.
  Both are open without signing in, in English, German and Spanish, and are
  linked from the menu and footer.
- **Cron run log:** every scheduled-job run (daily, turns, bots, account
  status) is now recorded with start, finish, duration, a sanitized summary
  and any error, and staff can review it under Administration → System →
  Cron run log, with filters by job and status and the last successful run
  per job. Failures are highlighted; rows older than 90 days are pruned.
- **Voided battles:** if a fight was won through a bug or under a broken rule,
  an administrator can void it with a written reason. The battle report stays
  as history, marked "Voided by an administrator" for both players, while the
  gold, fallen and wounded troops, fort damage, attack turns, stamina and
  experience it moved are returned or taken back. Both players get a message,
  and a voided battle no longer counts toward leaderboards or the daily
  attack limit.
- **Your data:** Settings has a new Your data card. Download a copy of your
  profile, kingdom, battles, messages you wrote, friends, alliance, payment and
  sign-in records as a JSON file (password required, once every 24 hours), or
  ask for your account to be erased. Erasure is confirmed by email, then waits
  14 days: your account is deactivated, and signing in during that time offers
  to cancel it. Afterwards your email, name, avatar, bio, sign-in history and
  the messages you wrote are erased. The same options apply to every player,
  wherever they live.
- **Ban, suspend, close and delete from Edit Player:** the Operations tab now
  has an Account status section. Staff with account-status access can suspend
  a player for a set number of days, ban them for a set time or permanently,
  and reactivate them, each with a recorded reason. Administrators can also
  close an account or schedule it for deletion (closed now, personal data
  erased after the 14-day grace period).

### Changed
- **Losses hit every unit tier:** battle casualties no longer eat your
  cheapest troops first. The dead of a battle are now spread over all your
  unit levels in proportion to how many troops you field at each level, so
  a screen of level 1 troops can't shield your best units, for attackers
  and defenders alike. Hired mercenaries still take the front line within
  their level. The number of casualties in each battle is unchanged: the
  same fight on the same dice costs the same units and wounded as before,
  only which levels they come from differs. Battles fought earlier still
  replay exactly under the rules they were fought with.
- **Gold transfers need level 5:** both the player sending gold to a friend and
  the friend receiving it must have reached the minimum level, on top of the
  Coal Mine, account age and recent-fight rules. The transfer window says who
  is too low, and administrators set the level (1-100) on the server settings
  page. How to Play and the FAQ now explain the transfer rules.
- **Alliances survive a new era:** an era change no longer leaves alliances
  running on old-era gold. Every alliance becomes reserved: name, roster,
  ranks and artwork stay, the treasury, loans, troop contracts and wars end
  with the old era, and alliance features stay locked. Members see why and can
  leave at any time. The leader reactivates it in the new era at level 10 for
  10,000,000 gold (both adjustable by admins). Only an admin's complete factory
  restore deletes alliances.
- **Deleting your account has a grace period:** erasing an account is now
  requested from Settings, confirmed by email, and waits 14 days before the
  daily job erases it. Signing in during that time offers to cancel. The same
  erasure now also removes your sign-in history and network addresses, and your
  friends and chat activity.

### Fixed
- **Queued emails send again:** inactivity notices, reminders and admin email
  campaigns sat in the outbox unsent, because the delivery worker failed on
  every poll. It now delivers them at the configured rate.
- **Timed bans and suspensions show in the admin user list:** a ban or
  suspension with an end date was listed as active (or idle) in User
  management and Edit Player until it expired; it now shows as banned or
  suspended for its whole duration. An account scheduled for deletion can no
  longer be reopened or re-sanctioned from account actions; cancel the
  deletion in the Privacy tab instead.
- **Supporter gifts work with only `JWT_SECRET` set, and the daily run log
  names its failures:** gift checkouts failed (and the nightly Stripe
  re-check failed them again) on servers configured from `.env.sample`, which
  only has `JWT_SECRET`; gift codes now fall back to it like sign-in does. The
  supporter run in the cron run log now lists the failed items with a short,
  redacted cause instead of only an error count, and log lines no longer
  drop the message of an error nested in their context.
- **Sign-in works for accounts registered with capital letters in the
  email:** registration saved the address as typed, while sign-in looks it
  up in lowercase, so such accounts were created but could never sign in.
  New accounts are saved in lowercase, and signing in with capitals in the
  address no longer fails after the password matches.
- **Filled status badges now pass text contrast on every hue:** white badge
  labels (Owned, New, ACTIVE, Fully Repaired, TEST MODE, ...) sit on a
  deepened shade-9 plate from the shared Mantine Badge override, matching the
  filled-button tone rule; yellow previously measured 2.5:1 and green 3.4:1
  against the 4.5:1 AA bar, on all four race themes.
- **Game-options selectors are labelled:** the language/formatting and
  colour-scheme dropdowns on Settings now carry programmatic labels for
  screen readers and keyboard focus, matching the card's other selects.
- **German auth title no longer clips on mobile:** the login/register
  section heading (e.g. "Kommandantenzugang") now hyphenates or breaks long
  locale compounds instead of overflowing its column at 390px.
- **Auth form pending state joins the shared button styles:** the login and
  register submit button now uses Mantine's `loading` state, so its pending
  treatment (aria-busy, disabled, themed spinner plate) comes from the same
  shared button overrides as every other form instead of a bespoke
  disabled-plus-dots swap.

### Removed
- Unused `FeatureFlag` infrastructure: the table and the never-used
  `MANAGE_FEATURE_FLAGS` permission. Runtime switches use server settings.
- Immediate "Forget Me" account deletion. Use Your data in Settings instead.

## v0.10.0 (2026-10-29)

### Added
- **Racial upgrades:** a fourth upgrade track on Structures > Upgrades, named
  after your race's perk and bought in order from fort level 5. Elves gain
  Sanctuary, which saves some fallen defenders. Humans gain Discipline, which
  cuts desertion and raises the morale floor. Goblins gain Raiders, for
  stronger captures, dungeons and ransoms. Undead gain Necropolis, which
  raises more of their dead. Everyone else can buy Hallowed Ground, which
  stops Undead attackers raising their own dead. Battle reports show what
  each perk did.
- **Supporter memberships:** monthly and gift plans with patron seals,
  alliance sponsorship and auto-recruit, paid through Stripe with receipts,
  refunds and a billing portal.
- **Discord bot:** link your account to look up profiles, stats,
  leaderboards, forts and wars from Discord, get a daily digest, and (as a
  supporter) get instant alerts for attacks, caught spies, wars and full
  stamina.
- **Privacy policy:** a published privacy policy, linked from the footer and
  sign-up. Sign-up asks you to confirm you are 16 or older. Deleting your
  account removes your avatar and the text of messages you wrote, and the
  display fonts are now served by OpenThrone itself.
- **Spy from battle reports:** a Spy button next to Attack Again and Attack
  Back.

### Changed
- **Battle XP:** XP per turn drops less at higher levels (360 / 300 / 260 /
  230 / 200 across the level bands, was 360 / 240 / 150 / 100 / 75), so
  level 100 is within reach.
- **Gear parity:** level 1-3 offense armor pieces now give the same split as
  the matching defense pieces. Set totals and weapons are unchanged.
- **Failed assaults:** on an attack that does not break through, damage
  scales with how much of your attack comes from troops rather than gear.
- **Mercenaries fight on the front line:** among units of the same type and
  level, mercenaries take twice their share of losses, split fairly between
  contracts.
- **Auto-recruit:** moves to a new random kingdom after each recruit and
  asks for the captcha once per session.
- **Supporter prices:** administrators can set prices for new purchases;
  existing monthly subscriptions keep their agreed price. Supporter
  administration now uses a compact overview ledger and opens player editors
  in place.
- **Patronage:** membership status and perks share one panel, with a plan chooser
  for yourself or a gift and tabbed payment records. Signed-out payment returns
  preserve confirmation details and offer a sign-in link to resume. While
  sales are off, the Patronage menu entry only shows to players whose
  subscription still renews.
- **Army stamina:** stamina no longer blocks attacks. Below 50 stamina your
  army fights weaker, down to 80% offense at zero, and the battle report says
  so. Spying costs no stamina, and offensive upgrades cut the stamina an
  attack drains by up to half. The sidebar shows your army's stamina and
  when it recovers.
- **Stamina explained:** How to Play and the FAQ now say what stamina is for,
  what spends it, how fast it refills and what low stamina does, using the
  server's current numbers. The sidebar Stamina row links there, battle
  reports say "Low stamina", and the Discord full-stamina alert no longer
  mentions turns.

## v0.9.0 (2026-10-27)

### Added
- **Upgrade unlocks:** economy upgrades now unlock features. Gold transfers
  open at the Coal Mine, with send and receive limits and a lower fee at each
  economy tier. Accounts must be 7 days old, and players who fought in the
  last 24 hours cannot trade gold.
- **Mercenaries:** hiring needs the Tavern, and higher tiers need the Copper
  Mine and the Meat Market. Mercenaries can make up at most half of your army.
- **Undead reanimation:** Undead kingdoms at fort level 5 and above raise
  part of the fallen after each battle, as level 1 units.
- **Animated wall:** the header wall burns as your fort takes damage.
- **Tutorial:** a short guide on each main page that remembers your
  progress, and a Learn page to replay any lesson.
- **Armory:** equipment readiness by tier, with upgrade hints.

### Changed
- Repeated attacks in one day wear a defender down, so a kingdom under
  constant attack defends a little weaker until the next day.
- The intel armory chart shows coverage for each equipment slot.

### Fixed
- Hopeless attacks against much stronger defenses no longer kill more
  defenders than attackers.

## v0.8.0 (2026-10-25)

### Added
- **Chat:** refreshed chat interfaces with reply navigation, unread-message
  boundaries and typing indicators, plus more reliable rich messages.
- **Combat logs:** battle reports record game events, and reward lines show
  the context behind each reward.
- **Report sharing:** you choose who can see a shared report, and recipient
  search is simpler.
- **Alliance artwork:** alliance banners frame consistently, and alliance
  directory cards share one layout.

### Changed
- **News:** the newest publications appear first, with their publication dates.
- **Announcements:** bulletins are paginated and grouped by severity, and
  dismissed announcements can be restored.

## v0.7.1 (2026-10-23)

### Fixed
- Training, untraining and converting regular units no longer fail when the
  army includes matching temporary mercenary or alliance contract troops.
  Temporary troops remain attached to their contracts instead of being saved
  as permanent units.

## v0.7.0 (2026-10-22)

### Added
- **Mercenaries:** hire equipped specialists for timed contracts, send them
  into attacks and spy missions, renew or dismiss them, and settle their own
  casualties and wounds.
- **Alliance armies:** contribute permanent troops and equipment to an alliance
  reserve, lend forces under manual approval or role allowances, extend or
  recall deployments, and return wounded survivors when membership ends.
- **Alliance dues and war levies:** configure recurring dues and dated levies,
  pay with gold or equipped units, review treasury history, and apply reminders,
  suspensions and configured overdue actions.
- **Recruitment limits:** signed-in recruitment and external recruitment links
  now have separate daily limits, including per-IP and global connection caps
  for external claims.

### Fixed
- Alliance overview cards now align when there is no latest announcement.
- Alpha startup no longer waits indefinitely for an unreachable Next.js
  advisory endpoint.

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
