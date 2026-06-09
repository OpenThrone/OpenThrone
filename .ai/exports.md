# OpenThrone Exports Map

> Auto-generated codemap. Regenerate with `bunx knip` for unused export detection.

---

## Barrel Exports

### Services (`src/services/index.ts`)

All services are re-exported from the barrel:

```typescript
export * from './Account.service';
export * from './Admin.service';
export * from './Alert.service';
export * from './Alliance.service';
export * from './AllianceBank.service';
export * from './AllianceWar.service';
export * from './Announcement.service';
export * from './ApiToken.service';
export * from './Armory.service';
export * from './AttackDataService';
export * from './AttackValidationService';
export * from './Auth.service';
export * from './Bank.service';
export * from './Banking.service';
export * from './Battle.service';
export * from './Blog.service';
export * from './CheatDetection.service';
export * from './Config.service';
export * from './CronJob.service';
export * from './Era.service';
export * from './FriendTransfer.service';
export * from './GameEvent.service';
export * from './General.service';
export * from './Messaging.service';
export * from './Moderation.service';
export * from './Recruitment.service';
export * from './Report.service';
export * from './ServerSetting.service';
export * from './Social.service';
export * from './Structure.service';
export * from './Training.service';
export * from './User.service';
```

### Constants (`src/constants/index.tsx`)

```typescript
export * from './Battle_Upgrades';
export * from './Bonuses';
export * from './Fortifications';
export * from './Items';
export * from './Structure_Upgrades';
export * from './Units';
export * from './XPLevels';
```

---

## Service Exports

Each service file exports a default class. Key services:

| Service | File | Key Exports |
|---|---|---|
| `Account.service` | `src/services/Account.service.ts` | Account management, vacation mode |
| `Admin.service` | `src/services/Admin.service.ts` | Admin operations |
| `Alert.service` | `src/services/Alert.service.ts` | Alert/notification system |
| `Alliance.service` | `src/services/Alliance.service.ts` | Alliance CRUD, membership |
| `AllianceBank.service` | `src/services/AllianceBank.service.ts` | Alliance banking |
| `AllianceWar.service` | `src/services/AllianceWar.service.ts` | Alliance wars |
| `Announcement.service` | `src/services/Announcement.service.ts` | Announcements |
| `ApiToken.service` | `src/services/ApiToken.service.ts` | API token management |
| `Armory.service` | `src/services/Armory.service.ts` | Equipment, mercenaries |
| `AttackDataService` | `src/services/AttackDataService.ts` | Attack data retrieval |
| `AttackValidationService` | `src/services/AttackValidationService.ts` | Attack validation logic |
| `Auth.service` | `src/services/Auth.service.ts` | Authentication, registration |
| `Bank.service` | `src/services/Bank.service.ts` | Banking operations |
| `Banking.service` | `src/services/Banking.service.ts` | Banking validation, deposits, withdrawals |
| `Battle.service` | `src/services/Battle.service.ts` | Battle simulation, upgrades |
| `Blog.service` | `src/services/Blog.service.ts` | Blog posts |
| `CheatDetection.service` | `src/services/CheatDetection.service.ts` | Cheat detection |
| `Config.service` | `src/services/Config.service.ts` | Game configuration |
| `CronJob.service` | `src/services/CronJob.service.ts` | Scheduled jobs |
| `Era.service` | `src/services/Era.service.ts` | Era management |
| `FriendTransfer.service` | `src/services/FriendTransfer.service.ts` | Friend gold transfers |
| `GameEvent.service` | `src/services/GameEvent.service.ts` | Game events |
| `General.service` | `src/services/General.service.ts` | General queries |
| `Messaging.service` | `src/services/Messaging.service.ts` | Chat/messaging |
| `Moderation.service` | `src/services/Moderation.service.ts` | Moderation tools |
| `Recruitment.service` | `src/services/Recruitment.service.ts` | Recruitment system |
| `Report.service` | `src/services/Report.service.ts` | Report management |
| `ServerSetting.service` | `src/services/ServerSetting.service.ts` | Server settings |
| `Social.service` | `src/services/Social.service.ts` | Social features, friends |
| `Structure.service` | `src/services/Structure.service.ts` | Structure upgrades |
| `Training.service` | `src/services/Training.service.ts` | Unit training |
| `User.service` | `src/services/User.service.ts` | User CRUD, profiles |

---

## Constants Exports

| File | Key Exports |
|---|---|
| `src/constants/Battle_Upgrades.tsx` | Battle upgrade definitions |
| `src/constants/Bonuses.tsx` | Bonus type definitions |
| `src/constants/Fortifications.tsx` | Fortification level definitions |
| `src/constants/Items.tsx` | Item definitions |
| `src/constants/Structure_Upgrades.tsx` | Structure upgrade definitions |
| `src/constants/Units.tsx` | Unit type definitions |
| `src/constants/XPLevels.tsx` | XP/level definitions |

---

## Utility Exports

| File | Key Exports |
|---|---|
| `src/utils/attackFunctions.ts` | Attack calculation functions |
| `src/utils/balance/` | Game balance utilities |
| `src/utils/battleEncoding.ts` | Battle data encoding |
| `src/utils/buyStructureUpgrade.ts` | Structure upgrade purchase |
| `src/utils/cors.ts` | CORS middleware |
| `src/utils/dateHelpers.ts` | Date formatting helpers |
| `src/utils/i18n-formatters.ts` | i18n formatters |
| `src/utils/i18n.ts` | i18n configuration |
| `src/utils/ipUtils.ts` | IP address utilities |
| `src/utils/jsonHelpers.ts` | JSON parsing helpers |
| `src/utils/logger.ts` | Logging utilities |
| `src/utils/MockUserGenerator.ts` | Mock data generator |
| `src/utils/mtrand.ts` | Mersenne twister random |
| `src/utils/numberFormatting.ts` | Number formatting |
| `src/utils/permissions.ts` | Permission checking |
| `src/utils/random.ts` | Random number generation |
| `src/utils/securityPolicies.ts` | Security policy checks |
| `src/utils/socialNotifications.ts` | Social notification helpers |
| `src/utils/spy/` | Spy operation utilities |
| `src/utils/spyFunctions.ts` | Spy mission functions |
| `src/utils/timefunctions.ts` | Time calculation functions |
| `src/utils/units.ts` | Unit validation |
| `src/utils/utilities.ts` | General utilities |
| `src/utils/adminStatus.ts` | Admin status helpers |
| `src/utils/antiAbuse.ts` | Anti-abuse utilities |
| `src/utils/api-error.ts` | API error class |
| `src/utils/AppConfig.ts` | App configuration |
| `src/utils/auditLogger.ts` | Audit logging |
| `src/utils/authorization.ts` | Authorization checks |
| `src/utils/socialNotifications.ts` | Social notification helpers |

---

## Hooks

| Hook | File | Description |
|---|---|---|
| `useSidebarData` | `src/hooks/useSidebarData.ts` | Sidebar data fetching |
| `useSocket` | `src/hooks/useSocket.ts` | Socket.io connection hook |

---

## Contexts

| Context | File | Description |
|---|---|---|
| `LayoutContext` | `src/context/LayoutContext.tsx` | Layout state (sidebar, theme, race) |
| `SnackbarContext` | `src/context/snackbar-context.tsx` | Snackbar notification context |
| `UsersContext` | `src/context/users.tsx` | User data context |

---

## Models

| Model | File | Description |
|---|---|---|
| `BaseUser` | `src/models/BaseUser.ts` | Base user model |
| `BattleResult` | `src/models/BattleResult.tsx` | Battle result model |
| `BattleSimulationResult` | `src/models/BattleSimulationResult.tsx` | Battle simulation result |
| `BattleUser` | `src/models/BattleUser.ts` | Battle user model |
| `SpyUser` | `src/models/SpyUser.tsx` | Spy user model |
| `Users` | `src/models/Users.tsx` | User collection model |

---

## Types

| File | Description |
|---|---|
| `src/types/api-auth.ts` | API auth types |
| `src/types/api.d.ts` | API type declarations |
| `src/types/augmentations.d.ts` | Type augmentations |
| `src/types/combat.ts` | Combat types (BattleUnits, AttackRecord, etc.) |
| `src/types/global.d.ts` | Global type declarations |
| `src/types/globals.d.ts` | Global declarations |
| `src/types/next-auth.d.ts` | NextAuth type augmentations |
| `src/types/next.d.ts` | Next.js type augmentations |
| `src/types/shims-global.d.ts` | Global shims |
| `src/types/shims.d.ts` | Module shims |
| `src/types/temporary-shims.d.ts` | Temporary shims |
| `src/types/test-modules.d.ts` | Test module declarations |
| `src/types/tiptap-core-shim.d.ts` | Tiptap core shim |
| `src/types/tiptap-markdown.d.ts` | Tiptap markdown shim |
| `src/types/typings.d.ts` | General type declarations |
| `src/types/user-model-compat.d.ts` | User model compatibility |
| `src/types/vitest-globals.d.ts` | Vitest globals |

---

## Known Unused Exports (from knip)

Knip detected unused exports. Run `bun run map:unused` for the full list. Key categories:

- **Unused functions**: Various utility functions in `src/utils/`
- **Unused types**: 34 unused exported types (interfaces in services, types in `src/types/combat.ts`)
- **Unused files**: Files not imported anywhere
- **Duplicate exports**: 17 components/services with both named + default exports

See `bun run map:unused` for the current list.
