import { beforeEach, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { AUDIT_IP_RETENTION_DAYS, deleteUserAvatarFiles, pruneAuditLogIps } =
  await import('@/services/PrivacyRetention.service');

beforeEach(() => {
  mockPrisma.auditLog = { updateMany: vi.fn(async () => ({ count: 3 })) };
});

it('blanks audit-log IPs older than the retention window and keeps the rows', async () => {
  const now = new Date('2026-10-29T00:00:00Z');
  expect(await pruneAuditLogIps(now)).toBe(3);
  const call = mockPrisma.auditLog.updateMany.mock.calls[0][0];
  expect(call.data).toEqual({ ip: '' });
  expect(call.where.NOT).toEqual({ ip: '' });
  expect(call.where.timestamp.lt.getTime()).toBe(
    now.getTime() - AUDIT_IP_RETENTION_DAYS * 86_400_000,
  );
});

it('reports zero instead of failing the daily job', async () => {
  mockPrisma.auditLog.updateMany.mockRejectedValue(new Error('db down'));
  expect(await pruneAuditLogIps()).toBe(0);
});

it('never turns a bad user id into a deletion path', async () => {
  for (const id of [0, -1, Number.NaN, 1.5])
    expect(await deleteUserAvatarFiles(id)).toBe(false);
});
