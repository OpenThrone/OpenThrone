import { describe, expect, it } from 'bun:test';

import { searchPlayersByName } from '@/components/alliance/playerSearch';
import { resolveAvatarSrc } from '@/utils/utilities';

const respond = (status: number, body: unknown) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('searchPlayersByName', () => {
  it('treats the API 404 (no player matches) as an empty result', async () => {
    await expect(
      searchPlayersByName('zzqqxx', respond(404, { error: 'No users found' })),
    ).resolves.toEqual([]);
  });

  it('throws on a real failure so callers can log it', async () => {
    await expect(
      searchPlayersByName('Gate', respond(500, { error: 'boom' })),
    ).rejects.toThrow('500');
  });

  it('resolves the SHIELD sentinel to the race shield, never a relative URL', async () => {
    const [match] = await searchPlayersByName(
      'Gate',
      respond(200, [
        {
          id: 7,
          display_name: 'Gate Goblin',
          avatar: 'SHIELD',
          race: 'GOBLIN',
        },
      ]),
    );
    expect(match.id).toBe(7);
    expect(match.displayName).toBe('Gate Goblin');
    expect(match.avatarSrc).not.toBe('SHIELD');
    expect(match.avatarSrc).toBe(resolveAvatarSrc('SHIELD', 'GOBLIN'));
    expect(match.avatarSrc?.startsWith('SHIELD')).toBe(false);
  });

  it('skips the request for a blank term', async () => {
    let called = false;
    const result = await searchPlayersByName('   ', async () => {
      called = true;
      return { ok: true, status: 200, json: async () => [] };
    });
    expect(result).toEqual([]);
    expect(called).toBe(false);
  });
});
