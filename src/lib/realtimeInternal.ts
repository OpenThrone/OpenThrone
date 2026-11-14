/**
 * Server-side helpers shared by the internal /api/realtime/* endpoints of the
 * Durable Objects realtime pilot (#23).
 *
 * These run inside the Next/OpenNext runtime (Node or workerd with
 * nodejs_compat) — never inside the Durable Object — so they may use the same
 * imports as every other API route. The DO reaches them only through the
 * WORKER_SELF_REFERENCE service binding with the raw TASK_SECRET
 * Authorization header, the same contract as the cron endpoints
 * (docs/operations.md).
 */

import { timingSafeEqual } from 'crypto';

import { safeToISOString } from '@/utils/dateHelpers';

/**
 * Raw-secret Authorization check, identical in shape to the cron endpoints'
 * `isAuthorizedTaskRequest` (`src/pages/api/cronJobs/turns.ts:15-33`): the
 * header must equal TASK_SECRET with no Bearer prefix, compared in constant
 * time. Unlike the cron endpoints there is no enable flag — the pilot's gate
 * is the NEXT_PUBLIC_REALTIME_TRANSPORT build flag on the client side, and a
 * missing secret simply refuses every call.
 */
export const isAuthorizedTaskRequest = (
  authorizationHeader: string | undefined,
): boolean => {
  const taskSecret = process.env.TASK_SECRET;
  if (!taskSecret || !authorizationHeader) return false;

  const provided = Buffer.from(authorizationHeader);
  const expected = Buffer.from(taskSecret);
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(provided, expected);
};

/**
 * BigInt/Date-safe serialization for payloads that cross the websocket,
 * mirroring the Socket.IO server's `serializeData` (`src/lib/socket.ts:127-137`)
 * so a `receiveMessage` frame delivered by the DO is byte-compatible with one
 * delivered by Socket.IO: bigints become strings, Dates become ISO strings.
 * Duplicated here on purpose — importing '@/lib/socket' would drag the
 * socket.io server into the Workers bundle.
 */
export const serializeRealtimePayload = (data: unknown): unknown =>
  JSON.parse(
    JSON.stringify(data, (_key, value) => {
      if (typeof value === 'bigint') return value.toString();
      if (value instanceof Date) {
        return safeToISOString(value);
      }
      return value;
    }),
  );

/** True when the value is a plain JSON object (the wire shape endpoints return). */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
