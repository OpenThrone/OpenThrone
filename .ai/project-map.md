# OpenThrone Project Map

> AI codemap for the OpenThrone Next.js project. Regenerate with tooling: `bun run map:deps`, `bun run map:graph`, `bun run map:unused`.

---

## Project Overview

**OpenThrone** is a text-based MMORPG inspired by DarkThrone, built with:

- **Next.js (Pages Router)** - Framework
- **React 19 + TypeScript** - UI
- **Mantine 7** - Component library
- **Tailwind CSS** - Utility styling
- **Prisma 7** - Database ORM (PostgreSQL)
- **NextAuth v4** - Authentication
- **Socket.io** - Real-time features
- **next-i18next** - Internationalization
- **Zod** - Validation
- **Bun** - Runtime/package manager

---

## Directory Structure

```
src/
  pages/           # Next.js Pages Router (routes + API handlers)
    api/           # API route handlers
      admin/       # Admin API endpoints (43 endpoints)
      alliances/   # Alliance CRUD + bank + wars
      armory/      # Equipment management
      attack/      # Attack execution + logs
      auth/        # Authentication (NextAuth + register)
      bank/        # Banking operations
      battle/      # Battle data endpoints
      captcha/     # Captcha verification
      cronJobs/    # Scheduled task endpoints
      debug/       # Debug utilities
      general/     # General data endpoints
      messages/    # Chat/messaging API
      recruit/     # Recruitment system
      reports/     # Report management
      social/      # Social features (friends, gold requests)
      structures/  # Structure upgrade data
      utilities/   # Utility endpoints
      __tests__/   # API tests
    home/          # Authenticated dashboard pages
      admin/       # Admin panel pages
      moderation/  # Moderation pages
    account/       # Auth pages (login, register, password reset)
    alliances/     # Alliance pages
    battle/        # Battle pages
    community/     # Community pages (news, stats)
    messaging/     # Chat/messaging page
    structures/    # Structure pages (armory, bank, upgrades)
    administration/# Blog admin
  components/      # React UI components
    admin/         # Admin-specific components
    alliance/      # Alliance-specific components
    game/          # Game-themed components (RPG aesthetic)
  services/        # Business logic service classes (barrel exported)
  constants/       # Game constants (units, upgrades, items, etc.)
  utils/           # Utility functions
    balance/       # Game balance calculations
    spy/           # Spy operation utilities
  lib/             # Shared library modules (Prisma client, rate limiter)
  hooks/           # Custom React hooks
  context/         # React contexts/providers
  models/          # Data models (BaseUser, BattleResult, etc.)
  types/           # TypeScript type declarations
  middleware/      # API middleware (auth, CORS, rate limiting)
  layouts/         # Layout components (Meta)
  styles/          # Global styles + theme system
  locales/         # i18n translation files
  server/          # Custom Express server (Socket.io)
  sim/             # Game simulation / autonomous runner
```

---

## Key Files

| File | Purpose |
|---|---|
| `src/pages/_app.tsx` | App wrapper (providers, theme, Mantine) |
| `src/pages/_document.tsx` | HTML document structure |
| `src/components/Layout.tsx` | Main layout with race theming |
| `src/components/Sidebar.tsx` | Navigation sidebar |
| `src/components/MainArea.tsx` | Content area wrapper |
| `src/styles/themes.tsx` | Race-based theme definitions (ELF, HUMAN, UNDEAD, GOBLIN) |
| `src/styles/global.css` | Global CSS with RPG utilities |
| `src/lib/prisma.ts` | Prisma client singleton |
| `src/lib/socket.ts` | Socket.io server setup |
| `src/server/index.ts` | Custom Express server entry |
| `src/context/LayoutContext.tsx` | Layout state management |
| `src/context/snackbar-context.tsx` | Notification state |
| `src/services/index.ts` | Service barrel export |
| `src/constants/index.tsx` | Constants barrel export |
| `next.config.mjs` | Next.js configuration |
| `prisma/schema.prisma` | Database schema |

---

## Data Flow

```
Pages (src/pages/)
  → API Routes (src/pages/api/)
    → Middleware (src/middleware/) [auth, cors, rateLimit]
    → Services (src/services/)
      → Prisma Client (src/lib/prisma.ts)
        → PostgreSQL Database
      → Utils (src/utils/)
      → Constants (src/constants/)
      → Models (src/models/)
```

```
UI Components (src/components/)
  → Hooks (src/hooks/)
  → Context (src/context/)
  → Pages (src/pages/)
```

---

## Authentication Flow

- **NextAuth.js** handles auth via `src/pages/api/auth/[...nextauth].ts`
- Registration: `src/pages/api/auth/register/route.ts`
- Auth middleware: `src/middleware/auth.ts`
- API guard: `src/middleware/apiGuard.ts`
- Permission checks: `src/utils/permissions.ts`, `src/utils/authorization.ts`

---

## Real-time Features

- Socket.io server: `src/lib/socket.ts`, `src/server/index.ts`
- Client hook: `src/hooks/useSocket.ts`
- Chat system: `src/services/Messaging.service.ts`, `src/components/Chat*`

---

## Game Mechanics

| System | Service | API Prefix | Pages |
|---|---|---|---|
| Battle | `Battle.service`, `AttackDataService`, `AttackValidationService` | `/api/attack/`, `/api/battle/` | `/battle/*` |
| Training | `Training.service` | `/api/battle/` | `/battle/training` |
| Armory | `Armory.service` | `/api/armory/` | `/structures/armory` |
| Banking | `Bank.service`, `Banking.service` | `/api/bank/` | `/structures/bank` |
| Structures | `Structure.service` | `/api/structures/` | `/structures/*` |
| Alliance | `Alliance.service`, `AllianceBank.service`, `AllianceWar.service` | `/api/alliances/` | `/alliances` |
| Recruitment | `Recruitment.service` | `/api/recruit/` | `/recruit/[id]` |
| Social | `Social.service`, `FriendTransfer.service` | `/api/social/` | — |
| Messaging | `Messaging.service` | `/api/messages/` | `/messaging` |
| Spy | `SpyService` | `/api/spy/` | — |
| Moderation | `Moderation.service` | `/api/admin/moderation/` | `/home/moderation/*` |
| Cheat Detection | `CheatDetection.service` | `/api/admin/abuse/` | `/home/admin/cheat-signals` |

---

## Race Theme System

Four race palettes: **ELF**, **HUMAN**, **UNDEAD**, **GOBLIN**

- Theme tokens: `src/styles/themes.tsx`
- CSS variables: Applied in `src/components/Layout.tsx`
- Race-aware components: `src/components/game/*` (themed variants)
- Utility classes: `src/styles/global.css` (`.mainArea-bg`, `.card-fantasy`, etc.)

---

## Testing

| Type | Framework | Files |
|---|---|---|
| Unit tests | Jest | `src/**/*.test.{ts,tsx}` |
| API tests | Jest | `src/pages/api/__tests__/*.test.ts` |
| E2E tests | Cypress | `cypress/` |
| Component tests | Jest + Testing Library | `src/components/*.test.tsx` |

---

## Generated Files

| Tool | Output | Command |
|---|---|---|
| dependency-cruiser | `.ai/dependency-map.json` | `bun run map:deps` |
| madge | `.ai/madge-map.json` | `bun run map:graph` |
| madge circular | (stdout) | `bun run map:circular` |
| knip unused | (stdout) | `bun run map:unused` |

---

## Circular Dependencies

Madge detected **57 circular dependencies**, primarily in:

1. **Prisma generated code** (`prisma/generated/prisma/`) - expected, auto-generated
2. Some service-to-service imports

Run `bun run map:circular` for the full list. Focus manual review on non-generated cycles.

---

## Validation Commands

```bash
bun run check-types          # TypeScript type checking
bun run lint                 # ESLint
bun test                     # Jest tests
bun run map:unused           # Find unused files/exports
bun run map:circular         # Find circular dependencies
bun run ai:check             # Run all of the above
```
