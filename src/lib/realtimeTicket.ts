/**
 * Short-lived signed tickets for the Durable Objects realtime pilot (#23).
 *
 * The worker entry (`worker.ts` → `ChatRoomDO`) cannot reach the NextAuth
 * session machinery that authorizes the Socket.IO handshake
 * (`src/lib/socket.ts:227-300`): anything imported by `worker.ts` is bundled
 * by wrangler's esbuild, which — per the constraint encoded in
 * `src/lib/workerCron.ts` — must stay free of `@/` path aliases and therefore
 * of the whole Next/Prisma import graph. So the pilot inverts the flow: the
 * authenticated API route `/api/realtime/ticket` (standard `withAuth` session)
 * runs the join-authorization checks and hands the browser a ticket binding
 * `{ userId, roomId }`, and the DO only needs to verify the ticket's HMAC
 * signature, expiry, and room/user scope at connect time.
 *
 * This module is the shared vocabulary: it is imported by the API route via
 * `@/lib/realtimeTicket` and by the DO via a relative import, so it must stay
 * dependency-free (WebCrypto + base64 only, no imports at all). WebCrypto is
 * available in workerd, Bun, and Node 18+ alike, so the same code signs on the
 * route side and verifies on the DO side, and bun tests exercise it directly.
 *
 * Ticket format: `v1.<base64url(payload JSON)>.<base64url(HMAC-SHA256)>` where
 * the HMAC is computed over the literal `v1.<payload>` string. Comparable in
 * spirit to the NextAuth JWT the Socket.IO handshake verifies (same secret,
 * `JWT_SECRET`), but single-purpose, room-scoped, and 60 s lived.
 */

/** Current ticket version; verifiers reject any other value. */
export const REALTIME_TICKET_VERSION = 1;

/** Tickets are deliberately short-lived; they are minted per connection. */
export const REALTIME_TICKET_TTL_MS = 60_000;

/** Claims carried by a realtime ticket. */
export interface RealtimeTicketClaims {
  /** Format version, must equal REALTIME_TICKET_VERSION. */
  v: number;
  /** Verified user id (`sub` in JWT terms). */
  userId: number;
  /**
   * Room the ticket may open, or `null` for the user's personal mailbox
   * channel (`/do/user/<id>`, the pilot's analogue of the `user-<id>` room).
   */
  roomId: number | null;
  /** Expiry, epoch milliseconds. */
  exp: number;
  /** Random id, so distinct mints of identical claims differ on the wire. */
  jti: string;
}

export type RealtimeTicketSuccess = {
  ok: true;
  userId: number;
  roomId: number | null;
};

export type RealtimeTicketFailure = {
  ok: false;
  reason:
    | 'malformed'
    | 'bad-signature'
    | 'expired'
    | 'wrong-version'
    | 'wrong-room'
    | 'wrong-user';
};

export type RealtimeTicketResult =
  | RealtimeTicketSuccess
  | RealtimeTicketFailure;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const fromBase64Url = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const withPadding = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(withPadding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

/** Constant-time equality over equal-length byte strings. */
const timingSafeBytesEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    // XOR-accumulate; the bitwise form is the canonical timing-safe compare.
    // eslint-disable-next-line no-bitwise
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0;
};

const importHmacKey = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

const hmac = async (secret: string, message: string): Promise<Uint8Array> => {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message),
  );
  return new Uint8Array(signature);
};

const randomTicketId = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
};

/**
 * Mints a ticket for `userId` to open `roomId` (or their personal channel
 * when `roomId` is null). The caller must have already authorized the join —
 * this function only signs what it is given.
 */
export const signRealtimeTicket = async (
  secret: string,
  claims: { userId: number; roomId: number | null },
  now: () => number = Date.now,
): Promise<string> => {
  const payload: RealtimeTicketClaims = {
    v: REALTIME_TICKET_VERSION,
    userId: claims.userId,
    roomId: claims.roomId,
    exp: now() + REALTIME_TICKET_TTL_MS,
    jti: randomTicketId(),
  };
  const payloadPart = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signedPart = toBase64Url(await hmac(secret, `v1.${payloadPart}`));
  return `v1.${payloadPart}.${signedPart}`;
};

/**
 * Verifies a ticket against `expected`:
 * - `expectedRoomId` (number): the ticket must carry exactly this room.
 * - `expectedRoomId: null`: the ticket must be a personal-channel ticket and
 *   `expectedUserId` must match its subject (used by `/do/user/<id>`).
 * Expiry is always checked.
 */
export const verifyRealtimeTicket = async (
  secret: string,
  ticket: string,
  expected: { expectedRoomId: number | null; expectedUserId?: number },
  now: () => number = Date.now,
): Promise<RealtimeTicketResult> => {
  const parts = ticket.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1' || !parts[1] || !parts[2]) {
    return { ok: false, reason: 'malformed' };
  }
  const [version, payloadPart, signedPart] = parts as [string, string, string];

  let claims: RealtimeTicketClaims;
  try {
    const parsed: unknown = JSON.parse(
      decoder.decode(fromBase64Url(payloadPart)),
    );
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, reason: 'malformed' };
    }
    claims = parsed as RealtimeTicketClaims;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  let receivedSignature: Uint8Array;
  try {
    receivedSignature = fromBase64Url(signedPart);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const expectedSignature = await hmac(secret, `${version}.${payloadPart}`);
  if (!timingSafeBytesEqual(expectedSignature, receivedSignature)) {
    return { ok: false, reason: 'bad-signature' };
  }

  if (claims.v !== REALTIME_TICKET_VERSION) {
    return { ok: false, reason: 'wrong-version' };
  }
  if (
    typeof claims.exp !== 'number' ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= now()
  ) {
    return { ok: false, reason: 'expired' };
  }
  if (!Number.isSafeInteger(claims.userId) || claims.userId <= 0) {
    return { ok: false, reason: 'malformed' };
  }
  if (claims.roomId !== null && !Number.isSafeInteger(claims.roomId)) {
    return { ok: false, reason: 'malformed' };
  }

  if (expected.expectedRoomId === null) {
    if (claims.roomId !== null) {
      return { ok: false, reason: 'wrong-room' };
    }
    if (
      expected.expectedUserId !== undefined &&
      claims.userId !== expected.expectedUserId
    ) {
      return { ok: false, reason: 'wrong-user' };
    }
  } else if (claims.roomId !== expected.expectedRoomId) {
    return { ok: false, reason: 'wrong-room' };
  }

  return { ok: true, userId: claims.userId, roomId: claims.roomId };
};
