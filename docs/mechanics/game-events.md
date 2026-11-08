# Game events

Last verified against code: 2026-11-06 (alpha d59b12d9)

A game event is a temporary, admin-created bonus that changes some rules for every player while it runs: more gold, more experience, extra turns, cheaper units, more citizens. Events are data, not code. Each one carries a flat set of optional effects.

## Rules

### Effects

An event's `config` holds any of these effects. Unknown or out-of-range keys are rejected when an admin saves the event and are ignored (never applied) when read back from the database.

| Effect | Range | What it does |
|---|---|---|
| `xpMultiplier` | 0.1 to 10 | Multiplies experience from battles, for attacker and defender, rounded down. |
| `goldMultiplier` | 0.1 to 10 | Multiplies gold income on every turn tick. |
| `extraTurnsPerTick` | 0 to 10 whole | Attack turns added on top of the normal one on every turn tick. |
| `dailyCitizenBonus` | 0 to 100,000 whole | Flat citizens added by the daily job. |
| `dailyCitizenActivityHours` | 0 to 720 whole | The flat bonus only reaches accounts with gameplay activity within this many hours. 0 means every era participant. Default when omitted: 24. |
| `citizenMultiplier` | 0.1 to 10 | Multiplies citizens from daily growth, player recruiting, or both. |
| `citizenMultiplierScope` | `DAILY`, `RECRUITING`, `BOTH` | Where the citizen multiplier applies. Default: `BOTH`. |
| `unitCostDiscountPercent` | 0 to 25 | Percent off training units. |
| `armoryCostDiscountPercent` | 0 to 25 | Percent off armory purchases. |

An event must have at least one real effect: a multiplier other than 1, or a bonus, extra turns or discount above 0. The activity window and scope only qualify another effect.

### Combining running events

- Multipliers multiply, then are clamped to 0.1x to 10x.
- Flat bonuses add. Each event's daily citizen grant keeps its own activity window.
- Extra turns add, capped at 10 per tick.
- Discounts compound (20% then 10% is 28%), capped at 25%. The cap exists because untraining and selling refund 75% of the price; a larger discount would let players buy during an event and sell back for a profit.

### How effects reach the game

- **Gold, extra turns.** The turn job reads the combined modifiers once per player. Gold per turn is multiplied (the multiplier is used to four decimal places and the result is rounded down) before alliance loan repayments are taken, and the player gets `1 + extraTurnsPerTick` turns ([CronJob.service.ts](../../src/services/CronJob.service.ts)).
- **Daily citizens.** The daily job reads the modifiers once per run. Each player gets housing growth plus every qualifying flat grant, then the daily multiplier is applied to that total. Fractional results round up or down at random so the average is fair. Citizens an event adds are tracked per player (`event_citizens_received`) and are excluded from the battle-protection population limit, so an event never ends a player's protection.
- **Recruiting.** The recruiting multiplier is applied to the citizens a successful recruit gives the recipient ([Recruitment.service.ts](../../src/services/Recruitment.service.ts)).
- **Experience.** Battle experience is multiplied when a battle resolves. The same set of events is stored in the battle record, so the report shows the events and the multiplier that applied, even after they end ([AttackService.ts](../../src/services/AttackService.ts), [battleGameEvents.ts](../../src/utils/battleGameEvents.ts)). Spy missions capture the same context.
- **Discounts.** Training and armory purchases apply the discount to the price after the player's own discounts ([Training.service.ts](../../src/services/Training.service.ts), [Armory.service.ts](../../src/services/Armory.service.ts)). Refunds stay at 75% of the undiscounted price.
- **Players see events** in the sidebar banner and in price previews, read from the public `/api/events/active` endpoint.

### Lifecycle

Statuses are `DRAFT`, `SCHEDULED`, `ACTIVE`, `PAUSED`, `COMPLETED` and `CANCELLED`. In practice the admin tools only produce three of them.

1. **Create.** A new event is always `DRAFT`. It has a unique key, a start time, and either an end time or "until the era ends". Only the `CUSTOM` and `GOLD_MODIFIER` types can be created or activated; the other types in the database enum are not supported.
2. **Activate.** An admin activates the event, which sets `ACTIVE`. Nothing starts events on its own: a `DRAFT` never starts by the clock. An event whose era has already ended cannot be activated.
3. **Running.** An event runs when all of these hold: status `ACTIVE`, start time has passed, end time (if any) has not passed, and, if bound to an era, that era is still open. An `ACTIVE` event whose start is in the future is shown as "scheduled" in the admin list but has no effect yet.
4. **End.** An event ends in one of three ways. Its end time passes (the status stays `ACTIVE`, but it no longer runs). An admin deactivates it, which sets `COMPLETED`. Its era ends: the era rollover sets every `ACTIVE`, `SCHEDULED` or `PAUSED` event bound to that era to `COMPLETED`. An event is also treated as ended the moment its era has an end date, even before that sweep.
5. **Delete.** An admin can delete an event at any status.

An era-bound event has no end time. It runs until the era ends. A current-era reset keeps the same era, so era-bound events survive it.

Editing a running event takes effect at once on the process that handled the change and within five seconds elsewhere, because the runtime cache lasts five seconds. If the database read fails, the game runs with no events for that cache window.

At most 100 running events are considered.

## Why it works this way

- Effects are one flat optional set so older gold-only and experience-only events keep working ([gameEvents.ts](../../src/constants/gameEvents.ts)).
- Modifiers live in a file with no server imports so the server (grants and charges) and the client (price previews, banner) use the same maths.
- The discount cap protects the 75% refund rule (see above).
- The battle record stores the events that applied so a report stays explainable after the event is gone.

## Admin and settings

- **Administration → Events** ([events.tsx](../../src/pages/home/admin/events.tsx)), for staff with the event-management permission. The form offers presets and shows each event's phase: draft, scheduled, running or ended.
- Admin API: [events.ts](../../src/pages/api/admin/game/events.ts) (list, create) and [\[eventId\].ts](../../src/pages/api/admin/game/events/[eventId].ts) (update, activate, deactivate, delete). Create, update, activate, deactivate and delete are audit-logged.
- Events are not runtime settings; they are database rows. The daily citizen bonus and its activity window are event effects, not server settings.

## Source

- [gameEvents.ts](../../src/constants/gameEvents.ts): effect schema, limits, combining rules, rounding helpers.
- [GameEvent.service.ts](../../src/services/GameEvent.service.ts): create, update, activate, deactivate, delete.
- [GameEventRuntime.service.ts](../../src/services/GameEventRuntime.service.ts): which events are running, cache, battle snapshot.
- [Era.service.ts](../../src/services/Era.service.ts): ends era-bound events at a rollover.
- Consumers: [CronJob.service.ts](../../src/services/CronJob.service.ts), [Recruitment.service.ts](../../src/services/Recruitment.service.ts), [AttackService.ts](../../src/services/AttackService.ts), [SpyService.ts](../../src/services/SpyService.ts), [Training.service.ts](../../src/services/Training.service.ts), [Armory.service.ts](../../src/services/Armory.service.ts).
- Player side: [active.ts](../../src/pages/api/events/active.ts), [ActiveEventsBanner.tsx](../../src/components/sidebar/ActiveEventsBanner.tsx).

## Tests

- [GameEventRuntime.service.test.ts](../../src/services/GameEventRuntime.service.test.ts): combining and capping, citizen scope, extra turns and discount stacking, invalid effects ignored, rounding, refund maths, effect validation, the "needs an effect and an end or era binding" rule, caching and failure defaults, battle snapshot.
- [cronJob.concurrency.test.ts](../../src/services/__tests__/cronJob.concurrency.test.ts): the bonus turns event, daily citizen bonus with activity window, daily multiplier, and protection population counting.

## Known gaps

- `GameEventService` (create, update, activate, deactivate, delete, era binding) and the admin routes have no test. The rollover's completion of era-bound events is untested.
- The status values `SCHEDULED`, `PAUSED` and `CANCELLED` exist in the database but nothing in the code sets them. Scheduling is only the derived "start time is in the future" state of an `ACTIVE` event.
- The database enum also lists `TURN_MODIFIER`, `UNIT_COST_MODIFIER`, `BUILD_SPEED_MODIFIER` and `PVP_MODIFIER`. They are not creatable and not read by the runtime.
- No player-facing page (How to Play, FAQ, guides) describes events; players only see the banner.
