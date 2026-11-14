import { describe, expect, it, vi } from 'bun:test';

import {
  chatRoomDoName,
  type DoNamespaceLike,
  parseDoRoute,
  routeDurableObjectRequest,
  userMailboxDoName,
} from '@/lib/workerDoRouter';

const makeNamespace = (): DoNamespaceLike & {
  _ids: string[];
  _fetch: ReturnType<typeof vi.fn>;
} => {
  const ids: string[] = [];
  const fetchFn = vi.fn(async () => new Response('do ok'));
  return {
    _ids: ids,
    _fetch: fetchFn,
    idFromName: (name: string) => {
      ids.push(name);
      return `id:${name}`;
    },
    get: () => ({ fetch: fetchFn }),
  } as never;
};

const requestAt = (path: string): Request =>
  new Request(`https://worker.test${path}`);

describe('parseDoRoute', () => {
  it('maps chat and user paths to stable DO names', () => {
    expect(parseDoRoute('/do/chat/42')).toEqual({
      kind: 'chat',
      roomId: 42,
      objectName: chatRoomDoName(42),
    });
    expect(chatRoomDoName(42)).toBe('room:42');

    expect(parseDoRoute('/do/user/7')).toEqual({
      kind: 'user',
      userId: 7,
      objectName: userMailboxDoName(7),
    });
    expect(userMailboxDoName(7)).toBe('user:7');
  });

  it('rejects malformed, trailing, and non-positive ids', () => {
    for (const bad of [
      '/do/chat/abc',
      '/do/chat/0',
      '/do/chat/-1',
      '/do/chat/42/extra',
      '/do/user/7.5',
      '/do/other/7',
      '/do/chat',
      '/api/messages',
      '/',
    ]) {
      expect(parseDoRoute(bad)).toBeNull();
    }
  });
});

describe('routeDurableObjectRequest', () => {
  it('returns null for non-/do requests so they reach OpenNext', async () => {
    const namespace = makeNamespace();
    expect(
      await routeDurableObjectRequest(requestAt('/api/messages'), {
        CHAT_ROOM_DO: namespace,
      }),
    ).toBeNull();
    expect(
      await routeDurableObjectRequest(requestAt('/'), {
        CHAT_ROOM_DO: namespace,
      }),
    ).toBeNull();
    expect(namespace._ids).toHaveLength(0);
  });

  it('routes /do/chat/<id> to the room DO with the original request', async () => {
    const namespace = makeNamespace();
    const request = requestAt('/do/chat/42?ticket=v1.abc.def');

    const response = await routeDurableObjectRequest(request, {
      CHAT_ROOM_DO: namespace,
    });

    expect(namespace._ids).toEqual(['room:42']);
    expect(namespace._fetch).toHaveBeenCalledWith(request);
    expect(await response?.text()).toBe('do ok');
  });

  it('routes /do/user/<id> to the mailbox DO', async () => {
    const namespace = makeNamespace();
    await routeDurableObjectRequest(requestAt('/do/user/7'), {
      CHAT_ROOM_DO: namespace,
    });
    expect(namespace._ids).toEqual(['user:7']);
  });

  it('answers 404 for malformed /do paths without touching the namespace', async () => {
    const namespace = makeNamespace();
    const response = await routeDurableObjectRequest(
      requestAt('/do/chat/nope'),
      {
        CHAT_ROOM_DO: namespace,
      },
    );
    expect(response?.status).toBe(404);
    expect(namespace._fetch).not.toHaveBeenCalled();
  });

  it('answers 501 when the namespace binding is missing', async () => {
    const response = await routeDurableObjectRequest(
      requestAt('/do/chat/42'),
      {},
    );
    expect(response?.status).toBe(501);
  });
});
