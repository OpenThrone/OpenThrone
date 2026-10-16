import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { ModerationService } = require('../Moderation.service');

beforeEach(() => {
  mockPrisma.auditLog = {
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  };
});

describe('audit target compatibility', () => {
  it('includes numeric and string legacy targets only when the target column is empty', async () => {
    await ModerationService.getAuditLogs({
      targetUserId: 42,
      userId: 7,
      action: 'RESET',
      limit: 10,
      offset: 20,
    });
    const query = mockPrisma.auditLog.findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      userId: 7,
      action: { contains: 'RESET', mode: 'insensitive' },
      OR: [
        { targetUserId: 42 },
        {
          targetUserId: null,
          OR: [
            { details: { path: ['targetUserId'], equals: 42 } },
            { details: { path: ['targetUserId'], equals: '42' } },
          ],
        },
      ],
    });
    expect(mockPrisma.auditLog.count).toHaveBeenCalledWith({
      where: query.where,
    });
    expect(query.take).toBe(10);
    expect(query.skip).toBe(20);
  });

  it('does not restrict an unfiltered audit listing to rows with a target', async () => {
    await ModerationService.getAuditLogs({});
    expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where).toEqual({});
  });
});
