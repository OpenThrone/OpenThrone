# OpenThrone Route Map

> Auto-generated codemap. Regenerate with `bun run map:graph` and manual review.

This project uses **Next.js Pages Router** (`src/pages/`).

---

## Page Routes

### Public Pages

| Route | File | Description |
|---|---|---|
| `/` | `src/pages/index.tsx` | Home / landing page |
| `/about` | `src/pages/about.tsx` | About the game |
| `/test` | `src/pages/test.tsx` | Test / debug page |
| `/auto-recruit` | `src/pages/auto-recruit.tsx` | Auto-recruit configuration |
| `/report` | `src/pages/report.tsx` | Report a player |

### Account

| Route | File | Description |
|---|---|---|
| `/account/login` | `src/pages/account/login.tsx` | Login page |
| `/account/register` | `src/pages/account/register.tsx` | Registration page |
| `/account/email-verify` | `src/pages/account/email-verify.tsx` | Email verification |
| `/account/password-reset` | `src/pages/account/password-reset/index.tsx` | Password reset request |
| `/account/password-reset/verify` | `src/pages/account/password-reset/verify.tsx` | Password reset verification |
| `/account/password-reset/result` | `src/pages/account/password-reset/result.tsx` | Password reset result |

### Battle

| Route | File | Description |
|---|---|---|
| `/battle/users` | `src/pages/battle/users.tsx` | Attackable users list |
| `/battle/training` | `src/pages/battle/training.tsx` | Military training |
| `/battle/upgrades` | `src/pages/battle/upgrades.tsx` | Battle upgrades |
| `/battle/history` | `src/pages/battle/history.tsx` | Attack history |
| `/battle/battleSimulator` | `src/pages/battle/battleSimulator.tsx` | Battle simulator |
| `/battle/results/[id]` | `src/pages/battle/results/[id].tsx` | Battle result details (dynamic) |

### Structures

| Route | File | Description |
|---|---|---|
| `/structures/armory` | `src/pages/structures/armory/index.tsx` | Armory main |
| `/structures/armory/[tab]` | `src/pages/structures/armory/[tab].tsx` | Armory tab view |
| `/structures/bank` | `src/pages/structures/bank/index.tsx` | Bank main |
| `/structures/bank/[tab]` | `src/pages/structures/bank/[tab].tsx` | Bank tab view |
| `/structures/upgrades` | `src/pages/structures/upgrades/index.tsx` | Structure upgrades main |
| `/structures/upgrades/[tab]` | `src/pages/structures/upgrades/[tab].tsx` | Upgrades tab view |
| `/structures/housing` | `src/pages/structures/housing.tsx` | Housing |
| `/structures/repair` | `src/pages/structures/repair.tsx` | Repair structures |

### Community

| Route | File | Description |
|---|---|---|
| `/community/news` | `src/pages/community/news/index.tsx` | News list |
| `/community/news/[id]` | `src/pages/community/news/[id].tsx` | News article (dynamic) |
| `/community/stats` | `src/pages/community/stats.tsx` | Player statistics |

### Alliance

| Route | File | Description |
|---|---|---|
| `/alliances` | `src/pages/alliances/index.tsx` | Alliance overview |

### Messaging

| Route | File | Description |
|---|---|---|
| `/messaging` | `src/pages/messaging/index.tsx` | Chat / messaging |

### Recruitment

| Route | File | Description |
|---|---|---|
| `/recruit/[id]` | `src/pages/recruit/[id].tsx` | Recruitment click link (dynamic) |

### Administration

| Route | File | Description |
|---|---|---|
| `/administration/blog` | `src/pages/administration/blog.tsx` | Blog admin |

### Home (Authenticated Dashboard)

| Route | File | Description |
|---|---|---|
| `/home/overview` | `src/pages/home/overview.tsx` | Player overview dashboard |
| `/home/settings` | `src/pages/home/settings.tsx` | Player settings |
| `/home/profile` | `src/pages/home/profile.tsx` | Player profile |
| `/home/levels` | `src/pages/home/levels.tsx` | Level progression |
| `/home/sample` | `src/pages/home/sample.tsx` | Sample / demo page |

### Home - Admin Section

| Route | File | Description |
|---|---|---|
| `/home/admin` | `src/pages/home/admin.tsx` | Admin dashboard |
| `/home/admin/overview` | `src/pages/home/admin/overview.tsx` | Admin overview |
| `/home/admin/settings` | `src/pages/home/admin/settings.tsx` | Server settings |
| `/home/admin/content` | `src/pages/home/admin/content.tsx` | Content management |
| `/home/admin/audit-logs` | `src/pages/home/admin/audit-logs.tsx` | Audit logs |
| `/home/admin/events` | `src/pages/home/admin/events.tsx` | Game events management |
| `/home/admin/analytics` | `src/pages/home/admin/analytics.tsx` | Player analytics |
| `/home/admin/economy` | `src/pages/home/admin/economy.tsx` | Economy overview |
| `/home/admin/alliances` | `src/pages/home/admin/alliances.tsx` | Alliance management |
| `/home/admin/eras` | `src/pages/home/admin/eras.tsx` | Era management |
| `/home/admin/api-tokens` | `src/pages/home/admin/api-tokens.tsx` | API token management |
| `/home/admin/feature-flags` | `src/pages/home/admin/feature-flags.tsx` | Feature flags |
| `/home/admin/maintenance` | `src/pages/home/admin/maintenance.tsx` | Maintenance tools |
| `/home/admin/mass-messaging` | `src/pages/home/admin/mass-messaging.tsx` | Mass messaging |
| `/home/admin/advisor-messages` | `src/pages/home/admin/advisor-messages.tsx` | Advisor messages |
| `/home/admin/announcements` | `src/pages/home/admin/announcements.tsx` | Announcements |
| `/home/admin/balance-sim` | `src/pages/home/admin/balance-sim.tsx` | Balance simulator |
| `/home/admin/cheat-signals` | `src/pages/home/admin/cheat-signals.tsx` | Cheat detection signals |
| `/home/admin/multi-accounts` | `src/pages/home/admin/multi-accounts.tsx` | Multi-account detection |

### Home - Moderation Section

| Route | File | Description |
|---|---|---|
| `/home/moderation/reports` | `src/pages/home/moderation/reports.tsx` | Reports list |
| `/home/moderation/reports/[reportId]` | `src/pages/home/moderation/reports/[reportId].tsx` | Report details (dynamic) |
| `/home/moderation/bans` | `src/pages/home/moderation/bans.tsx` | Ban management |
| `/home/moderation/appeals` | `src/pages/home/moderation/appeals.tsx` | Ban appeals |
| `/home/moderation/chat` | `src/pages/home/moderation/chat.tsx` | Chat moderation |

### Next.js Special

| File | Purpose |
|---|---|
| `src/pages/_app.tsx` | Custom App (providers, global layout) |
| `src/pages/_document.tsx` | Custom Document (HTML structure) |

---

## API Routes

### Authentication

| Endpoint | File | Methods | Description |
|---|---|---|---|
| `/api/auth/[...nextauth]` | `src/pages/api/auth/[...nextauth].ts` | GET, POST | NextAuth.js handler |
| `/api/auth/register/route` | `src/pages/api/auth/register/route.ts` | POST | User registration |

### Attack

| Endpoint | File | Description |
|---|---|---|
| `/api/attack/[id]` | `src/pages/api/attack/[id].ts` | Execute attack on user |
| `/api/attack/test` | `src/pages/api/attack/test.ts` | Attack test endpoint |
| `/api/attack/logs` | `src/pages/api/attack/logs.ts` | Attack log list |
| `/api/attack/logs/[id]/acl` | `src/pages/api/attack/logs/[id]/acl.ts` | Attack log access control |
| `/api/attack/retest/[id]` | `src/pages/api/attack/retest/[id].ts` | Re-test an attack |
| `/api/attack/battleTest` | `src/pages/api/attack/battleTest.ts` | Battle test |
| `/api/attack/fullScaleBattleTest` | `src/pages/api/attack/fullScaleBattleTest.ts` | Full-scale battle test |
| `/api/attack/getRecentAttacks` | `src/pages/api/attack/getRecentAttacks.ts` | Recent attack list |

### Armory

| Endpoint | File | Description |
|---|---|---|
| `/api/armory/equip` | `src/pages/api/armory/equip.ts` | Equip items |
| `/api/armory/unequip` | `src/pages/api/armory/unequip.ts` | Unequip items |
| `/api/armory/convert` | `src/pages/api/armory/convert.ts` | Convert items |
| `/api/armory/hire-mercenary` | `src/pages/api/armory/hire-mercenary.ts` | Hire mercenaries |
| `/api/armory/dismiss-mercenary` | `src/pages/api/armory/dismiss-mercenary.ts` | Dismiss mercenaries |

### Bank

| Endpoint | File | Description |
|---|---|---|
| `/api/bank/deposit` | `src/pages/api/bank/deposit.ts` | Deposit gold |
| `/api/bank/withdraw` | `src/pages/api/bank/withdraw.ts` | Withdraw gold |
| `/api/bank/history` | `src/pages/api/bank/history.ts` | Transaction history |
| `/api/bank/getDeposits` | `src/pages/api/bank/getDeposits.ts` | Get deposits list |

### Battle

| Endpoint | File | Description |
|---|---|---|
| `/api/battle/upgrades` | `src/pages/api/battle/upgrades.ts` | Battle upgrade data |
| `/api/battle/users-filter-meta` | `src/pages/api/battle/users-filter-meta.ts` | User filter metadata |

### Captcha

| Endpoint | File | Description |
|---|---|---|
| `/api/captcha/verify` | `src/pages/api/captcha/verify.ts` | Captcha verification |

### Cron Jobs

| Endpoint | File | Description |
|---|---|---|
| `/api/cronJobs/turns` | `src/pages/api/cronJobs/turns.ts` | Turn/gold generation |
| `/api/cronJobs/daily` | `src/pages/api/cronJobs/daily.ts` | Daily citizen allocation |
| `/api/cronJobs/accountStatus` | `src/pages/api/cronJobs/accountStatus.ts` | Account status checks |

### Debug

| Endpoint | File | Description |
|---|---|---|
| `/api/debug/clear-session` | `src/pages/api/debug/clear-session.ts` | Clear user session |

### General

| Endpoint | File | Description |
|---|---|---|
| `/api/general/git-info` | `src/pages/api/general/git-info.ts` | Git version info |
| `/api/general/getUser` | `src/pages/api/general/getUser.ts` | Get current user |
| `/api/general/checkDisplayName` | `src/pages/api/general/checkDisplayName.ts` | Display name availability |
| `/api/general/revalidate` | `src/pages/api/general/revalidate.ts` | ISR revalidation |
| `/api/general/searchUsers` | `src/pages/api/general/searchUsers.ts` | User search |
| `/api/general/compareTop` | `src/pages/api/general/compareTop.ts` | Compare top players |
| `/api/general/getOnlinePlayers` | `src/pages/api/general/getOnlinePlayers.ts` | Online players list |
| `/api/general/getUserInfoByRecruitLink` | `src/pages/api/general/getUserInfoByRecruitLink.ts` | Recruit link user info |
| `/api/general/getUserStats/[id]` | `src/pages/api/general/getUserStats/[id].ts` | User stats by ID |
| `/api/general/getUserBreakdown/[id]` | `src/pages/api/general/getUserBreakdown/[id].ts` | User breakdown by ID |
| `/api/general/resetGame` | `src/pages/api/general/resetGame.ts` | Reset game state |

### Messages

| Endpoint | File | Description |
|---|---|---|
| `/api/messages` | `src/pages/api/messages/index.ts` | Chat rooms list/create |
| `/api/messages/[chatRoomId]` | `src/pages/api/messages/[chatRoomId].ts` | Chat room messages |
| `/api/messages/[chatRoomId]/participants` | `src/pages/api/messages/[chatRoomId]/participants/index.ts` | Room participants |
| `/api/messages/[chatRoomId]/participants/[participantId]` | `src/pages/api/messages/[chatRoomId]/participants/[participantId].ts` | Participant management |

### Recruit

| Endpoint | File | Description |
|---|---|---|
| `/api/recruit/startSession` | `src/pages/api/recruit/startSession.ts` | Start recruit session |
| `/api/recruit/endSession` | `src/pages/api/recruit/endSession.ts` | End recruit session |
| `/api/recruit/verifySession` | `src/pages/api/recruit/verifySession.ts` | Verify recruit session |
| `/api/recruit/handleRecruitment` | `src/pages/api/recruit/handleRecruitment.ts` | Process recruitment |
| `/api/recruit/getRandomUser` | `src/pages/api/recruit/getRandomUser.ts` | Get random user for recruit |
| `/api/recruit/getRecruitHistory` | `src/pages/api/recruit/getRecruitHistory.ts` | Recruitment history |
| `/api/recruit/listSessions` | `src/pages/api/recruit/listSessions.ts` | List recruit sessions |
| `/api/recruit/auto-recruit` | `src/pages/api/recruit/auto-recruit.ts` | Auto-recruit endpoint |
| `/api/recruit/[id]` | `src/pages/api/recruit/[id].ts` | Recruit session by ID |

### Reports

| Endpoint | File | Description |
|---|---|---|
| `/api/reports` | `src/pages/api/reports/index.ts` | Reports list |
| `/api/reports/create` | `src/pages/api/reports/create.ts` | Create report |
| `/api/reports/[reportId]` | `src/pages/api/reports/[reportId].ts` | Report details |
| `/api/reports/[reportId]/actions` | `src/pages/api/reports/[reportId]/actions.ts` | Report actions |
| `/api/reports/[reportId]/resolve` | `src/pages/api/reports/[reportId]/resolve.ts` | Resolve report |
| `/api/reports/[reportId]/assign` | `src/pages/api/reports/[reportId]/assign.ts` | Assign report |

### Spy

| Endpoint | File | Description |
|---|---|---|
| `/api/spy/[id]` | `src/pages/api/spy/[id].ts` | Execute spy mission |

### Structures

| Endpoint | File | Description |
|---|---|---|
| `/api/structures/upgrades` | `src/pages/api/structures/upgrades.ts` | Structure upgrade data |

### Social

| Endpoint | File | Description |
|---|---|---|
| `/api/social/add` | `src/pages/api/social/add.ts` | Add friend |
| `/api/social/remove` | `src/pages/api/social/remove.ts` | Remove friend |
| `/api/social/respond` | `src/pages/api/social/respond.ts` | Respond to request |
| `/api/social/count` | `src/pages/api/social/count.ts` | Friend count |
| `/api/social/end` | `src/pages/api/social/end.ts` | End friendship |
| `/api/social/getTop` | `src/pages/api/social/getTop.ts` | Top players social |
| `/api/social/listAll` | `src/pages/api/social/listAll.ts` | List all friends |
| `/api/social/relationship` | `src/pages/api/social/relationship.ts` | Relationship status |
| `/api/social/notifications/count` | `src/pages/api/social/notifications/count.ts` | Notification count |
| `/api/social/friends/[friendId]/transfer` | `src/pages/api/social/friends/[friendId]/transfer.ts` | Gold transfer to friend |
| `/api/social/gold-requests` | `src/pages/api/social/gold-requests/index.ts` | Gold requests list |
| `/api/social/gold-requests/count` | `src/pages/api/social/gold-requests/count.ts` | Gold request count |
| `/api/social/gold-requests/[requestId]/respond` | `src/pages/api/social/gold-requests/[requestId]/respond.ts` | Respond to gold request |

### Alliances

| Endpoint | File | Description |
|---|---|---|
| `/api/alliances/[id]` | `src/pages/api/alliances/[id].ts` | Alliance details |
| `/api/alliances/create` | `src/pages/api/alliances/create.ts` | Create alliance |
| `/api/alliances/update` | `src/pages/api/alliances/update.ts` | Update alliance |
| `/api/alliances/join` | `src/pages/api/alliances/join.ts` | Join alliance |
| `/api/alliances/getAll` | `src/pages/api/alliances/getAll.ts` | All alliances list |
| `/api/alliances/requests` | `src/pages/api/alliances/requests/index.ts` | Join requests |
| `/api/alliances/requests/accept` | `src/pages/api/alliances/requests/accept.ts` | Accept join request |
| `/api/alliances/requests/reject` | `src/pages/api/alliances/requests/reject.ts` | Reject join request |
| `/api/alliances/bank/withdraw` | `src/pages/api/alliances/bank/withdraw.ts` | Alliance bank withdraw |
| `/api/alliances/bank/deposit` | `src/pages/api/alliances/bank/deposit.ts` | Alliance bank deposit |
| `/api/alliances/bank/history` | `src/pages/api/alliances/bank/history.ts` | Alliance bank history |
| `/api/alliances/wars` | `src/pages/api/alliances/wars/index.ts` | Alliance wars list |
| `/api/alliances/wars/declare` | `src/pages/api/alliances/wars/declare.ts` | Declare war |

### Appeals

| Endpoint | File | Description |
|---|---|---|
| `/api/appeals` | `src/pages/api/appeals/index.ts` | Ban appeals |

### Utilities

| Endpoint | File | Description |
|---|---|---|
| `/api/utilities/getRankBreakdown` | `src/pages/api/utilities/getRankBreakdown.ts` | Rank breakdown data |
| `/api/utilities/getConstants` | `src/pages/api/utilities/getConstants.ts` | Game constants |

### Admin API (43 endpoints)

Admin endpoints live under `/api/admin/` and cover user management, moderation, content, economy, system settings, and more.

| Category | Endpoints |
|---|---|
| **Users** | `/api/admin/users`, `/api/admin/users/[userId]`, `/api/admin/users/reset-password`, `/api/admin/users/export`, `/api/admin/grantPermission` |
| **Moderation** | `/api/admin/moderation/bans`, `/api/admin/moderation/chat/mute`, `/api/admin/moderation/chat/unmute`, `/api/admin/moderation/chat/logs`, `/api/admin/moderation/chat/edit`, `/api/admin/moderation/chat/delete`, `/api/admin/moderation/chat/mutes/list`, `/api/admin/moderation/appeals/[appealId]`, `/api/admin/moderation/users/[userId]/notes` |
| **Content** | `/api/admin/content/posts`, `/api/admin/content/posts/[id]`, `/api/admin/content/announcements`, `/api/admin/content/announcements/[id]`, `/api/admin/content/mass-messages`, `/api/admin/content/advisor-messages`, `/api/admin/content/advisor-messages/[id]` |
| **Game** | `/api/admin/game/eras`, `/api/admin/game/alliances`, `/api/admin/game/events`, `/api/admin/game/events/[eventId]` |
| **System** | `/api/admin/system/server-settings`, `/api/admin/system/audit-logs`, `/api/admin/system/feature-flags` |
| **Abuse** | `/api/admin/abuse/cheat-signals`, `/api/admin/abuse/cheat-signals/[action]`, `/api/admin/abuse/multi-accounts` |
| **Other** | `/api/admin/overview`, `/api/admin/economy`, `/api/admin/analytics/players`, `/api/admin/vacation`, `/api/admin/start-era`, `/api/admin/account-action`, `/api/admin/account-reset`, `/api/admin/impersonate/start`, `/api/admin/impersonate/stop`, `/api/admin/api-tokens`, `/api/admin/api-tokens/[tokenId]/revoke`, `/api/admin/simulation/run` |

---

## API Tests

| File | Description |
|---|---|
| `src/pages/api/__tests__/admin-users.api.test.ts` | Admin users API tests |
| `src/pages/api/__tests__/stats.api.test.ts` | Stats API tests |
| `src/pages/api/__tests__/spy.api.test.ts` | Spy API tests |
| `src/pages/api/__tests__/getRankBreakdown.api.test.ts` | Rank breakdown tests |

---

## Route Link References

Links and redirects in the codebase use these patterns:

- `href="/battle/users"` - Navigation links in Sidebar, AdminSidebar
- `router.push('/home/overview')` - Post-login redirects
- `redirect('/')` - Server-side redirects
- `/recruit/[id]` - External recruitment links
