# Battle and spy source guide

Where the battle and spy code lives. For the rules themselves, see [Combat](mechanics/combat.md), [Spying](mechanics/spying.md) and [Protection](mechanics/protection.md). The implementation and its tests stay the source of truth.

## Request and execution flow

| Concern | Source |
| --- | --- |
| Attack request validation and dispatch | [attack route](../src/pages/api/attack/[id].ts) |
| Spy mission validation and dispatch | [spy route](../src/pages/api/spy/[id].ts) |
| Shared API guard | [apiGuard.ts](../src/middleware/apiGuard.ts) |
| Battle orchestration | [Battle.service.ts](../src/services/Battle.service.ts) |
| Attack execution and persistence | [AttackService.ts](../src/services/AttackService.ts) |
| Attack eligibility | [AttackValidationService.ts](../src/services/AttackValidationService.ts) |
| Spy execution and persistence | [SpyService.ts](../src/services/SpyService.ts) |

## Calculations and replay

| Concern | Source |
| --- | --- |
| Shared army strength and equipment allocation | [combatStrength.ts](../src/utils/combatStrength.ts) |
| Battle simulation and outcome | [attackFunctions.ts](../src/utils/attackFunctions.ts) |
| Spy mission calculations | [spyFunctions.ts](../src/utils/spyFunctions.ts) |
| Combat balance parameters | [v5Combat.ts](../src/utils/balance/v5Combat.ts) |
| Server randomness and replay encryption | [serverRandom.ts](../src/utils/serverRandom.ts) |
| Replay types | [combatReplay.ts](../src/utils/combatReplay.ts) |
| Spy result serialization | [results.ts](../src/utils/spy/results.ts) |
| Offline simulation | [src/sim](../src/sim) and [balance scripts](../scripts/balance) |

## Notes

`NEXTAUTH_SECRET` (or `JWT_SECRET`) is required for encrypted combat replay persistence. Do not infer exact replay support for older logs from the presence of current replay code.

For validation, use `bun run test` or `bun test <path/to/test-file>` for a focused Bun suite. Test results and simulation outputs establish behavior only for the revision and configuration that produced them; dated readiness reports are not current release verdicts.
