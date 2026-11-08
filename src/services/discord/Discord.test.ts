import { createHash, generateKeyPairSync, sign } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { DiscordApiError } = await import('@/services/discord/DiscordApi');
const {
  deliveryTime,
  enqueueDiscordAlert,
  enqueueStaminaFullAlerts,
  processDiscordOutboxOne,
} = await import('@/services/discord/DiscordAlerts.service');
const { runDiscordCommand } =
  await import('@/services/discord/DiscordCommands.service');
const { default: interactions, verifyDiscordSignature } =
  await import('@/pages/api/discord/interactions');
const { canAutoRecruit } = await import('@/services/AutoRecruitAccess.service');
const { resetRuntimeConfigCache } =
  await import('@/services/RuntimeConfig.service');

const DAY = 86_400_000;
const future = () => new Date(Date.now() + 10 * DAY);

beforeEach(() => {
  process.env.DISCORD_BOT_TOKEN = 'synthetic-bot-token';
  mockPrisma.supporterMembership = { findUnique: vi.fn(async () => null) };
  mockPrisma.alliance_memberships = { findFirst: vi.fn(async () => null) };
  mockPrisma.discordOutbox = {
    createMany: vi.fn(async () => ({ count: 1 })),
    update: vi.fn(async () => ({})),
  };
  mockPrisma.discordLink = {
    findUnique: vi.fn(async () => ({
      discordUserId: 'd1',
      notifyPrefs: { attacks: true, wars: true, dailyDigest: true },
      user: { locale: 'en' },
    })),
  };
});
afterEach(() => {
  delete process.env.DISCORD_BOT_TOKEN;
  delete process.env.DISCORD_PUBLIC_KEY;
});

const alert = (kind: any) => ({
  userId: 5,
  kind,
  eventKey: `test:${kind}`,
  text: 'alert.attacks',
  vars: {
    attacker: 'Raider',
    kingdom: 'Home',
    outcome: { key: 'alert.attackWon' },
    url: 'u',
  },
});

describe('enqueueDiscordAlert', () => {
  it('queues instant alerts for supporters, in their language', async () => {
    mockPrisma.supporterMembership.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      currentPeriodEnd: future(),
    });
    expect(await enqueueDiscordAlert(mockPrisma, alert('attacks'))).toBe(true);
    const row = mockPrisma.discordOutbox.createMany.mock.calls[0][0];
    expect(row.skipDuplicates).toBe(true);
    expect(row.data[0]).toMatchObject({
      eventKey: 'test:attacks',
      discordUserId: 'd1',
    });
    expect(row.data[0].content).toContain('Your defenses held.');
  });

  it('refuses instant alerts to non-supporters but sends them the digest', async () => {
    expect(await enqueueDiscordAlert(mockPrisma, alert('attacks'))).toBe(false);
    expect(await enqueueDiscordAlert(mockPrisma, alert('dailyDigest'))).toBe(
      true,
    );
  });

  it('gives premium alliance members war alerts only', async () => {
    mockPrisma.alliance_memberships.findFirst.mockResolvedValue({ id: 1 });
    expect(await enqueueDiscordAlert(mockPrisma, alert('wars'))).toBe(true);
    expect(await enqueueDiscordAlert(mockPrisma, alert('attacks'))).toBe(false);
  });

  it('does nothing without a bot token, a link or the preference', async () => {
    mockPrisma.supporterMembership.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      currentPeriodEnd: future(),
    });
    expect(await enqueueDiscordAlert(mockPrisma, alert('spyHits'))).toBe(false);
    mockPrisma.discordLink.findUnique.mockResolvedValue(null);
    expect(await enqueueDiscordAlert(mockPrisma, alert('attacks'))).toBe(false);
    delete process.env.DISCORD_BOT_TOKEN;
    mockPrisma.discordLink.findUnique.mockClear();
    expect(await enqueueDiscordAlert(mockPrisma, alert('attacks'))).toBe(false);
    expect(mockPrisma.discordLink.findUnique).not.toHaveBeenCalled();
  });
});

describe('deliveryTime', () => {
  const at = (hour: number) => new Date(Date.UTC(2026, 0, 1, hour, 30));
  it('sends outside quiet hours at once', () => {
    const now = at(12);
    expect(deliveryTime({ quietHoursStart: 22, quietHoursEnd: 7 }, now)).toBe(
      now,
    );
    expect(deliveryTime({}, now)).toBe(now);
  });
  it('holds messages until quiet hours end, across midnight', () => {
    expect(
      deliveryTime({ quietHoursStart: 22, quietHoursEnd: 7 }, at(23)),
    ).toEqual(new Date(Date.UTC(2026, 0, 2, 7)));
    expect(
      deliveryTime({ quietHoursStart: 1, quietHoursEnd: 5 }, at(3)),
    ).toEqual(new Date(Date.UTC(2026, 0, 1, 5)));
  });
});

describe('processDiscordOutboxOne', () => {
  const claim = (attempts = 1) => {
    mockPrisma.$queryRaw = vi.fn(async () => [
      {
        id: 9,
        userId: 5,
        discordUserId: 'd1',
        kind: 'attacks',
        content: 'hi',
        attempts,
      },
    ]);
  };
  const status = () => mockPrisma.discordOutbox.update.mock.calls.at(-1)[0];

  it('sends and marks the row sent', async () => {
    claim();
    const send = vi.fn(async () => {});
    expect(await processDiscordOutboxOne(send)).toBe('SENT');
    expect(send).toHaveBeenCalledWith('d1', 'hi');
    expect(status().data.status).toBe('SENT');
  });

  it('skips rows for players who unlinked or relinked', async () => {
    claim();
    mockPrisma.discordLink.findUnique.mockResolvedValue({
      discordUserId: 'other',
    });
    const send = vi.fn();
    expect(await processDiscordOutboxOne(send)).toBe('SKIPPED');
    expect(send).not.toHaveBeenCalled();
  });

  it('skips players who block DMs and reschedules rate limits', async () => {
    claim();
    expect(
      await processDiscordOutboxOne(async () => {
        throw new DiscordApiError(403, 50007, null);
      }),
    ).toBe('SKIPPED');
    claim(3);
    expect(
      await processDiscordOutboxOne(async () => {
        throw new DiscordApiError(429, null, 2000);
      }),
    ).toBe('PENDING');
    expect(status().data.attempts).toBe(2);
    expect(status().data.nextAttemptAt.getTime()).toBeLessThan(
      Date.now() + 2500,
    );
  });

  it('gives up after five failed attempts', async () => {
    claim(5);
    expect(
      await processDiscordOutboxOne(async () => {
        throw new DiscordApiError(500, null, null);
      }),
    ).toBe('FAILED');
  });

  it('rechecks preferences and quiet hours at send time', async () => {
    claim();
    mockPrisma.discordLink.findUnique.mockResolvedValue({
      discordUserId: 'd1',
      notifyPrefs: { attacks: false },
    });
    const send = vi.fn();
    expect(await processDiscordOutboxOne(send)).toBe('SKIPPED');
    const hour = new Date().getUTCHours();
    mockPrisma.discordLink.findUnique.mockResolvedValue({
      discordUserId: 'd1',
      notifyPrefs: {
        attacks: true,
        quietHoursStart: hour,
        quietHoursEnd: (hour + 2) % 24,
      },
    });
    claim(2);
    expect(await processDiscordOutboxOne(send)).toBe('PENDING');
    expect(status().data.attempts).toBe(1);
    expect(status().data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(send).not.toHaveBeenCalled();
  });

  it('returns null when nothing is due', async () => {
    mockPrisma.$queryRaw = vi.fn(async () => []);
    expect(await processDiscordOutboxOne(vi.fn())).toBeNull();
  });
});

describe('/link', () => {
  const code = 'ABC123DEF456';
  const codeHash = createHash('sha256').update(code).digest('hex');
  let codeRow: any;
  beforeEach(() => {
    codeRow = {
      id: 1,
      userId: 5,
      codeHash,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    mockPrisma.discordLinkCode = {
      findUnique: vi.fn(async ({ where }: any) =>
        where.codeHash === codeHash ? codeRow : null,
      ),
      updateMany: vi.fn(async () => ({ count: 1 })),
    };
    mockPrisma.discordLink = {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
    };
    mockPrisma.users.findUnique = vi.fn(async () => ({ display_name: 'Home' }));
    mockPrisma.$transaction.mockImplementation(async (fn: any) =>
      fn(mockPrisma),
    );
  });
  const run = (value: string) =>
    runDiscordCommand('link', {
      discordUserId: 'd1',
      discordUsername: 'tester',
      locale: 'en-US',
      options: { code: value },
    });

  it('links the Discord user to the code owner, case-insensitively', async () => {
    expect(await run(` ${code.toLowerCase()} `)).toContain('Linked to Home');
    expect(mockPrisma.discordLink.upsert.mock.calls[0][0]).toMatchObject({
      where: { userId: 5 },
      create: { userId: 5, discordUserId: 'd1', discordUsername: 'tester' },
    });
  });

  it('refuses expired, used and unknown codes', async () => {
    codeRow.expiresAt = new Date(Date.now() - 1);
    expect(await run(code)).toContain('invalid or has expired');
    codeRow.expiresAt = new Date(Date.now() + 60_000);
    mockPrisma.discordLinkCode.updateMany.mockResolvedValue({ count: 0 });
    expect(await run(code)).toContain('invalid or has expired');
    expect(await run('WRONG')).toContain('invalid or has expired');
    expect(mockPrisma.discordLink.upsert).not.toHaveBeenCalled();
  });

  it('refuses a Discord account linked to another kingdom', async () => {
    mockPrisma.discordLink.findUnique.mockResolvedValue({ userId: 99 });
    expect(await run(code)).toContain('already linked');
    expect(mockPrisma.discordLinkCode.updateMany).not.toHaveBeenCalled();
  });

  it('asks unlinked players to link before private commands', async () => {
    expect(
      await runDiscordCommand('fort', {
        discordUserId: 'd1',
        discordUsername: 'tester',
        locale: 'de',
        options: {},
      }),
    ).toContain('Verknüpfe zuerst');
  });
});

describe('interactions endpoint', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicHex = publicKey
    .export({ format: 'der', type: 'spki' })
    .subarray(-32)
    .toString('hex');
  const signed = (
    body: string,
    timestamp = String(Math.floor(Date.now() / 1000)),
  ) => ({
    timestamp,
    signature: sign(null, Buffer.from(timestamp + body), privateKey).toString(
      'hex',
    ),
  });
  const call = async (body: string, headers: Record<string, string>) => {
    const req: any = (async function* () {
      yield Buffer.from(body);
    })();
    req.method = 'POST';
    req.headers = headers;
    const res: any = { status: vi.fn(() => res), json: vi.fn(() => res) };
    await interactions(req, res);
    return res;
  };

  it('verifies Discord signatures and refuses stale or forged ones', () => {
    const body = Buffer.from('{"type":1}');
    const ok = signed(body.toString());
    expect(
      verifyDiscordSignature(publicHex, ok.signature, ok.timestamp, body),
    ).toBe(true);
    expect(
      verifyDiscordSignature(
        publicHex,
        ok.signature,
        ok.timestamp,
        Buffer.from('{"type":2}'),
      ),
    ).toBe(false);
    const old = signed(
      body.toString(),
      String(Math.floor(Date.now() / 1000) - 600),
    );
    expect(
      verifyDiscordSignature(publicHex, old.signature, old.timestamp, body),
    ).toBe(false);
  });

  it('answers PING, rejects bad signatures and hides when unconfigured', async () => {
    const body = '{"type":1}';
    const ok = signed(body);
    expect((await call(body, {})).status).toHaveBeenCalledWith(404);
    process.env.DISCORD_PUBLIC_KEY = publicHex;
    const res = await call(body, {
      'x-signature-ed25519': ok.signature,
      'x-signature-timestamp': ok.timestamp,
    });
    expect(res.json).toHaveBeenCalledWith({ type: 1 });
    const bad = await call(body, {
      'x-signature-ed25519': '0'.repeat(128),
      'x-signature-timestamp': ok.timestamp,
    });
    expect(bad.status).toHaveBeenCalledWith(401);
  });

  it('replies to commands privately without pinging anyone', async () => {
    process.env.DISCORD_PUBLIC_KEY = publicHex;
    mockPrisma.discordLink = { findUnique: vi.fn(async () => null) };
    const body = JSON.stringify({
      type: 2,
      locale: 'es-ES',
      data: { name: 'war' },
      user: { id: 'd1', username: 'tester' },
    });
    const ok = signed(body);
    const res = await call(body, {
      'x-signature-ed25519': ok.signature,
      'x-signature-timestamp': ok.timestamp,
    });
    const reply = res.json.mock.calls[0][0];
    expect(reply.type).toBe(4);
    expect(reply.data.flags).toBe(64);
    expect(reply.data.allowed_mentions).toEqual({ parse: [] });
    expect(reply.data.content).toContain('Primero vincula');
  });
});

describe('canAutoRecruit', () => {
  it('is a supporter perk while the supporter feature is on', async () => {
    mockPrisma.serverSetting.findMany.mockResolvedValue([
      { key: 'ENABLE_SUPPORTER', value: true },
    ]);
    resetRuntimeConfigCache();
    expect(await canAutoRecruit(0)).toBe(false);
    expect(await canAutoRecruit(5)).toBe(false);
    mockPrisma.supporterMembership.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      currentPeriodEnd: future(),
    });
    expect(await canAutoRecruit(5)).toBe(true);
    mockPrisma.serverSetting.findMany.mockResolvedValue([]);
    resetRuntimeConfigCache();
  });
});

describe('stamina full alerts', () => {
  const MIN = 60_000;
  beforeEach(() => {
    mockPrisma.supporterMembership.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      currentPeriodEnd: future(),
    });
    mockPrisma.discordLink.findMany = vi.fn(async () => [
      { userId: 5, notifyPrefs: { turnCap: true } },
    ]);
    mockPrisma.discordLink.findUnique.mockResolvedValue({
      discordUserId: 'd1',
      notifyPrefs: { turnCap: true },
      user: { locale: 'en' },
    });
  });

  it('queues the DM for the moment stamina will be full', async () => {
    const updated = new Date(Date.now() - 5 * MIN);
    mockPrisma.users.findUnique = vi.fn(async () => ({
      display_name: 'Home',
      stamina: 80,
      maxStamina: 100,
      staminaUpdatedAt: updated,
    }));
    expect(await enqueueStaminaFullAlerts()).toBe(1);
    const row = mockPrisma.discordOutbox.createMany.mock.calls[0][0].data[0];
    // 20 missing at 5 per 10 minutes: 4 intervals after the last update.
    expect(row.nextAttemptAt.getTime()).toBe(updated.getTime() + 40 * MIN);
    expect(row.eventKey).toBe(`stamina:5:${updated.getTime()}`);
  });

  it('drops a queued alert when the stamina was spent in the meantime', async () => {
    mockPrisma.$queryRaw = vi.fn(async () => [
      {
        id: 9,
        userId: 5,
        discordUserId: 'd1',
        kind: 'turnCap',
        content: 'full',
        attempts: 1,
      },
    ]);
    mockPrisma.users.findUnique = vi.fn(async () => ({
      stamina: 40,
      maxStamina: 100,
      staminaUpdatedAt: new Date(),
    }));
    const send = vi.fn();
    expect(await processDiscordOutboxOne(send)).toBe('SKIPPED');
    expect(send).not.toHaveBeenCalled();
  });
});
