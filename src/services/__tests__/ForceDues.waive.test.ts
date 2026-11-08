import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
// Dynamic imports deliberately install the Prisma test boundary before service loading.
const { waiveForceObligation } = await import('../ForceDues.service');

const ALLIANCE_ID = 3;
const LEADER = 5;
const OFFICER = 6;
const OBLIGATION_ID = 88;

describe('waiving a dues obligation', () => {
  let alliance: { id: number; leader_id: number; status?: string };
  let cancelledCount: number;

  beforeEach(() => {
    alliance = { id: ALLIANCE_ID, leader_id: LEADER };
    cancelledCount = 1;
    mockPrisma.$queryRaw = vi.fn(async () => []);
    mockPrisma.$transaction = vi.fn(async (callback: any) =>
      callback(mockPrisma),
    );
    mockPrisma.alliances = {
      findUniqueOrThrow: vi.fn(async () => alliance),
    };
    mockPrisma.forceObligation = {
      updateMany: vi.fn(async () => ({ count: cancelledCount })),
    };
    mockPrisma.forceEvent = { create: vi.fn(async () => ({})) };
  });

  it('lets the leader cancel an open obligation of that alliance and logs it', async () => {
    await waiveForceObligation(ALLIANCE_ID, LEADER, OBLIGATION_ID);
    const args = mockPrisma.forceObligation.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({
      id: OBLIGATION_ID,
      allianceId: ALLIANCE_ID,
      cancelledAt: null,
    });
    expect(args.data.cancelledAt).toBeInstanceOf(Date);
    expect(mockPrisma.forceEvent.create).toHaveBeenCalledWith({
      data: {
        operationKey: `waive:${OBLIGATION_ID}`,
        allianceId: ALLIANCE_ID,
        actorId: LEADER,
        action: 'DUES_WAIVED',
        details: { obligationId: OBLIGATION_ID },
      },
    });
  });

  it('refuses anyone but the leader, whatever their rank, before any write', async () => {
    await expect(
      waiveForceObligation(ALLIANCE_ID, OFFICER, OBLIGATION_ID),
    ).rejects.toThrow('Alliance leadership is required');
    expect(mockPrisma.forceObligation.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.forceEvent.create).not.toHaveBeenCalled();
  });

  it('refuses a reserved alliance', async () => {
    alliance = { ...alliance, status: 'RESERVED' };
    await expect(
      waiveForceObligation(ALLIANCE_ID, LEADER, OBLIGATION_ID),
    ).rejects.toThrow('reserved');
    expect(mockPrisma.forceObligation.updateMany).not.toHaveBeenCalled();
  });

  it('logs nothing when the obligation was already cancelled or is not theirs', async () => {
    cancelledCount = 0;
    await waiveForceObligation(ALLIANCE_ID, LEADER, OBLIGATION_ID);
    expect(mockPrisma.forceObligation.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.forceEvent.create).not.toHaveBeenCalled();
  });
});
