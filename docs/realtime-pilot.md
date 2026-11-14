# Realtime (Socket.IO) map and Durable Object pilot

Factual map of the realtime layer as built on this branch, plus the
Durable Objects pilot for it (issue #23, parts 2–3 — **implemented and
deployed to the Workers preview on 2026-10-16; end-to-end verification in
§7.13**). Everything in sections 1–5 is read from code on
`cloudflare-platform-modernization` and cited `file:line`; the
sections only describe what is implemented today, not what should exist.
Section 6 is the pilot recommendation the implementation followed; section 7
is the implemented design and its decisions; section 8 is the load/cost
comparison plan with the expand-or-stop thresholds.

How realtime is wired today:

- The Socket.IO server attaches **only** in the custom Node server
  (`src/server/index.ts:5`, `src/server/index.ts:31`). The Workers entry
  (`worker.ts`) never imports it.
- All server-side emissions go through the lazy facade
  `src/lib/realtime.ts:51-133` (`emitToRoom`/`emitToUser`/`emitToUsers`/
  `emitToAll`/evict helpers). When `NEXT_PUBLIC_DISABLE_SOCKET` is `'true'` or
  `'1'` every facade function is a no-op and `@/lib/socket` is never even
  imported (`src/lib/realtime.ts:24-29`, `src/lib/realtime.ts:51-65`).
- The preview Workers deployment sets `NEXT_PUBLIC_DISABLE_SOCKET: "true"`
  plus `NEXT_PUBLIC_REALTIME_TRANSPORT: "do"` (`wrangler.jsonc` env.preview),
  so the DO pilot carries live send/receive there (§7.13) while the
  Socket.IO code itself never executes. The rehearsal environment runs the
  same pilot configuration since 2026-10-16 (user-approved; §7.13). Only
  production still builds with realtime off (`DISABLE_SOCKET=true`, no
  transport override) and is read-only over HTTP.
- The client hook gates the same flag at build time
  (`src/hooks/useSocket.ts:12-14`); the same gate hides the send input
  (`src/components/ChatMessageList.tsx:50-53`), the themed chat controls
  (`src/components/game/ChatMessageListThemed.tsx:52`), the connection banner
  (`src/components/ConnectionStatusBanner.tsx:14-16`), and shows a read-only
  notice on `/messaging` (`src/pages/messaging/index.tsx:20-23`,
  `src/pages/messaging/index.tsx:269-279`).

## 1. Event table

Client → server events are registered in `handleConnection`
(`src/lib/socket.ts:97-124`); the connection itself is authenticated in
`allowRequest` — token from `Authorization: Bearer`, `?token=` query, or the
next-auth session cookie, verified with `getToken({ secret: JWT_SECRET })`
(`src/lib/socket.ts:227-300`). A per-packet guard re-validates the session
account on every packet and force-disconnects on failure
(`src/lib/socket.ts:36-57`).

Server → client events reach components through the shared hook's
`socket.onAny` dispatch into a module-level listener registry
(`src/hooks/useSocket.ts:59-68`, `src/hooks/useSocket.ts:119-121`); components
subscribe with `addEventListener(event, fn)` (`src/hooks/useSocket.ts:201-207`).

### 1.1 Client → server

| # | Event | Payload (from handler signature) | Service calls | Rate limit | Emits back |
| --- | --- | --- | --- | --- | --- |
| 1 | `registerUser` (`src/lib/socket.ts:76-94`) | `{ userId: number }` | none | none | none (silent; mismatched userId is logged and ignored, `src/lib/socket.ts:80-85`) |
| 2 | `sendMessage` (`src/lib/socket.ts:97`, handler `src/lib/socket.ts:310-397`) | `{ roomId: number; content: string; tempId?: number; replyToMessageId?: number; messageType?: string; sharedAttackLogId?: number }` (`src/lib/socket.ts:313-320`) | `MessagingService.sendMessageRealtime` (`src/lib/socket.ts:353-359` → `src/services/Messaging.service.ts:947-1134`) | 10 per 10 s per user (`src/lib/socket.ts:322-330`) | `receiveMessage` (see 1.2), `messageError` to sender (`src/lib/socket.ts:325-328`, `src/lib/socket.ts:345-348`, `src/lib/socket.ts:392-395`), `newMessageNotification` per recipient (see 1.2) |
| 3 | `joinRoom` (`src/lib/socket.ts:98`, handler `src/lib/socket.ts:399-491`) | `roomId` (unknown, `Number`-coerced, must be safe positive int, `src/lib/socket.ts:404-405`) | `withLockedChatRoom` row lock (`src/lib/socket.ts:417` → `src/services/chatRoomGuards.ts:8-16`); room lookup (`src/lib/socket.ts:418-421`); participant check (`src/lib/socket.ts:435-448`); alliance membership check (`src/lib/socket.ts:451-470`) | none | `joinedRoom { roomId }` (`src/lib/socket.ts:479`) or `joinRoomError { roomId, error }` (`src/lib/socket.ts:409-412`, `src/lib/socket.ts:427-430`, `src/lib/socket.ts:443-446`, `src/lib/socket.ts:464-467`, `src/lib/socket.ts:486-489`) |
| 4 | `leaveRoom` (`src/lib/socket.ts:99`, handler `src/lib/socket.ts:493-508`) | `roomId` (number or numeric string) | none | none | none |
| 5 | `addReaction` (`src/lib/socket.ts:100`, handler `src/lib/socket.ts:510-605`) | `{ messageId: number; reaction: string; roomId: number }` (`src/lib/socket.ts:513`) | `withLockedChatRoom` (`src/lib/socket.ts:539`); `assertAllianceChatMembership` (`src/lib/socket.ts:540` → `src/services/chatRoomGuards.ts:26-44`); message-in-room check (`src/lib/socket.ts:542-549`); `chatMessageReaction.create` (`src/lib/socket.ts:563-571`) | 20 per 10 s per user (`src/lib/socket.ts:515-523`) | `reactionAdded` to room (see 1.2), `reactionError` to sender (`src/lib/socket.ts:518-521`, `src/lib/socket.ts:530-534`, `src/lib/socket.ts:554-558`, `src/lib/socket.ts:591-595`, `src/lib/socket.ts:598-602`) |
| 6 | `removeReaction` (`src/lib/socket.ts:101-103`, handler `src/lib/socket.ts:607-664`) | `{ messageId: number; reaction: string; roomId: number }` (`src/lib/socket.ts:612`) | `withLockedChatRoom` (`src/lib/socket.ts:627`); `assertAllianceChatMembership` (`src/lib/socket.ts:628`); `chatMessageReaction.deleteMany` scoped to own reaction in room (`src/lib/socket.ts:630-640`) | none | `reactionRemoved` to room (see 1.2); nothing when the reaction did not exist (`src/lib/socket.ts:650-654`); `reactionError` on failure (`src/lib/socket.ts:618-622`, `src/lib/socket.ts:658-662`) |
| 7 | `markAsRead` (`src/lib/socket.ts:104`, handler `src/lib/socket.ts:666-722`) | `{ messageId: number; roomId: number }` or `{ messageIds: number[]; roomId: number }` (`src/lib/socket.ts:669-671`) | participant check (`src/lib/socket.ts:688-695`); `MessagingService.markMessagesAsRead` (`src/lib/socket.ts:697-701` → `src/services/Messaging.service.ts:1286-1341`) | none | `messagesRead` to room (see 1.2); failures only logged, no error event (`src/lib/socket.ts:719-721`) |
| 8 | `getChatRooms` (`src/lib/socket.ts:105`, handler `src/lib/socket.ts:724-735`) | none | `MessagingService.getUserChatRooms` (`src/lib/socket.ts:726` → `src/services/Messaging.service.ts:173-270`) | none | `getChatRoomsSuccess` / `getChatRoomsError` to requesting socket (`src/lib/socket.ts:727`, `src/lib/socket.ts:731-733`) |
| 9 | `createChatRoom` (`src/lib/socket.ts:106-108`, handler `src/lib/socket.ts:737-757`) | `{ name?: string; recipients: number[]; message?: string; isPrivate?: boolean }` (`src/lib/socket.ts:740-745`) | `MessagingService.createOrFindRoom` (`src/lib/socket.ts:748` → `src/services/Messaging.service.ts:275`) | none | `createChatRoomSuccess` / `createChatRoomError` (`src/lib/socket.ts:749`, `src/lib/socket.ts:753-755`) |
| 10 | `getRoomMessages` (`src/lib/socket.ts:109-111`, handler `src/lib/socket.ts:759-777`) | `{ roomId: number }` (`src/lib/socket.ts:762`) | `MessagingService.getRoomMessages` (`src/lib/socket.ts:765-768` → `src/services/Messaging.service.ts:486-617`) | none | `getRoomMessagesSuccess` / `getRoomMessagesError` (`src/lib/socket.ts:769`, `src/lib/socket.ts:773-775`) |
| 11 | `addParticipants` (`src/lib/socket.ts:112-114`, handler `src/lib/socket.ts:779-796`) | `{ roomId: number; userIds: number[] }` (`src/lib/socket.ts:782`) | `MessagingService.addParticipants` (`src/lib/socket.ts:785-787` → `src/services/Messaging.service.ts:622-688`) | none | `addParticipantsSuccess` / `addParticipantsError` (`src/lib/socket.ts:788`, `src/lib/socket.ts:792-794`) |
| 12 | `manageParticipant` (`src/lib/socket.ts:115-117`, handler `src/lib/socket.ts:798-823`) | `{ roomId: number; targetUserId: number; action: 'promote'\|'demote'\|'updatePermissions'; canWrite?: boolean }` (`src/lib/socket.ts:801-806`) | `MessagingService.manageParticipant` (`src/lib/socket.ts:809-814` → `src/services/Messaging.service.ts:693`) | none | `manageParticipantSuccess` / `manageParticipantError` (`src/lib/socket.ts:815`, `src/lib/socket.ts:819-821`) |
| 13 | `removeParticipant` (`src/lib/socket.ts:118-120`, handler `src/lib/socket.ts:825-845`) | `{ roomId: number; targetUserId: number }` (`src/lib/socket.ts:828`) | `MessagingService.removeParticipant` (`src/lib/socket.ts:831-835`); `evictUserFromChatRoom` (`src/lib/socket.ts:836` → `src/lib/socket.ts:943-956`) | none | `removeParticipantSuccess` / `removeParticipantError` (`src/lib/socket.ts:837`, `src/lib/socket.ts:841-843`) |
| 14 | `disconnect` (`src/lib/socket.ts:124`, handler `src/lib/socket.ts:873-888`) | `reason: string` | none | — | none; removes the socket id from the in-process presence map (`src/lib/socket.ts:877-887`); Socket.IO drops channel membership implicitly |

**Client emit sites** (complete list, verified by grep over `src` for
`.emit('`): `registerUser` (`src/hooks/useSocket.ts:94` on connect,
`src/hooks/useSocket.ts:106` on reconnect, `src/pages/messaging/index.tsx:594`);
`joinRoom`/`leaveRoom` on room select/unmount
(`src/pages/messaging/index.tsx:391`, `src/pages/messaging/index.tsx:387`,
`src/pages/messaging/index.tsx:615`); `sendMessage`
(`src/components/MessageInput.tsx:43`, `src/components/game/ChatMessageListThemed.tsx:194`,
themed input `src/components/game/ChatMessageInputThemed.tsx:66`, attack-log
share `src/components/ChatMessageList.tsx:191`);
`addReaction`/`removeReaction`/`markAsRead` via hook helpers
(`src/hooks/useSocket.ts:246-269`) called from
`src/components/ChatMessageList.tsx:148`, `src/components/ChatMessageList.tsx:269-281`
and `src/components/game/ChatMessageListThemed.tsx:142`, `:267-274`.
**Events 8–13 have no client emit site** — the UI performs the same operations
over HTTP (see section 4); those handlers exist server-side only.

### 1.2 Server → client

Only five events have a UI consumer. Verified: the only
`addEventListener` call sites are `src/pages/messaging/index.tsx:587-591` and
`src/context/users.tsx:213-214`.

| Event | Emitted at | Payload | UI consumer |
| --- | --- | --- | --- |
| `receiveMessage` | `src/lib/socket.ts:382` (room), `src/lib/socket.ts:383-385` (sender fallback when not in room) | full serialized `ChatMessage` with sender/reactions/readBy/replyToMessage/sharedAttackLog plus echoed `tempId` (`src/lib/socket.ts:361-370`, serializer `src/lib/socket.ts:127-137`) | `RealtimeMessageHandler` on `/messaging`: dedupes optimistic send by `tempId`, appends to open room, bumps other rooms' `unreadCount`, resorts room list (`src/pages/messaging/index.tsx:399-451`) |
| `newMessageNotification` | `src/lib/socket.ts:915` (per other participant's `user-<id>` room, from `sendNotifications`, `src/lib/socket.ts:890-920`); HTTP twin via facade `src/pages/api/messages/index.ts:90-94` | `{ id, senderId, senderName, content (50-char preview), timestamp, isRead: false, chatRoomId }` (`src/lib/socket.ts:900-910`) | global unread badge in `UserProvider`: appends to `unreadMessages` capped at 20 (`src/context/users.tsx:193-199`, count `src/context/users.tsx:279-282`, rendered in `src/components/navLoggedIn.tsx:368-369`); also updates `/messaging` room list (`src/pages/messaging/index.tsx:453-497`) |
| `reactionAdded` | `src/lib/socket.ts:580` (room) | `{ messageId, userId, reaction, userDisplayName }` (`src/lib/socket.ts:574-579`) | merges into open room's messages (`src/pages/messaging/index.tsx:499-527`) |
| `reactionRemoved` | `src/lib/socket.ts:648` (room) | `{ messageId, userId, reaction }` (`src/lib/socket.ts:643-647`) | filters from open room's messages (`src/pages/messaging/index.tsx:529-547`) |
| `messagesRead` | `src/lib/socket.ts:711-714` (room) | `{ roomId, updates: [{ messageId, userId, readAt }] }` (`src/lib/socket.ts:704-708`) | updates read receipts in open room (`src/pages/messaging/index.tsx:549-581`); clears own entries from the global unread badge (`src/context/users.tsx:201-212`) |

Game alerts (restored 2026-11-13; their listeners were lost in the
2026-10-15 refactor): `attackNotification`, `spyDefenseNotification`,
`goldTransferReceived`, `friendRequestNotification` and
`goldRequestNotification` become translated toasts in `useGameEventAlerts`
(mounted by `UserProvider`), and `socialCountUpdate` sets the nav social badge
(`useSocialCountPush`). On the DO transport they travel through the player's
mailbox, which accepts exactly `USER_MAILBOX_NOTIFY_EVENTS`
(`src/lib/realtimeTransport.ts`); the Next facade skips any other name.

Every other server emission has **no client listener**: all
`*Success`/`*Error` acks (section 1.1), `messageError`, `joinedRoom`,
`joinRoomError`, `reactionError`, `goldRequestCountUpdate`, and
`blogPostNotification` (`src/pages/api/blog/post.ts`, a broadcast the DO
transport does not carry; news shows on the news page).

## 2. Room model

### 2.1 Identification

- A room is a `ChatRoom` row; the socket channel is the literal string
  `room-<ChatRoom.id>` (`src/lib/socket.ts:371`, `src/lib/socket.ts:472`).
  `ChatRoom.id` is an autoincrement `Int` (`prisma/schema.prisma:666`).
- Every user is auto-joined to a personal channel `user-<userId>` on connect
  (`src/lib/socket.ts:69`) and again on `registerUser`
  (`src/lib/socket.ts:87-88`). `user-<id>` is the addressing scheme for all
  per-user pushes, both from socket handlers (`src/lib/socket.ts:915`) and from
  API routes through the facade (`src/lib/realtime.ts:68-72`).
- Alliance rooms: a `ChatRoom` with `allianceId` set
  (`prisma/schema.prisma:675-676`). Alliance membership is an *additional*
  requirement on top of the participant row — it is re-checked at join
  (`src/lib/socket.ts:451-470`), at send (`src/services/Messaging.service.ts:1015-1027`),
  and at reaction add/remove (`src/services/chatRoomGuards.ts:26-44`).
- There are no other channel kinds in the chat path; `emitToRoom` is generic,
  but the only `room-` producers are the chat handlers above.
- Room state changes serialize through a row lock:
  `withLockedChatRoom` runs `SELECT ... FOR UPDATE` on the `ChatRoom` row
  inside a transaction (`src/services/chatRoomGuards.ts:8-16`); join, send,
  reactions, and reads all flow through it.

### 2.2 Authorization on join

`handleJoinRoom` (`src/lib/socket.ts:399-491`) in order:

1. `roomId` must be a safe positive integer (`src/lib/socket.ts:404-414`).
2. Room must exist (`src/lib/socket.ts:418-432`).
3. Caller must have a `ChatRoomParticipant` row — **every** room, not only
   alliance rooms (`src/lib/socket.ts:434-448`; uniqueness per
   `@@unique([roomId, userId])`, `prisma/schema.prisma:693`).
4. If the room has `allianceId`, caller must have an `alliance_memberships`
   row (`src/lib/socket.ts:451-470`).
5. Only then is the socket added to `room-<id>` and `joinedRoom` emitted
   (`src/lib/socket.ts:472-479`).

Send and reactions re-check authorization independently of join state:
`sendMessageRealtime` requires a participant with `canWrite: true`
(`src/services/Messaging.service.ts:1006-1013`) plus alliance membership
(`src/services/Messaging.service.ts:1015-1027`); reactions require the message
to be in a room where the caller is a participant
(`src/lib/socket.ts:542-549`, `src/lib/socket.ts:630-640`). Being in a channel
therefore grants receive-only; write access is always DB-checked.

### 2.3 Presence

- Presence is an in-process `Map<userId, Set<socketId>>` built at connect and
  `registerUser` (`src/lib/socket.ts:30`, `src/lib/socket.ts:71-74`,
  `src/lib/socket.ts:90-93`); `handleDisconnect` removes the socket id and
  deletes the entry when the last socket goes
  (`src/lib/socket.ts:877-888`).
- It is **log/debug only**: fan-out decisions never consult it. Message
  notification fan-out queries `chatRoomParticipant` rows instead
  (`src/lib/socket.ts:895-898`), and the UI's "is_online" flag is derived from
  `last_active` timestamps, not presence (`src/services/Messaging.service.ts:254-259`,
  `src/services/Messaging.service.ts:553-558`). The map does not survive
  process restart and is not shared across nodes.
- Eviction on membership loss: `evictUserFromChatRoom` removes every socket of
  a user from `room-<id>` via `server.in('user-<id>').socketsLeave('room-<id>')`
  (`src/lib/socket.ts:943-956`). Call sites: the `removeParticipant` socket
  handler (`src/lib/socket.ts:836`), the HTTP DELETE participant endpoint
  (`src/pages/api/messages/[chatRoomId]/participants/[participantId].ts:68`),
  and `evictUserFromAllianceChatRooms` for every room of an alliance on
  leave/kick (`src/lib/socket.ts:959-976` → `src/services/Alliance.service.ts:751`,
  `src/services/Alliance.service.ts:830`).

## 3. Reconnect / resume semantics (as implemented)

- Client connection: `socket.io-client` with `reconnection: true`,
  `reconnectionAttempts: 5`, delay 1 s growing to a 30 s cap
  (`src/hooks/useSocket.ts:78-84`).
- On `connect` **and** on `reconnect` the client re-emits only
  `registerUser` (`src/hooks/useSocket.ts:90-95`, `src/hooks/useSocket.ts:102-107`,
  plus `src/pages/messaging/index.tsx:593-595`).
- **Room membership is not restored on reconnect.** The server treats a
  reconnect as a brand-new connection (new socket id, `handleConnection`
  re-runs, `user-<id>` is re-joined at `src/lib/socket.ts:69` but nothing
  re-adds `room-<id>`). Client-side, the join effect re-runs when `isConnected`
  flips, but its join is guarded by
  `selectedRoomId !== currentRoomRef.current`
  (`src/pages/messaging/index.tsx:384-396`), and the ref still holds the old
  room, so no `joinRoom` is re-emitted. After a disconnect/reconnect cycle the
  client silently stops receiving `room-<id>` events until the user re-selects
  the room.
- **No backfill, no queue.** Nothing re-fetches messages or rooms on
  reconnect: history is fetched only when `selectedRoomId` changes
  (`src/pages/messaging/index.tsx:138-164`) and rooms only on mount/new-room
  (`src/pages/messaging/index.tsx:134-136`,
  `src/pages/messaging/index.tsx:257-265`). Messages emitted while disconnected
  are lost to the UI until a room re-selection; there is no client-side event
  buffer (`src/hooks/useSocket.ts` has none) and no server replay.
- Failure path: after 5 failed attempts `reconnect_failed` sets
  `connectionFailed`, which renders `ConnectionStatusBanner` with a manual
  retry (`socket?.connect()`) (`src/hooks/useSocket.ts:113-117`,
  `src/components/ConnectionStatusBanner.tsx:28-34`).
- The badge does reconcile over HTTP independent of the socket: selecting a
  room calls `markRoomAsRead`, which GETs `/api/messages/<roomId>` and prunes
  the badge from the `readBy` arrays in the response
  (`src/context/users.tsx:252-277`).

## 4. HTTP fallback inventory (works today with `NEXT_PUBLIC_DISABLE_SOCKET=true`)

| Capability | Endpoint | Notes |
| --- | --- | --- |
| List rooms with unread counts | `GET /api/messages` (`src/pages/api/messages/index.ts:27-38`) | `MessagingService.getUserChatRooms` returns per-room `unreadCount` computed as `chatMessage.count(senderId != me, readBy none: me)` (`src/services/Messaging.service.ts:221-227`) |
| Create room / start DM (optionally with first message) | `POST /api/messages` (`src/pages/api/messages/index.ts:40-113`) | zod-validated (`src/pages/api/messages/index.ts:16-21`); when a first message is included and realtime is enabled, pushes `newMessageNotification` via the facade (`src/pages/api/messages/index.ts:59-95`) |
| Read full room history | `GET /api/messages/[chatRoomId]` (`src/pages/api/messages/[chatRoomId].ts:36-47`) | GET-only by design — "message creation/modification is handled via WebSockets" (`src/pages/api/messages/[chatRoomId].ts:48-52`); participant + alliance checks inside `getRoomMessages` (`src/services/Messaging.service.ts:488-506`) |
| Add participants | `POST /api/messages/[chatRoomId]/participants` (`src/pages/api/messages/[chatRoomId]/participants/index.ts:37-66`) | 1–50 ids (`index.ts:16-18`; `MAX_ADD_PARTICIPANTS = 50`, `src/services/Messaging.service.ts:88`); room-admin or site-admin required (`src/services/Messaging.service.ts:642-647`) |
| Promote/demote/permissions, remove participant | `PATCH` / `DELETE /api/messages/[chatRoomId]/participants/[participantId]` (`src/pages/api/messages/[chatRoomId]/participants/[participantId].ts:44-70`) | DELETE evicts the removed user's sockets via the facade (`[participantId].ts:68`) |
| Compose UI over HTTP | `NewMessageModal` | searches users (`src/components/NewMessageModal.tsx:77`), creates room (`:151`), adds participants to an existing room (`:172-173`) — this is how sending still *starts* a conversation on Workers, though the message content send itself has no HTTP path |
| Unread badge reconcile on room open | client GET `/api/messages/<roomId>` via `markRoomAsRead` (`src/context/users.tsx:252-277`) | badge = socket-fed `unreadMessages` list, pruned using the fetched `readBy` data |
| Social notification count | `GET /api/social/notifications/count` (`src/pages/api/social/notifications/count.ts:20`) | polled every 2 min + on focus/visibility from the nav (`src/components/navLoggedIn.tsx:259-291`) and `MainArea` (`src/components/MainArea.tsx:67-106`); counts social notifications, **not** chat unread |

Not available over HTTP today (socket-only): sending message content
(`sendMessage`), reactions add/remove, `markAsRead` (so read receipts never
advance without a socket), and message search (`searchMessages` has no HTTP
route under `src/pages/api/messages/`; only the socket handler exists,
`src/lib/socket.ts:847-871`). The chat-unread badge has no HTTP *seed*
endpoint either — on a fresh page load with sockets disabled,
`unreadMessages` starts empty (`src/context/users.tsx:74`); the
room-list `unreadCount` from `GET /api/messages` is the only HTTP unread signal.

## 5. Fanout and abuse surface

### 5.1 Delivery topology

| Scope | Events | Evidence |
| --- | --- | --- |
| Room broadcast (`io.to('room-<id>')`) | `receiveMessage` (`src/lib/socket.ts:382`), `reactionAdded` (`src/lib/socket.ts:580`), `reactionRemoved` (`src/lib/socket.ts:648`), `messagesRead` (`src/lib/socket.ts:711-714`) | all require the emitting user to have passed join/participant checks (section 2.2) |
| Per-user fan-out (`user-<id>`, N emits) | `newMessageNotification` — one emit per room participant except sender (`src/lib/socket.ts:895-919`); facade twin `emitToUsers` (`src/pages/api/messages/index.ts:90-94`, `src/lib/realtime.ts:75-83`) | recipients are DB participants, not connected sockets (`src/lib/socket.ts:895-898`) |
| Single socket (requesting socket only) | all `*Success`/`*Error` acks (`src/lib/socket.ts:727`, `:731`, `:749`, `:753`, `:769`, `:773`, `:788`, `:792`, `:815`, `:819`, `:837`, `:841`, `:863`, `:867`), `messageError` (`src/lib/socket.ts:325`), `joinRoomError` (`src/lib/socket.ts:409`), `reactionError` (`src/lib/socket.ts:518`) | request/response over one socket; `receiveMessage` also echoes to the sender's socket when the sender is not in the room (`src/lib/socket.ts:373-385`) |
| Global broadcast | `blogPostNotification` via `emitToAll` (`src/pages/api/blog/post.ts:44`, `src/lib/realtime.ts:86-97`) | only global emit in the codebase |

### 5.2 Rate limiting

Two limits, both per-user and Postgres-backed (fixed two-bucket window,
atomic `INSERT ... ON CONFLICT`, `src/lib/postgres-rate-limiter.ts:31-58`,
wired through `src/lib/rate-limiter.ts:8-11`):

- `sendMessage`: 10 per 10 s (`src/lib/socket.ts:322-330`), exceeded →
  `messageError` "You are sending messages too quickly."
- `addReaction`: 20 per 10 s (`src/lib/socket.ts:515-523`), exceeded →
  `reactionError`.

No limiter exists on `removeReaction`, `markAsRead`, `joinRoom`/`leaveRoom`,
or the request/response events (`getChatRooms`, `getRoomMessages`,
`searchMessages`, participant management) — their cost is bounded only by
Socket.IO and DB latency.

### 5.3 Validation and size bounds

- Identity: every packet passes `installSocketAccountGuard` (session account
  current + status allowed, else disconnect, `src/lib/socket.ts:36-57`); the
  connection handshake already verified the JWT and account
  (`src/lib/socket.ts:274-294`). `registerUser` cannot impersonate — a
  mismatched `userId` is rejected (`src/lib/socket.ts:80-85`).
- `sendMessage` payload: zod `SendMessageSchema` — `content: z.string().min(1)`
  with **no maximum** (`src/services/Messaging.service.ts:76-85`, applied at
  `src/services/Messaging.service.ts:994`). No client-side `maxLength` on the
  input either (`src/components/MessageInput.tsx:105-121`). The DB column is
  unbounded `String` (`prisma/schema.prisma:700`). The only effective cap is
  Engine.IO's default message size — `initializeSocket` sets no
  `maxHttpBufferSize` (`src/lib/socket.ts:215-301`).
- `messageType` allowlist: only `'TEXT'` and `'ATTACK_LOG_SHARE'` pass
  (`src/services/Messaging.service.ts:1041-1054`); attack-log shares require
  read permission on the log (`src/services/Messaging.service.ts:1043-1051`,
  `src/services/Messaging.service.ts:125-140`). Reply target must exist in the
  same room (`src/services/Messaging.service.ts:1029-1038`).
- Reactions: `reaction` is `z.string().min(1)`, no max
  (`src/services/Messaging.service.ts:113-116`); duplicates fail on the unique
  constraint and surface as `reactionError` (`src/lib/socket.ts:584-596`).
- `markAsRead`: 1–100 ids (`src/services/Messaging.service.ts:118-120`); every
  id must be in the caller's rooms or the whole call is rejected
  (`src/services/Messaging.service.ts:1294-1305`); the socket handler
  additionally pins the room and participant first
  (`src/lib/socket.ts:688-695`).
- Transport-level: socket CORS origin allowlist from
  `OT_SOCKET_CORS_ORIGINS` / `NEXT_PUBLIC_SOCKET_IO_ORIGIN`, default `*`
  (`src/lib/socket.ts:203-225`); connection authorization is token-based, not
  origin-based (`src/lib/socket.ts:227-300`). All payloads pass through a
  JSON round-trip sanitizer (bigint → string, Date → ISO) before emit
  (`src/lib/socket.ts:127-137`).

## 6. Pilot recommendation

**Smallest real capability to pilot on a Durable Object: live send/receive for
a single open chat room, with the unread badge, over one room.** That is the
narrow slice whose loss actually hurts on Workers today (read-only messaging,
section 4) and the only slice with a client contract to preserve
(section 1.2). It exercises one DO per open room, one user-bound subscription
path, and Postgres as the source of truth — no presence service, no
cross-room fan-out, no search.

Events the pilot must cover (subset of section 1):

| Direction | Event | Why |
| --- | --- | --- |
| client → DO | `sendMessage` (`src/lib/socket.ts:313-320` shape) | the write path |
| DO → clients | `receiveMessage` (full serialized message + `tempId`, `src/lib/socket.ts:361-370`) | open-room render + optimistic dedupe by `tempId` (`src/pages/messaging/index.tsx:404-417`) |
| DO → client | `messageError { tempId, error }` (`src/lib/socket.ts:392-395`) | input error surface |
| DO → clients | `newMessageNotification` (`src/lib/socket.ts:900-910`) | unread badge for rooms **other** than the open one (`src/context/users.tsx:193-199`) |
| client → DO | `markAsRead` (`src/lib/socket.ts:669-671`) | badge clearing + read receipts |
| DO → clients | `messagesRead { roomId, updates }` (`src/lib/socket.ts:711-714`) | consumed by both `/messaging` and the badge (`src/pages/messaging/index.tsx:549-581`, `src/context/users.tsx:201-212`) |

Reactions, room CRUD, participant management, and search stay on their existing
surfaces (HTTP for CRUD, section 4; socket-only for reactions/search until a
later wave).

Authorization invariants the pilot must preserve (each is enforced somewhere
today; the DO must not weaken them):

1. **Authenticated identity per connection, re-checked server-side** — the DO
   must know the verified `userId` for each websocket, equivalent to the
   handshake (`src/lib/socket.ts:274-294`) and the per-packet account guard
   (`src/lib/socket.ts:36-57`); a client claiming another `userId` must be
   rejected (`src/lib/socket.ts:80-85`).
2. **Receive requires the participant row** (plus alliance membership for
   alliance rooms) — enforced at join today (`src/lib/socket.ts:434-470`).
   Joining a DO room without a DB participant row must fail; because Workers
   have no long-lived server-side guard, the check must run at DO-join time.
3. **Send requires `canWrite` + participant + alliance membership** —
   `src/services/Messaging.service.ts:1006-1027`. Cheapest correct approach:
   keep calling `MessagingService.sendMessageRealtime` (it already validates
   everything and is the write path HTTP history/unread counts depend on), and
   let the DO own only delivery.
4. **Membership loss must stop delivery** — eviction parity with
   `evictUserFromChatRoom` (`src/lib/socket.ts:943-956`): when
   `removeParticipant` runs (`[participantId].ts:68`) or an alliance member
   leaves (`src/services/Alliance.service.ts:751`, `:830`), the removed user's
   live subscription must die.
5. **Per-user send rate limit 10/10 s** — `src/lib/socket.ts:322-330`; the
   Postgres limiter (`src/lib/postgres-rate-limiter.ts:31-58`) works unchanged
   from a Worker/DO, so keep it.
6. **`markAsRead` scoping** — caller must be a participant
   (`src/lib/socket.ts:688-695`), ids limited to 100 and room-scoped
   (`src/services/Messaging.service.ts:118-120`, `:1294-1305`).
7. **Postgres remains the source of truth** — messages persist through
   Prisma (`src/services/Messaging.service.ts:1056-1105`) so `GET
   /api/messages/[chatRoomId]` and unread counts
   (`src/services/Messaging.service.ts:221-227`) keep working; the DO is a
   delivery/fan-out layer, not a message store.
8. **No application-level size bound exists today** (section 5.3); the pilot
   should introduce one explicitly rather than inherit an engine default.

**TODO(design)** — resolved by the implemented pilot; each decision now lives
in section 7 (§7.3 naming/sharding, §7.1 hibernation, §7.5 auth, §7.7
coexistence/rollout, §7.11 reconnect). The remaining open item — how
server-side senders that are *not* the DO (e.g. `POST /api/messages` with a
first message, `src/pages/api/messages/index.ts:59-95`) reach user mailboxes —
was resolved on 2026-10-30 (§7.14): the realtime facade reaches the mailbox
DO through OpenNext's `getCloudflareContext`.

## 7. Implemented pilot design (issue #23 parts 2–3)

Everything in sections 1–5 above is unchanged: the Socket.IO server, its
handlers, and the Node dev runtime are untouched (rollback path). What the
pilot adds, all behind the `NEXT_PUBLIC_REALTIME_TRANSPORT` flag:

| Piece | File |
| --- | --- |
| Pure DO logic (frame validation, per-connection rate limit, membership bookkeeping, hibernation metadata, fanout/eviction planning) — zero imports, workerd-free, unit-tested | `src/durable-objects/chatDoCore.ts` |
| `ChatRoomDO` class — thin adapter wiring core logic to `ctx`/`env`; WebSocket Hibernation API; no `cloudflare:workers` import so bun tests can drive it with fakes | `src/durable-objects/ChatRoomDO.ts` |
| `/do/*` router (idFromName dispatch) — zero imports, unit-tested | `src/lib/workerDoRouter.ts` |
| Worker entry: `export { ChatRoomDO }` + `/do/*` routing ahead of the OpenNext handler | `worker.ts` |
| DO binding + migration (`new_sqlite_classes`) | `wrangler.jsonc` |
| Short-lived signed tickets (HMAC-SHA256/WebCrypto, shared by route + DO) | `src/lib/realtimeTicket.ts` |
| Ticket issuance (session auth + join authorization) | `src/pages/api/realtime/ticket.ts` |
| Internal write path (TASK_SECRET, persists via `MessagingService.sendMessageRealtime`) | `src/pages/api/realtime/send.ts` |
| Internal read-receipt path (TASK_SECRET, persists via `MessagingService.markMessagesAsRead`) | `src/pages/api/realtime/read.ts` |
| Join-authorization sequence shared by the ticket route (mirrors `handleJoinRoom`) | `src/services/chatRoomGuards.ts` (`assertCanJoinChatRoom`) |
| Transport selection + wire constants (single source of truth for the flag) | `src/lib/realtimeTransport.ts` |
| Browser DO transport (mailbox + room websockets, reconnect, dispatch into the existing event registry) | `src/lib/realtimeDoClient.ts` |
| Transport switch in the shared hook (socketio / do / off) | `src/hooks/useSocket.ts` |
| WebSocket load harness | `scripts/loadtest-chat.ts` |
| Tests | `src/durable-objects/chatDoCore.test.ts`, `src/durable-objects/ChatRoomDO.test.ts`, `src/lib/__tests__/workerDoRouter.test.ts`, `src/lib/realtimeTicket.test.ts`, `src/lib/realtimeTransport.test.ts`, `src/lib/realtimeDoClient.test.ts`, `src/__tests__/pages/api/realtime/ticket.api.test.ts` |

### 7.1 Hibernation vs always-on

**Chosen: WebSocket Hibernation API** (`ctx.acceptWebSocket` +
`webSocketMessage`/`webSocketClose`/`webSocketError` handlers), per the
Cloudflare guidance this repo follows: hibernating sockets cost nothing while
idle, and chat rooms idle most of the time. Concretely:

- The DO keeps no timer and no always-on loop; it wakes per inbound frame or
  connection. An idle room's only persistent cost is the DO's storage row.
- Per-connection metadata (userId) rides the socket **attachment**
  (`serializeAttachment`/`deserializeAttachment`), which survives eviction;
  the membership index (`RoomMembership.fromSockets(ctx.getWebSockets())`)
  is rebuilt lazily after a wake — `ChatRoomDO.webSocketMessage` also
  re-loads the DO identity from `ctx.storage` first (caught by
  `src/durable-objects/ChatRoomDO.test.ts`'s restarted-instance test).
- The DO identity (`room:<id>` / `user:<id>`) is persisted once via
  `ctx.storage.put` and asserted on every later request, so an idFromName
  wiring regression fails closed instead of cross-delivering.
- Trade-off accepted: the in-memory per-connection rate-limit windows reset
  on hibernation wake (§7.8). The authoritative limiter is not in the DO.

`new_sqlite_classes` (not legacy `new_classes`) is used for the migration:
the pilot only does KV-style `storage.put/get`, but SQLite-backed is the
supported class form, keeps the free-tier path open, and storage billing is
on actual use.

### 7.2 What the DO owns — and does not

The DO owns **connections and fanout only**. Every write goes through the
existing services: `webSocketMessage(sendMessage)` POSTs (over the
`WORKER_SELF_REFERENCE` service binding, raw `TASK_SECRET` header — the cron
contract, `src/lib/workerCron.ts`) to `/api/realtime/send`, which calls the
same `MessagingService.sendMessageRealtime` the Socket.IO handler calls
(invariant 3: participant + `canWrite` + alliance membership + reply/log
validation all stay in the service). `markAsRead` likewise goes to
`/api/realtime/read` → `MessagingService.markMessagesAsRead` (invariant 6).
Postgres remains the source of truth (invariant 7): history
(`GET /api/messages/[chatRoomId]`) and unread counts are untouched.

Why a service-binding hop instead of importing the service into the DO:
anything reachable from `worker.ts` is bundled by wrangler's esbuild without
the Next `@/` path aliases (the constraint `src/lib/workerCron.ts` is written
around), and importing the Prisma/NextAuth graph into the worker-entry
bundle would duplicate the machinery OpenNext already wires (wasm injections
etc.). The self-reference hop reuses the exact pattern the Cron fan-out
already runs in production.

### 7.3 Naming/sharding and the badge channel

One DO instance per room: `idFromName("room:<id>")` from `/do/chat/<id>`.
The badge problem (§6 TODO: how `newMessageNotification` reaches a client
whose room socket is in a *different* room's DO) is solved with a **second
addressing kind on the same class**: `idFromName("user:<id>")` from
`/do/user/<id>` — a per-user mailbox. The browser opens both websockets
(mailbox on `registerUser`, room on `joinRoom`). After a send, the room DO
POSTs an internal `/notify` (event allowlist: `newMessageNotification`) to
each other participant's mailbox stub via its own `CHAT_ROOM_DO` namespace
binding. `messagesRead` stays a room broadcast; the badge-clearing consumer
(`src/context/users.tsx:201-212`) sees it through the shared client event
registry regardless of which socket delivered it.

### 7.4 Wire protocol

Client → DO frames (validated in `chatDoCore.parseInboundFrame`, unknown
fields dropped):

```jsonc
{ "type": "sendMessage", "roomId": 42, "content": "hi", "tempId": 31,
  "clientMessageId": "<uuid>", "richContent": { /* chat rich doc */ },
  "replyToMessageId": 7, "messageType": "TEXT", "sharedAttackLogId": 5 } // optional fields
{ "type": "markAsRead", "roomId": 42, "messageIds": [1, 2] } // ≤ 100 ids
```

DO → client frames are Socket.IO-compatible event envelopes, so the browser
transport dispatches them into the existing `useSocket` listener registry
and every current consumer (`src/pages/messaging/index.tsx:587-591`,
`src/context/users.tsx:213-214`) works unchanged:

```jsonc
{ "event": "hello", "payload": { "roomId": 42 } }
{ "event": "receiveMessage", "payload": { /* serialized message + tempId */ } }
{ "event": "messageError", "payload": { "tempId": 31, "clientMessageId": "<uuid>", "error": "..." } }
{ "event": "sendMessageAck", "payload": { "clientMessageId": "<uuid>", "ack": { "ok": true, "message": { /* … */ } } } }
{ "event": "newMessageNotification", "payload": { /* §1.2 shape */ } }
{ "event": "messagesRead", "payload": { "roomId": 42, "updates": [...] } }
```

`sendMessageAck` (v0.10.0 parity) is the DO equivalent of the Socket.IO
`sendMessage` acknowledgement callback the chat outbox (`useChatOutbox`)
waits on: sent to the sender only, before fan-out, for every send that
carries a `clientMessageId` — `{ ok: true, message }` on durable storage,
`{ ok: false, error: 'RATE_LIMITED' | 'REJECTED' }` otherwise. The browser
transport resolves it by `clientMessageId` behind the shim's
`timeout(ms).emit(event, payload, ack)` and never dispatches it as an
event. A retried `clientMessageId` that the service deduplicates is
re-acknowledged and echoed to the sender only, with no fan-out or mailbox
notification, matching `src/lib/socket.ts` `handleSendMessage`.

The message payload is serialized in `/api/realtime/send` by a byte-for-byte
copy of the Socket.IO server's `serializeData` semantics (bigint → string,
Date → ISO; `src/lib/realtimeInternal.ts`) so frames from either transport
are interchangeable.

### 7.5 Authorization (auth design)

Full NextAuth session validation is not reachable from the worker entry (the
import-graph constraint above), so the pilot uses a **short-lived signed
ticket** — the approach anticipated in §6's invariants:

1. The browser POSTs `/api/realtime/ticket` (standard `withAuth` session —
   the same guard as every messaging endpoint) with an optional `roomId`.
2. For a room ticket, the route runs the full join-authorization sequence
   (`assertCanJoinChatRoom` in `src/services/chatRoomGuards.ts`, mirroring
   `handleJoinRoom`: room exists → participant row → alliance membership) —
   invariant 2's check runs here, seconds before the connect.
3. The route returns an HMAC-SHA256 ticket (`JWT_SECRET`, the same secret
   the Socket.IO handshake verifies) binding `{ userId, roomId }` with a
   **60 s TTL** (`src/lib/realtimeTicket.ts`).
4. The DO verifies signature, version, expiry, and scope at connect: a room
   ticket may open only its own room's DO, a personal ticket only the
   bearer's own `/do/user/<id>` (invariant 1 — a client cannot claim another
   userId; there is no client-supplied identity on the wire at all).

Revocation lag is bounded by the TTL: a user removed from a room can hold a
connection only until the ticket path re-checks or the room's next activity
evicts them (§7.6). Replay within the TTL (a sniffed ticket opening a second
connection) is equivalent to the bearer JWT the Socket.IO handshake accepts
and is accepted for the pilot; one-time-use tickets would need DO storage
per jti and are deferred. Note the ticket currently travels in the WebSocket
URL query string (`?ticket=…`, `src/lib/realtimeTransport.ts`), which can
surface in intermediary access logs — over TLS to Cloudflare only the edge
sees it, and the 60 s TTL bounds the exposure. If the pilot expands, move
the ticket into the first client frame after upgrade or a
`Sec-WebSocket-Protocol` subprotocol field and enforce single-use jti.

Per-packet re-check parity (invariant 1's account guard): every
`/api/realtime/send` call re-checks `isSessionAccountStatusAllowed(userId)`
(ban/suspension/vacation/closure stop acting over the DO path, like
`installSocketAccountGuard` does for Socket.IO).

### 7.6 Eviction on membership loss

Invariant 4 ("membership loss must stop delivery") is enforced **lazily** in
the pilot: `/api/realtime/send` and `/api/realtime/read` return the current
`participantUserIds`, and the room DO closes every socket whose userId is no
longer in that list (`planEvictions`). So a removed member's subscription
dies on the room's next activity — their own sends fail immediately (the
service re-checks the participant row), and passive delivery stops at the
next message or read receipt in that room. The HTTP eviction call sites
(`[participantId].ts:68`, alliance leave/kick) cannot reach the DO from
inside the OpenNext handler in this pilot, so push-eviction is **deferred**
(§7.12). Ticket TTL (60 s) bounds the worst case for re-connects.

### 7.7 Coexistence and rollback

The flag `NEXT_PUBLIC_REALTIME_TRANSPORT` (`socketio` | `do` | `off`,
default `socketio`) selects the transport; resolution lives in one tested
place (`src/lib/realtimeTransport.ts`):

- `off` reproduces today's `NEXT_PUBLIC_DISABLE_SOCKET` semantics exactly;
  the legacy kill switch still forces `off` **unless** the explicit `do`
  pilot value is set (the pilot never touches Socket.IO, so it can run on a
  preview built with `NEXT_PUBLIC_DISABLE_SOCKET=true`).
- `socketio` (default): the client hook's Socket.IO code path is byte-for-
  byte today's — the pilot only wraps the connect/teardown seam in
  `useSocket`. The Node dev server is unchanged.
- The build-time constant reality (docs/operations.md: NEXT_PUBLIC_* values
  are inlined by `next build`) means flipping the pilot on preview requires
  building with `NEXT_PUBLIC_REALTIME_TRANSPORT=do` **and** setting the
  runtime var; **rollback is a redeploy of the previous build** — no data,
  migration, or config must be undone (the DO holds no message state).
- `/do/*` routes exist only on the Worker entry; on the Node runtime they
  404 and a mis-set flag falls back (below) rather than crashing.

Fallback: if the DO transport cannot connect (or gives up after 5 reconnect
attempts), it reports `connectionFailed`, stops delivering events, and the
page is exactly the HTTP read-only mode of §4 (rooms/messages still load over
HTTP; sends no-op on `!isConnected`) plus the existing
ConnectionStatusBanner retry. Reactions are out of pilot scope (§6): in `do`
mode the transport drops `addReaction`/`removeReaction` emits with a log
line — the same capability gap as today's disabled mode.

### 7.8 Fanout limits and abuse controls

- Frame size: **32 KiB hard cap** on any inbound frame (bytes, pre-parse;
  invariant 8 — explicit instead of the absent engine default), → close 1009.
- Rate limits: per-connection `sendMessage` **10/10 s** in the DO (early
  rejection) *and* the authoritative per-user Postgres limiter
  (`sendMessage-${userId}`, 10/10 s) inside `/api/realtime/send` — invariant
  5 unchanged; plus a coarse **60 frames/10 s** cap on all inbound per
  connection (bounds markAsRead/garbage that Socket.IO leaves to latency)
  → close 1008.
- Shape: strict frame validation with unknown-field dropping; `messageType`
  allowlist (`TEXT`, `ATTACK_LOG_SHARE`) matches the service's; `markAsRead`
  ≤ 100 ids room-scoped.
- Ticket: 60 s TTL, room/user scope binding, HMAC with `JWT_SECRET`;
  internal endpoints refuse everything without the raw `TASK_SECRET`
  (constant-time compare), and the mailbox `/notify` accepts only the
  allowlisted badge event.
- DO memory: the membership index is O(connections), rebuilt on wake; rate
  windows prune lazily. No message content is stored in the DO.
- Known limits (accepted for the pilot): DO-side windows reset on
  hibernation wake (Postgres limiter still holds); replay within ticket TTL
  (§7.5); lazy eviction (§7.6).

### 7.9 Rollout mechanics

1. ~~`bunx wrangler deploy --env preview` with the DO binding~~ — done.
2. ~~Build + deploy the preview with `NEXT_PUBLIC_REALTIME_TRANSPORT=do`
   (build env) and the same var set in the preview env~~ — done
   2026-10-16 (see §7.13); scripted E2E passed; a staff account exercising
   `/messaging` live send/receive + badge in a real browser is the
   remaining human check.
3. ~~Run the harnesses against the preview~~ — correctness runs done
   (§7.13); the full §8 concurrency ladder remains.
4. Expand or stop per §8.3's thresholds. Production stays
   `NEXT_PUBLIC_DISABLE_SOCKET=true` until a separate decision.

### 7.10 What the pilot deliberately does NOT cover

Reactions, typing indicators (`chatTyping` / `chatTypingUpdate`), room
CRUD/participant management, and search keep their current
surfaces (HTTP for CRUD §4; socket-only for reactions/search — on Workers
reactions remain unavailable, same as today). No presence. No cross-room
message sync beyond the badge.

### 7.11 Reconnect/resume semantics (pilot)

The DO transport fixes the cheap half of §3's reconnect gap: on an
unexpected websocket close it reconnects with the Socket.IO cadence
(5 attempts, 1 s doubling to 30 s cap), fetches a **fresh ticket** each
attempt (never reuses an expired one), and — unlike the Socket.IO path —
**automatically re-joins the open room** after the mailbox reconnects, so
room delivery resumes without a manual room re-selection. Backfill is
unchanged/deferred: messages sent while fully disconnected are fetched only
when the room is re-opened or the page reloads (HTTP history), same as
today. On final failure: HTTP read-only fallback (§7.7) with manual retry
from the banner.

### 7.12 Deferred (explicitly out of this pilot)

- Server-side per-user events other than `newMessageNotification`
  (attack/spy/social pushes) reaching user mailboxes: the mailbox only
  accepts `USER_MAILBOX_NOTIFY_EVENTS`, so on Workers they stay no-ops.
  (`newMessageNotification` from `POST /api/messages` now reaches mailboxes;
  see §7.14.)
- Push eviction from the HTTP participant-delete/alliance-leave call sites
  (would need the same handler→DO reach).
- One-time-use tickets; per-DO subscription caps; WebSocket auto-response
  ping/pong; unread-badge HTTP seed endpoint (§4).

### 7.13 Preview deployment and verification (2026-10-16)

The pilot was enabled on the preview (`package.json`
`cloudflare:build:preview` sets `NEXT_PUBLIC_REALTIME_TRANSPORT=do` at build
time; `wrangler.jsonc` env.preview vars carry the runtime copy) and
verified end to end against `<preview Worker URL>`
by a scripted client (artifacts + scripts under
`dogfood-output/rt-e2e-2026-10-16/`, two registered synthetic users,
room 8). Two workerd runtime behaviors that unit-test fakes cannot
reproduce surfaced during deployed verification; both are fixed with
regression tests:

1. **`new WebSocketPair()` returns `{ 0: <client>, 1: <server> }`** — the
   named `client`/`server` properties of the classic examples no longer
   exist in this workerd line (WebSockets runtime API docs; the documented
   destructuring is `let [client, server] = Object.values(new
   WebSocketPair())`). The old factory read `pair.server` → `undefined` →
   every upgrade threw `acceptWebSocket: parameter 1 is not of type
   'WebSocket'`. `ChatRoomDO.createWebSocketPair` now normalizes both
   shapes and fails loudly on neither; regression tests cover both forms.
2. **Service-binding `fetch` must be invoked as a method** — the send and
   markAsRead paths destructured `this.env.WORKER_SELF_REFERENCE?.fetch`
   and called it detached, which workerd rejects with `Illegal invocation:
   function called with incorrect 'this' reference`. Both call sites now
   call `selfService.fetch(url, init)` on the binding object, and the bun
   test fake for the binding throws on detached calls so this class of bug
   cannot pass tests again.

Verification results on worker version `2a20b1d1`: all semantic checks
pass in two independent scripted suites — `hello` on room + mailbox
sockets, `receiveMessage` fanned out to both participants (single-message
RTT ≈ 2.0 s), `newMessageNotification` delivered to the recipient's
mailbox, `markAsRead` → `messagesRead` broadcast (≈ 0.4 s), invalid/
cross-user tickets rejected, zero stray `messageError` frames. Harness
runs at 4 connections delivered every persisted broadcast (40/40 with a
15 s drain; the default 3 s drain is shorter than this path's delivery
latency and goes red spuriously — pass `--drain-ms 15000` on the
preview); concurrent-send RTT p50 ≈ 6.6 s / max 7.6 s. Failed sends
surface correctly as `messageError` from two staging-DB-path limits
(`docs/database-reliability.md`), not the DO: "Unable to start a
transaction in the given time" and, at 4-socket concurrency, ~2/12 sends
exceeding Prisma's 5 s interactive-transaction cap inside
`sendMessageRealtime` — candidate follow-up for the §8.3 ladder: raise
that timeout or trim the work inside the transaction. The production
rehearsal measures against Supabase and is expected to differ. Harness
fixes from this pass: the `https://` protocol literal that rejected
every https base URL, sockets now closed after the summary so the
process exits, and tempIds start at 1 (tempId 0 is filtered as "missing
echo" and failed every fanout check spuriously).

**Rehearsal enablement (2026-10-16, user-approved).** The rehearsal
(`<rehearsal Worker URL>`, now also `https://stage.openthrone.dev`; production Supabase
database) now builds with the same `NEXT_PUBLIC_REALTIME_TRANSPORT=do`
configuration (worker version `fb9e5536`), giving the pilot its first
production-path deployment. Automated verification there stays on the
readiness operation per the rehearsal's operating rules
(`docs/cloudflare-modernization.md`): `/__rehearsal/health` returns
`{"ready":true}` and `/do/*` answers from the DO router (426 on plain
GET), but live send/receive is a **manual** check — sign in on the
rehearsal, open `/messaging` in two sessions, and confirm live delivery,
badge updates, and read receipts. Production-path RTT numbers from that
manual exercise should replace the staging numbers above in the §8.3
evaluation.

## 8. Load / cost comparison plan

**Preview measurements recorded 2026-10-16 (§7.13); the full §8.3 matrix
(concurrency ladder 5/20/50, mixed runs) ran 2026-10-19 after the
operator enabled `ENABLE_MESSAGING` on staging — verdict: STOP / fix
first.** Raw artifacts: `dogfood-output/rt-ladder-2026-10-18/`
(ladder-5|20|50-summary.json, ladder.mjs driver; 52 synthetic users in one
room, one ticket per connection to respect the per-user 10-sends/10 s
quota, 4 messages per connection at 1.2 s spacing, 15 s drain).

| Rung | Connections | Sent | Delivered (RTT sampled) | messageError | Result |
| --- | --- | --- | --- | --- | --- |
| 5 | 5/5 | 20 | 45 broadcasts / 9 RTT samples | 11 | FAIL (expired transactions) |
| 20 | 20/20 | 80 | 0 | ~40 surfaced in-drain | FAIL (total collapse) |
| 50 | 25/50 connected | 200 | 0 | 63 surfaced in-drain | FAIL (collapse + memory) |

Findings, in order of severity:

1. **Send-path serialization blows the 5 s interactive transaction.**
   `MessagingService.sendMessageRealtime` wraps every send in
   `withLockedChatRoom` (room-row lock; all validation queries inside):
   participant check, optional alliance-membership check, reply check,
   `chatMessage.create`, `chatRoom.update`. On the staging DB path each send
   holds the lock ~1 s, so the queue behind the lock exceeds the 5 s
   Prisma interactive-transaction timeout from ~5 concurrent senders per
   room: rung 5 loses 11/20 sends ("A query cannot be executed on an
   expired transaction … 5342 ms passed", "Unable to start a transaction
   in the given time"); rungs 20/50 deliver nothing. This is master's
   service design (unchanged by the merge) — on the LXC a local database
   hides the cost; the Workers path exposes it. The 2026-10-16 §7.13 note
   ("raise that timeout or trim the work inside the transaction") is now
   confirmed as **blocking**, not candidate.
2. **Worker memory ceiling exceeded under rung 50.** `wrangler tail`
   during the ladder recorded **28 `exceededMemory` events** on the preview
   worker (128 MiB isolate) — only 25/50 sockets connected at that rung.
   Attribution (DO fanout buffers vs OpenNext SSR vs WebSocket hibernation
   overhead) is an open investigation item; it is disqualifying for
   "expand" on its own (§8.3 requires zero CPU-limit errors; memory is the
   stricter sibling).
3. **HTTP-degradation comparison not meaningful under a collapsed rung**
   (unmeasured). Baseline captured immediately before the ladder, clean:
   2402/2402 requests, 0 errors — `/` p50/p95/p99 66/1225/1744 ms,
   `/api/config` 51/1392/2071 ms (the known staging-path tail, no erroring).

Fix options for item 1 (in the order the pilot would try): trim the
lock scope to the write set (participant/alliance/reply/log-share
validation moves outside the row lock — accepts a TOCTOU window on
membership revocation mid-send), reduce in-lock round trips (single
compound query), or raise the interactive-transaction timeout as a
stopgap (worsens tail latency under contention). Production-path
(Supabase via Hyperdrive) numbers from the manual rehearsal exercise
remain the other half of the posture decision — staging-path failure does
not automatically condemn the production path, but "expand" requires both
to pass.

**Fix attempt 1 (2026-10-19, same day): send-path lock trimmed — locks fixed,
memory ceiling now dominant.** `sendMessage`/`sendMessageRealtime` validation
moved outside the room lock; the locked section is now participant-recheck +
insert + room bump (+ ACL grants) with a 15 s interactive timeout
(master's recheck-vs-removal invariants unchanged, still pinned by
`chatRoomGuards.test.ts`). Ladder re-run on the same fixtures:

| Rung | Before fix | After fix |
| --- | --- | --- |
| 5 | 45/100 broadcasts, 11 expired-transaction errors | **95/100 broadcasts, 1 error, zero transaction expiries** (RTT p50/p95 ~8.9/11.5 s — staging-path latency) |
| 20 | 0/80 | 0/80, 20 errors — request isolates die first |
| 50 | 0/200, 28 exceededMemory | 0/200, **64 exceededMemory** |

Attribution of the remaining failure: `wrangler tail` shows the memory
events on **stateless (HTTP request) isolates** with low CPU (~0.2–0.4 s) —
and `src/lib/prisma.ts:87-94` deliberately constructs **one PrismaClient +
PrismaPg adapter per request** (workerd binds each socket to its opening
request; a shared pooled client errors 1101 or hangs under concurrency).
Each per-request client instantiates the Prisma 7 query-compiler engine;
~20 concurrent DB-touching requests in one isolate exceed the 128 MiB
worker limit. The lock fix is correct and necessary (rung 5 proves it) but
not sufficient: **the pilot's next blocker is per-request Prisma client
memory**, and solving it means either per-isolate client reuse that
respects workerd's socket-to-request binding (e.g. request-pinned
connections against Hyperdrive's own pooling) or capping concurrent
DB-bound work per isolate. That investigation is tracked as the follow-up
to this STOP verdict.

**Fix attempt 2 (2026-10-19): pool cap + instrumentation — engines dominate,
not pools.** Per-request pg pool `max` cut 5→2 and a preview-only
`PRISMA_MEM_DEBUG` var logs a per-isolate client counter at every creation
(workerd stubs `process.memoryUsage()`, so counts are the only in-runtime
signal; the platform's `Worker exceeded memory limit` events remain the
memory telemetry). Ladder re-run: **memory events persisted (120)** and
rungs 20/50 still delivered nothing; rung 5 regressed run-to-run (20/100 —
isolate-placement variance: the tail shows the rung's requests landed in
fewer isolates). Conclusion: the per-request Prisma 7 query-compiler
ENGINE is the memory floor — roughly N-concurrent-requests × engine-size
against a 128 MiB isolate ceiling regardless of pool sizing. The fix that
remains: bound CONCURRENT per-request clients per isolate. Two viable
shapes, in preference order: (a) a per-isolate creation semaphore with
request-idle release semantics (release needs OpenNext
`getCloudflareContext().ctx.waitUntil`-scheduled idle checks — there is no
request-end hook), spilling excess concurrency to other isolates via the
platform's load balancing; (b) per-isolate client reuse, which requires
solving workerd's socket-to-request binding (the 2026-10-15 1101/hang
incident, prisma.ts:87-94) — e.g. connections pinned per request inside a
shared engine, if the adapter layer can support it. This is a focused
design task with deadlock/stall testing against the exact failure mode the
pg timeouts were built to prevent; it must not be rushed in at the tail of
a session.

**Fix 3 (2026-11-11): one Prisma client per isolate.** The per-client cost
is the `QueryCompiler`: Prisma 7 shares the WASM module per isolate but
compiles the full schema into a new compiler (plus a 1000-entry plan cache)
for every `PrismaClient`, and per-request clients were never disconnected.
`src/lib/prismaRequestAdapter.ts` now gives the isolate one client whose
driver adapter forwards each call to a pg adapter owned by the calling
request (looked up from the OpenNext request context), so sockets still
never cross requests (`src/lib/prismaRequestAdapter.test.ts`). Same-shape
`findUnique` calls from two requests in one tick may share a batched query;
workerd delivers that result across requests while both are awaiting it.
Measured on the production-connected rehearsal, `/battle/users` (DB-backed
SSR), 30 s per rung with `scripts/loadtest-preview.ts`, sampled tail:

| Rung | Before (per-request clients) | After (one client per isolate) |
| --- | --- | --- |
| c=20 | 579 requests, 0.52% errors, p50/p95 1030/2256 ms | 3849 requests, 0.08% errors, p50/p95 102/235 ms |
| c=50 | 1068 requests, 0.75% errors, p50/p95 1426/2555 ms | 9472 requests, 0.07% errors, p50/p95 140/314 ms |
| Tail | `exceededMemory` events | none |

The remaining errors are 15 s harness timeouts at the same absolute count as
before. The chat send ladder (§8.3) has not been re-run on this fix; it needs
the staging preview, whose database path is blocker 1 in
[migration gates](migration-gates.md#7-known-open-blockers).

### 8.1 What to measure, with which harness

| Dimension | HTTP harness (`scripts/loadtest-preview.ts`, docs/database-reliability.md) | WS harness (`scripts/loadtest-chat.ts`) |
| --- | --- | --- |
| Latency | p50/p95/p99/max time-to-headers on GET routes | p50/p95/p99/max send→`receiveMessage` RTT (persist + broadcast) |
| Throughput | requests/s per route at fixed concurrency | messages/s per connection and total broadcasts delivered |
| Correctness under load | error rate > 1% fails | fanout: every connection must see every sent tempId; any `messageError` fails |
| Cost signals | requests count against the Worker's request budget | DO: GB-s (duration billed while awake), websocket writes, subrequests (2 per message: send endpoint + mailbox notifies); plus the same Postgres rows as HTTP sends |

Run matrix (each 3× at min, off-peak, same room/participants):

1. HTTP baseline: `bun scripts/loadtest-preview.ts --duration-seconds 120
   --concurrency 20 --routes /,/api/config` (unchanged harness).
2. WS pilot: `bun scripts/loadtest-chat.ts --room <id> --tickets t.txt
   --concurrency {5,20,50} --messages-per-conn 10 --send-interval-ms 1000`.
3. Mixed: WS run while the HTTP harness runs (does chat traffic degrade
   page loads? does the shared Hyperdrive pool saturate?).

### 8.2 Running the WS harness

Tickets expire 60 s after minting, so mint and run back-to-back (scripted):

```bash
# 1. Mint one ticket per seeded test user (each must be a room participant):
while read -r uid cookie; do
  curl -s -X POST "$BASE/api/realtime/ticket" \
    -H 'content-type: application/json' -H "cookie: $cookie" \
    -d '{"roomId": 42}' | jq -r .ticket
done < users.txt > tickets.txt

# 2. Immediately:
bun scripts/loadtest-chat.ts --base-url "$BASE" --room 42 \
    --tickets tickets.txt --concurrency 20 --messages-per-conn 10
```

Against `bunx wrangler dev` locally (after `bun run cloudflare:build`; needs
`.dev.vars` with `TASK_SECRET`/`JWT_SECRET` and the Hyperdrive
`localConnectionString` database): same commands with
`--base-url http://127.0.0.1:8787`. Fewer tickets than connections is
allowed (they round-robin) but shares each user's 10 sends/10 s budget —
raise `--send-interval-ms` accordingly. **Pending-preview-deploy**: exact
wrangler dev behavior of the DO binding under the compatibility date.

### 8.3 Decision thresholds (expand or stop)

- **Stop/fix first** if: fanout shortfall appears at any concurrency (a
  dropped broadcast is a correctness bug, not a perf issue); any
  `messageError` rate-limit at 10 msg/min per user; p99 send RTT > 2× the
  HTTP `POST`-equivalent (measured as p99 of `/api/messages` room fetch) at
  concurrency 20; WS runs degrade the HTTP harness's p95 by > 25%.
- **Expand cautiously** (wave 2: reactions, more rooms per user) if: fanout
  correct at concurrency 50; p95 RTT < 500 ms at concurrency 20; no Worker
  CPU-limit (exceeded-CPU) errors in `wrangler tail` during runs; estimated
  DO duration cost (from the dashboard's Durable Objects metrics) is within
  the pilot budget agreed in ops review.
- **Cost comparison verdict** (DO path vs a hypothetical always-on
  WebSocket server): compare DO GB-s + subrequest counts vs the ~idle cost
  of the hibernation choice (should be ~zero for idle rooms); record both
  in this doc after the preview runs. **Pending-preview-deploy.**

### 7.14 Server-side first-message notifications (2026-10-30)

`POST /api/messages` with a first message now raises the recipient's unread
badge in `do` mode. `emitToUser`/`emitToUsers` in `src/lib/realtime.ts`
resolve the `CHAT_ROOM_DO` binding with OpenNext's `getCloudflareContext`
and POST the event to each recipient's `user:<id>` mailbox `/notify`
(`USER_MAILBOX_NOTIFY_URL`, `src/lib/realtimeTransport.ts`). Only mailbox
events are sent; a 404 (the user never opened a mailbox) is ignored, and
failures are logged and never break the request. The route's guard is
`isUserPushEnabled()` (Socket.IO enabled or `do` transport). Socket.IO
deployments are unchanged.

Verified on the preview (worker version `704c8a42`): with test users 925 and
926 in separate browser contexts, 926 started a conversation over HTTP and
925's mailbox socket received `newMessageNotification` about 2.3 s after the
request began. The overview chat icon showed the unread badge without a
reload. The previous version (`8de5856b`) delivered nothing for the same
request.
