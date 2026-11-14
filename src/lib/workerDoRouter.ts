/**
 * /do/* routing for the Cloudflare Worker entry (`worker.ts`) — issue #23.
 *
 * Requests whose path addresses a Durable Object (`/do/chat/<roomId>`,
 * `/do/user/<userId>`) are handed to the `CHAT_ROOM_DO` namespace via
 * `idFromName` (deterministic: one DO instance per room / per user mailbox);
 * everything else falls through to the OpenNext handler unchanged.
 *
 * Extracted like `src/lib/workerCron.ts` so the routing is unit-testable
 * without a real binding (`src/lib/__tests__/workerDoRouter.test.ts`) and so
 * `worker.ts` stays a thin delegate. Zero imports: this module is bundled by
 * wrangler's esbuild, which does not resolve the Next `@/` path aliases.
 */

/** Subset of a DurableObjectNamespace binding the router uses. */
export interface DoNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch: (request: Request) => Promise<Response> };
}

/** Subset of the Worker env the DO routing reads. */
export interface DoWorkerEnv {
  CHAT_ROOM_DO?: DoNamespaceLike;
}

/** Parsed target of a /do/* request. */
export type DoRoute =
  | { kind: 'chat'; roomId: number; objectName: string }
  | { kind: 'user'; userId: number; objectName: string };

/** Stable DO-name scheme; ChatRoomDO asserts it against its stored identity. */
export const chatRoomDoName = (roomId: number): string => `room:${roomId}`;
export const userMailboxDoName = (userId: number): string => `user:${userId}`;

/**
 * Parses a /do/* pathname into a routing target, or null when the path does
 * not address a DO (malformed id, trailing junk, unknown kind). Query string
 * is not part of the match — the ticket travels in it and is preserved by
 * passing the original request through untouched.
 */
export const parseDoRoute = (pathname: string): DoRoute | null => {
  const chatMatch = /^\/do\/chat\/(\d+)\/?$/.exec(pathname);
  if (chatMatch) {
    const roomId = Number(chatMatch[1]);
    if (Number.isSafeInteger(roomId) && roomId > 0) {
      return { kind: 'chat', roomId, objectName: chatRoomDoName(roomId) };
    }
    return null;
  }
  const userMatch = /^\/do\/user\/(\d+)\/?$/.exec(pathname);
  if (userMatch) {
    const userId = Number(userMatch[1]);
    if (Number.isSafeInteger(userId) && userId > 0) {
      return { kind: 'user', userId, objectName: userMailboxDoName(userId) };
    }
    return null;
  }
  return null;
};

/**
 * Routes a request to its Durable Object, or returns null when the request is
 * not a /do/* request (the caller continues to the OpenNext handler).
 * Misconfigured bindings and malformed /do/* paths are answered directly so
 * they never leak into the Next app.
 */
export const routeDurableObjectRequest = async (
  request: Request,
  env: DoWorkerEnv,
): Promise<Response | null> => {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith('/do/')) return null;

  const namespace = env.CHAT_ROOM_DO;
  if (!namespace) {
    return Response.json(
      { error: 'Durable Objects are not configured on this worker' },
      { status: 501 },
    );
  }

  const route = parseDoRoute(pathname);
  if (!route) {
    return Response.json(
      { error: 'Unknown Durable Object route' },
      { status: 404 },
    );
  }

  const stub = namespace.get(namespace.idFromName(route.objectName));
  return stub.fetch(request);
};
