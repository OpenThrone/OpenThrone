import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { enqueueBattleAlert } = await import('../BattleNotification.service');
const alert = {
  defenderId: 2,
  attackerName: '<b>Enemy</b>',
  attackLogId: 31,
  defenderWon: false,
};
let root: string | undefined;
beforeEach(() => {
  root = process.env.NEXT_PUBLIC_URL_ROOT;
  process.env.NEXT_PUBLIC_URL_ROOT = 'https://example.test';
  mockPrisma.emailPreference = {
    findUnique: vi.fn().mockResolvedValue({ attackNotificationEmails: true }),
  };
  mockPrisma.users.findUnique = vi.fn().mockResolvedValue({
    email: 'defender@example.test',
    display_name: '<img src=x>',
    locale: 'es-ES',
  });
  mockPrisma.emailOutbox = {
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
});
afterEach(() => {
  if (root === undefined) delete process.env.NEXT_PUBLIC_URL_ROOT;
  else process.env.NEXT_PUBLIC_URL_ROOT = root;
});
describe('battle notification enqueue', () => {
  it('queues a localized defender alert in the supplied transaction with a stable unique event key', async () => {
    await enqueueBattleAlert(mockPrisma, alert);
    expect(mockPrisma.emailPreference.findUnique).toHaveBeenCalledWith({
      where: { userId: 2 },
    });
    expect(mockPrisma.emailOutbox.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        expect.objectContaining({
          eventKey: 'battle-alert:31:2',
          userId: 2,
          toAddress: 'defender@example.test',
          locale: 'es-ES',
          category: 'ATTACK_NOTIFICATION',
          textBody: expect.stringContaining('Derrota'),
          htmlBody: expect.stringContaining('&lt;img src=x&gt;'),
        }),
      ],
    });
  });
  it('does not query addresses or enqueue for missing, disabled, or globally unsubscribed preferences', async () => {
    for (const pref of [
      null,
      { attackNotificationEmails: false },
      { attackNotificationEmails: true, unsubscribedAllAt: new Date() },
    ]) {
      mockPrisma.emailPreference.findUnique.mockResolvedValue(pref);
      await enqueueBattleAlert(mockPrisma, alert);
    }
    expect(mockPrisma.users.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.emailOutbox.createMany).not.toHaveBeenCalled();
  });
  it('skips missing, invalid, or anonymized recipients', async () => {
    for (const user of [
      null,
      { email: 'invalid' },
      { email: 'gone@deleted.local' },
    ]) {
      mockPrisma.users.findUnique.mockResolvedValue(user);
      await enqueueBattleAlert(mockPrisma, alert);
    }
    expect(mockPrisma.emailOutbox.createMany).not.toHaveBeenCalled();
  });
  it('propagates outbox failures so combat cannot commit without its queued alert', async () => {
    mockPrisma.emailOutbox.createMany.mockRejectedValue(
      new Error('Synthetic DB failure'),
    );
    await expect(enqueueBattleAlert(mockPrisma, alert)).rejects.toThrow(
      'Synthetic DB failure',
    );
  });
});
