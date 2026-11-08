# Game mechanics

How the game works today, one system per file. Code and tests are the source of truth. These docs explain them and link to them, and when they disagree the code wins and the doc gets fixed.

Each doc states when it was last checked against the code, and at which commit. `bun run docs:check --release` lists the docs whose linked source has changed since then. See [AGENTS.md section 16](../../AGENTS.md) for when docs must be updated.

## Combat and intel

| Doc | Covers |
| --- | --- |
| [Combat](combat.md) | Attack flow, the live ruleset, casualties, loot, XP, reports |
| [Spying](spying.md) | Spy missions, intel reports, costs and caps |
| [Protection](protection.md) | New-player protection and the gold shield |
| [Stamina](stamina.md) | Attacking army fatigue |
| [Morale](morale.md) | Kingdom morale and garrison fatigue |

## Economy and progression

| Doc | Covers |
| --- | --- |
| [Economy](economy.md) | Gold, citizens, the bank, turn and daily ticks |
| [Recruitment](recruitment.md) | Recruiting, auto-recruit and limits |
| [Training](training.md) | Units, tiers, costs and unlocks |
| [Armory](armory.md) | Items, buying, selling and the daily item check |
| [Structures](structures.md) | Forts, houses, upgrades and unlocks |
| [Progression](progression.md) | XP, levels, proficiency, races and classes |
| [Reanimation and captives](reanimation-and-captives.md) | Captives and Undead reanimation |

## Players together

| Doc | Covers |
| --- | --- |
| [Alliances](alliances.md) | Membership, treasury, loans, diplomacy and wars |
| [Friends and transfers](friends-and-transfers.md) | Friendships and gold gifts |
| [Temporary forces](../features/temporary-forces.md) | Mercenaries, force contracts and dues |
| [Supporter memberships](../features/supporter-memberships.md) | Supporter plans and payments |

## The world

| Doc | Covers |
| --- | --- |
| [Eras and era resets](era-reset.md) | Rollover, resets and what survives |
| [Game events](game-events.md) | Timed events and their effects |
| [World clock and jobs](world-clock-and-jobs.md) | OT Time and the turn and daily jobs |
| [Bots](bots.md) | Bot players |
| [Balance simulation](balance-simulation.md) | `src/sim`, personas and balance gates |
| [Runtime settings](runtime-settings.md) | The settings registry and how to add a setting |

## Writing a mechanics doc

Use the sections in [Stamina](stamina.md): Rules, Why it works this way, Admin and settings, Source, Tests, Known gaps. Describe the current rules only, and link large tables of values instead of copying them. These files are published publicly, so keep out hostnames, credentials and player data.
