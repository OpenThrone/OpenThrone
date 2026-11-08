# Bots

Last verified against code: 2026-11-06 (alpha a365a67d)

Bots are server-controlled player accounts that keep a quiet baseline of activity in the world. They are ordinary account rows marked `isBot`. Once a day they recruit themselves or train units, and that is all. They never attack, spy, bank, upgrade structures or join alliances.

## Rules

### What a bot is

- A bot is a `users` row with `isBot = true`, a persona, an empty `botConfig`, a creation time, a last-run time and a `botStats` history (the last 30 run results).
- Bots are created through the normal registration path, so the usual sign-up checks apply. Each also gets an `ACTIVE` account status.
- Bots are provisioned from a manifest in [config/bots/manifests](../../config/bots/manifests). The default manifest asks for 35 bots with an even split of the four races (ELF, HUMAN, GOBLIN, UNDEAD) and four classes (FIGHTER, CLERIC, ASSASSIN, THIEF), and persona weights: 15% each for `FARMER_GREEDY`, `FARMER_CAUTIOUS`, `FARMER_ADAPTIVE` and `BALANCED`, 20% each for `AGGRESSIVE` and `DEFENSIVE`. A manifest may instead list bots one by one.
- Names are `<prefix><n>` (default prefix `Bot`), emails use a non-routable local domain. Provisioning needs the `BOT_DEFAULT_PASSWORD` environment value (at least 8 characters). An existing bot with the same email or name is skipped. A name or email taken by a non-bot account is a failure for that entry. Race, class and persona draws for a distribution manifest are random, not seeded.

### The daily tick

The tick runs once a day through the bot endpoint or the admin "run now" action. For one tick:

1. Load a schedule from [config/bots/schedules](../../config/bots/schedules). The default allocates 30% of bots to recruit, 20% to train workers, 15% to train offense, 15% to train defense and 20% to idle. Allocations must sum to 1.
2. Take every bot that has not run since the start of the current game day (see [world-clock-and-jobs.md](world-clock-and-jobs.md)). A bot that already ran today is skipped.
3. Count slots per action as `floor(bots × share)`; leftovers become idle slots.
4. Shuffle the bots with a seed derived from the server's local date, then give each bot its persona's preferred training slot if one is left, otherwise the first free slot in the order recruit, train workers, train offense, train defense, idle. Preferences: all three farmer personas and `BALANCED` prefer train workers, `AGGRESSIVE` prefers train offense, `DEFENSIVE` prefers train defense.
5. Run each bot's action. Each bot's failure is recorded and does not stop the others.
6. Update the bot's last-run time, set its `last_active` to now, and append the result to its history.

The actions ([BotExecutor.ts](../../src/botUsers/BotExecutor.ts)):

- **Recruit.** Self-recruits through the normal recruitment code, up to 5 per game day per bot, counted from the recruit history. It stops quietly at the cap.
- **Train.** Trains level-1 workers, offense or defense units from the bot's citizens, at most 100 per run, through the normal training code. If it lacks gold or citizens the result is `skipped`, not `failed`.
- **Idle.** Does nothing and counts as a success.

Setting `last_active` each run keeps bots counted as era participants, so the turn and daily jobs pay and grow them like players.

### Reset behavior

A bot is a positive-ID account, so era resets wipe it like anyone. A current-era reset clears its `last_active`; it becomes a participant again at its next tick. The tick itself does not check the login switch or an in-progress reset.

### Where bots are excluded

Bots are filtered out of the admin abuse and investigation signals, login telemetry clusters and cheat-detection loser and receiver checks, so they do not raise false alarms. The relaunch-wave mode of the inactivity sweep also skips them.

## Admin and settings

- **Administration → Bots** ([bots.tsx](../../src/pages/home/admin/bots.tsx)): roster and last-run summary.
- Admin-session endpoints (administrators only): `POST /api/admin/bots/provision` (`manifest`, `dryRun`), `GET /api/admin/bots/status`, `POST /api/admin/bots/run-now` (`schedule`). Manifest and schedule names must match an existing file. Provision and run-now are audit-logged.
- Scheduled endpoint: `POST /api/cronJobs/bots` (flag `DO_BOT_UPDATES`, optional `?schedule=<name>`). It is recorded in the cron run log as `bots`; the admin "run now" action is not.
- Command line: `bun run scripts/seed-bots.ts` (`--dry-run`, `--manifest <name>`).
- Bots have no runtime settings.

## Source

- [Bot.service.ts](../../src/services/Bot.service.ts): daily tick, slot assignment, status, provisioning entry.
- [BotExecutor.ts](../../src/botUsers/BotExecutor.ts): the three actions.
- [BotDecisionEngine.ts](../../src/botUsers/BotDecisionEngine.ts): slot to action.
- [BotFactory.ts](../../src/botUsers/BotFactory.ts): manifest expansion and provisioning.
- [config.ts](../../src/botUsers/config.ts), [constants.ts](../../src/botUsers/constants.ts), [types.ts](../../src/botUsers/types.ts): manifest and schedule schema, defaults.
- [bots.ts](../../src/pages/api/cronJobs/bots.ts), [provision.ts](../../src/pages/api/admin/bots/provision.ts), [status.ts](../../src/pages/api/admin/bots/status.ts), [run-now.ts](../../src/pages/api/admin/bots/run-now.ts), [seed-bots.ts](../../scripts/seed-bots.ts).

## Tests

- [BotDecisionEngine.test.ts](../../src/botUsers/__tests__/BotDecisionEngine.test.ts): slot to action, persona default.
- [constants.test.ts](../../src/botUsers/__tests__/constants.test.ts): persona preferences, distributions sum to 1.
- [config.test.ts](../../src/botUsers/__tests__/config.test.ts): default manifest and schedule load and validate.
- [admin-bots.api.test.ts](../../src/__tests__/pages/api/admin/admin-bots.api.test.ts): manifest and schedule names are validated, status output.
- [cron-run-logging.api.test.ts](../../src/__tests__/pages/api/cronJobs/cron-run-logging.api.test.ts): the bot cron response and run logging.

## Known gaps

- `BotService.runDailyBotTick` (slot assignment, once-per-day rule), `BotExecutor` and `BotFactory.provisionFromManifest` have no tests.
- Personas only choose a preferred training slot. The three farmer personas and `BALANCED` behave identically, and `botConfig` is stored but never read.
- The shuffle seed uses the server's local date, not OT Time or the game day.
- The recruit cap of 5 is a constant in the bot code, separate from the runtime recruiting settings.
