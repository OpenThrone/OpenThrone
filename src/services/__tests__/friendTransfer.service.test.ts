import { beforeEach, describe, expect, it, vi } from 'bun:test';

import type { Prisma } from '@/lib/prisma-exports';

// Use shared mock helpers
import { installMockPrisma, mockPrisma } from '../../../test/utils/mockPrisma';

let transferGoldToFriend: any;
let createGoldRequest: any;
let respondToGoldRequest: any;
let getFriendTransferHistory: any;
let getPendingFriendTransfers: any;
let cancelFriendTransfer: any;
let getFriendTransferConfig: any;
let calculateTransferFee: any;
let isValidTransferAmount: any;
let canMakeTransfer: any;

// Define the type for the transaction client (copied from the service)
type TransactionClient = Prisma.TransactionClient;

// Install mocks before requiring modules under test
installMockPrisma(vi);

// Mock the config service using vi.mock (returns functions that call into our mockConfigService below)
const mockConfigService = {
  getFriendTransferConfig: vi.fn(),
  calculateTransferFee: vi.fn(),
  isValidTransferAmount: vi.fn(),
  canMakeTransfer: vi.fn(),
};

// Use typed vi.mock to provide the config service implementation backed by our mockConfigService
vi.mock('../Config.service', () => ({
  getFriendTransferConfig: () => mockConfigService.getFriendTransferConfig(),
  calculateTransferFee: (amount: any) =>
    mockConfigService.calculateTransferFee(amount),
  isValidTransferAmount: (amount: any) =>
    mockConfigService.isValidTransferAmount(amount),
  canMakeTransfer: (date: any) => mockConfigService.canMakeTransfer(date),
  friendTransferCompleteConfig: { cooldownMs: 24 * 60 * 60 * 1000 },
}));

// Require modules after mocks are in place so the modules pick up our mocked implementations
const configModule = require('../Config.service');

getFriendTransferConfig = configModule.getFriendTransferConfig;
calculateTransferFee = configModule.calculateTransferFee;
isValidTransferAmount = configModule.isValidTransferAmount;
canMakeTransfer = configModule.canMakeTransfer;

const serviceModule = require('../FriendTransfer.service');

transferGoldToFriend = serviceModule.transferGoldToFriend;
createGoldRequest = serviceModule.createGoldRequest;
respondToGoldRequest = serviceModule.respondToGoldRequest;
getFriendTransferHistory = serviceModule.getFriendTransferHistory;
getPendingFriendTransfers = serviceModule.getPendingFriendTransfers;
cancelFriendTransfer = serviceModule.cancelFriendTransfer;

describe('FriendTransferService', () => {
  let mockTx: TransactionClient;
  let mockConfig: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    mockPrisma.users.findUnique.mockReset();
    mockPrisma.bank_history.create.mockReset();
    mockPrisma.bank_history.findFirst.mockReset();
    // For tests we alias mockTx to the shared mockPrisma so both transaction and top-level calls
    // operate on the same mock object. This keeps expectations consistent in tests that use
    // either `mockPrisma` or `mockTx`.
    mockTx = mockPrisma;
    mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
    mockPrisma.bank_history.findFirst.mockResolvedValue(null);
    mockPrisma.bank_history.aggregate = vi
      .fn()
      .mockResolvedValue({ _sum: { gold_amount: null } });
    mockPrisma.accountStatusHistory.findFirst = vi.fn().mockResolvedValue(null);
    mockPrisma.users.update = vi.fn();

    // Default $transaction implementation: call the callback with the mockPrisma as the tx
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      return await cb(mockPrisma);
    });

    // Mock config
    mockConfig = {
      enabled: true,
      maxAmount: BigInt(1000000),
      cooldownHours: 24,
      feePercentage: 5,
    };

    mockConfigService.getFriendTransferConfig.mockReturnValue(mockConfig);
    mockConfigService.calculateTransferFee.mockImplementation(
      (amount: bigint) => (amount * BigInt(5)) / BigInt(100),
    );
    mockConfigService.isValidTransferAmount.mockImplementation(
      (amount: bigint) => amount > BigInt(0) && amount <= BigInt(1000000),
    );
    mockConfigService.canMakeTransfer.mockReturnValue(true);
  });

  describe('transferGoldToFriend', () => {
    const transferParams = {
      fromUserId: 1,
      toUserId: 2,
      amount: BigInt(1000),
      notes: 'Test transfer',
      friendshipId: 123,
    };

    it('should successfully transfer gold between friends', async () => {
      // Mock friendship exists
      mockTx.social.findFirst.mockResolvedValue({ id: 123 });

      // Mock sender and receiver
      mockTx.users.findUnique
        .mockResolvedValueOnce({ id: 1, gold: BigInt(5000) }) // Sender
        .mockResolvedValueOnce({ id: 2, gold: BigInt(1000) }); // Receiver

      // Mock bank history creation
      mockTx.bank_history.create
        .mockResolvedValueOnce({ id: 456 }) // Transfer record
        .mockResolvedValueOnce({ id: 457 }); // Tax record

      const result = await transferGoldToFriend(transferParams);

      expect(result).toEqual({ success: true, transferId: 456 });
      expect(mockPrisma.social.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { playerId: 1, friendId: 2, status: 'accepted' },
            { playerId: 2, friendId: 1, status: 'accepted' },
          ],
        },
      });
      expect(mockPrisma.users.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.bank_history.create).toHaveBeenCalledTimes(2);
    });

    it('should throw error if users are not friends', async () => {
      mockPrisma.social.findFirst.mockResolvedValue(null);

      await expect(transferGoldToFriend(transferParams)).rejects.toThrow(
        'Users must be friends to perform this operation',
      );
    });

    it('should throw error if sender has insufficient gold', async () => {
      mockTx.social.findFirst.mockResolvedValue({ id: 123 });
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 1,
        gold: BigInt(500),
      }); // Insufficient gold

      await expect(transferGoldToFriend(transferParams)).rejects.toThrow(
        'Insufficient gold for transfer',
      );
    });

    it('should throw error if feature is disabled', async () => {
      mockConfig.enabled = false;
      mockConfigService.getFriendTransferConfig.mockReturnValue(mockConfig);

      mockPrisma.social.findFirst.mockResolvedValue({ id: 123 });
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 1,
        gold: BigInt(5000),
      });

      await expect(transferGoldToFriend(transferParams)).rejects.toThrow(
        'Friend transfers are currently disabled',
      );
    });

    it('should throw error if amount is invalid', async () => {
      mockConfigService.isValidTransferAmount.mockReturnValue(false);

      mockPrisma.social.findFirst.mockResolvedValue({ id: 123 });
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 1,
        gold: BigInt(5000),
      });

      await expect(
        transferGoldToFriend({ ...transferParams, amount: BigInt(500) }),
      ).rejects.toThrow('Transfer amount must be between 1 and 1000000 gold');
    });

    it('should throw error if user is on cooldown', async () => {
      mockConfigService.canMakeTransfer.mockReturnValue(false);

      mockPrisma.social.findFirst.mockResolvedValue({ id: 123 });
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 1,
        gold: BigInt(5000),
      });

      // Simulate that a recent transfer exists so the cooldown check runs
      mockPrisma.bank_history.findFirst.mockResolvedValue({
        id: 999,
        date_time: new Date(),
      });

      await expect(transferGoldToFriend(transferParams)).rejects.toThrow(
        'You must wait before making another transfer',
      );
    });

    it('should reject a balance that covers the amount but not the fee', async () => {
      mockTx.social.findFirst.mockResolvedValue({ id: 123 });
      mockPrisma.users.findUnique
        .mockResolvedValueOnce({ id: 1, gold: BigInt(1000) }) // Sender with exact amount
        .mockResolvedValueOnce({ id: 2, gold: BigInt(0) }); // Receiver

      mockPrisma.bank_history.create
        .mockResolvedValueOnce({ id: 456 })
        .mockResolvedValueOnce({ id: 457 });

      await expect(
        transferGoldToFriend({ ...transferParams, amount: 1000n }),
      ).rejects.toThrow('Insufficient gold for transfer');
      expect(mockPrisma.users.update).not.toHaveBeenCalled();
    });

    it('should handle zero fee percentage correctly', async () => {
      mockConfigService.calculateTransferFee.mockReturnValue(BigInt(0));

      mockPrisma.social.findFirst.mockResolvedValue({ id: 123 });
      mockPrisma.users.findUnique
        .mockResolvedValueOnce({ id: 1, gold: BigInt(1000) })
        .mockResolvedValueOnce({ id: 2, gold: BigInt(0) });

      mockPrisma.bank_history.create.mockResolvedValue({ id: 456 });

      await transferGoldToFriend({ ...transferParams, amount: BigInt(1000) });

      // With zero fee the sender is debited by the amount
      expect(mockPrisma.users.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { gold: { decrement: BigInt(1000) } },
      });
    });

    it('rejects a note longer than the limit (GIFT-01)', async () => {
      mockPrisma.social.findFirst.mockResolvedValue({ id: 123 });

      await expect(
        transferGoldToFriend({ ...transferParams, notes: 'x'.repeat(201) }),
      ).rejects.toThrow();
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
      expect(mockPrisma.users.update).not.toHaveBeenCalled();
    });

    it('accepts a note at exactly the limit', async () => {
      mockPrisma.social.findFirst.mockResolvedValue({ id: 123 });
      mockPrisma.users.findUnique
        .mockResolvedValueOnce({ id: 1, gold: BigInt(5000) })
        .mockResolvedValueOnce({ id: 2, gold: BigInt(0) });
      mockPrisma.bank_history.create.mockResolvedValue({ id: 456 });

      const result = await transferGoldToFriend({
        ...transferParams,
        notes: 'x'.repeat(200),
      });
      expect(result.success).toBe(true);
    });

    it.each(['BANNED', 'SUSPENDED', 'VACATION', 'CLOSED'])(
      'rejects a %s recipient inside the locked transaction (GIFT-02)',
      async (status) => {
        mockPrisma.social.findFirst.mockResolvedValue({ id: 123 });
        mockPrisma.accountStatusHistory.findFirst.mockResolvedValue({
          status,
          end_date: null,
        });
        mockPrisma.users.findUnique.mockResolvedValue({
          id: 1,
          gold: BigInt(5000),
        });

        await expect(transferGoldToFriend(transferParams)).rejects.toThrow(
          'This player cannot receive gold right now',
        );
        expect(mockPrisma.accountStatusHistory.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ user_id: 2 }),
          }),
        );
        expect(mockPrisma.$queryRaw).toHaveBeenCalled();
        expect(mockPrisma.users.update).not.toHaveBeenCalled();
      },
    );

    it('allows a recipient whose suspension has ended', async () => {
      mockPrisma.social.findFirst.mockResolvedValue({ id: 123 });
      mockPrisma.accountStatusHistory.findFirst.mockResolvedValue({
        status: 'SUSPENDED',
        end_date: new Date(Date.now() - 1000),
      });
      mockPrisma.users.findUnique
        .mockResolvedValueOnce({ id: 1, gold: BigInt(5000) })
        .mockResolvedValueOnce({ id: 2, gold: BigInt(0) });
      mockPrisma.bank_history.create.mockResolvedValue({ id: 456 });

      const result = await transferGoldToFriend(transferParams);
      expect(result.success).toBe(true);
    });

    it('rejects a gift that would push the recipient over the daily received cap (GIFT-03)', async () => {
      mockPrisma.social.findFirst.mockResolvedValue({ id: 123 });
      mockPrisma.bank_history.aggregate.mockResolvedValue({
        _sum: { gold_amount: BigInt(2_999_500) },
      });
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 1,
        gold: BigInt(5000),
      });

      await expect(transferGoldToFriend(transferParams)).rejects.toThrow(
        'This player has reached the daily limit for receiving gold',
      );
      const { where } = mockPrisma.bank_history.aggregate.mock.calls[0][0];
      expect(where).toMatchObject({
        to_user_id: 2,
        to_user_account_type: 'HAND',
        history_type: 'FRIEND_TRANSFER',
      });
      // The cap is read only after both user rows are locked.
      expect(mockPrisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        mockPrisma.bank_history.aggregate.mock.invocationCallOrder[0],
      );
      expect(mockPrisma.users.update).not.toHaveBeenCalled();
    });

    it('allows a gift that lands exactly on the daily received cap', async () => {
      mockPrisma.social.findFirst.mockResolvedValue({ id: 123 });
      mockPrisma.bank_history.aggregate.mockResolvedValue({
        _sum: { gold_amount: BigInt(2_999_000) },
      });
      mockPrisma.users.findUnique
        .mockResolvedValueOnce({ id: 1, gold: BigInt(5000) })
        .mockResolvedValueOnce({ id: 2, gold: BigInt(0) });
      mockPrisma.bank_history.create.mockResolvedValue({ id: 456 });

      const result = await transferGoldToFriend(transferParams);
      expect(result.success).toBe(true);
    });
  });

  describe('createGoldRequest', () => {
    const requestParams = {
      fromUserId: 1,
      toUserId: 2,
      amount: BigInt(500),
      notes: 'Test request',
    };

    it('should successfully create a gold request', async () => {
      mockPrisma.social.findFirst.mockResolvedValue({ id: 123 });
      // Ensure there is no existing pending request
      mockPrisma.bank_history.findFirst.mockResolvedValue(null);
      mockPrisma.bank_history.create.mockResolvedValue({ id: 789 });

      const result = await createGoldRequest(requestParams);

      expect(result).toEqual({ success: true, requestId: 789 });
      expect(mockPrisma.bank_history.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          gold_amount: BigInt(500),
          from_user_id: 1,
          to_user_id: 2,
          history_type: 'FRIEND_REQUEST',
          stats: expect.objectContaining({
            transferType: 'FRIEND_REQUEST',
            friendshipId: 123,
            senderNote: 'Test request',
            expiresAt: expect.any(String),
          }),
        }),
      });
    });

    it('serializes concurrent requests before checking cooldown', async () => {
      let releaseLock: () => void = () => {};
      const locked = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      let locks = 0;
      let created = false;
      mockPrisma.$queryRaw.mockImplementation(async () => {
        locks += 1;
        if (locks > 1) await locked;
        return [];
      });
      mockPrisma.social.findFirst.mockResolvedValue({ id: 123 });
      mockPrisma.bank_history.findFirst.mockImplementation(async () =>
        created ? { id: 789 } : null,
      );
      mockPrisma.bank_history.create.mockImplementation(async () => {
        created = true;
        return { id: 789 };
      });
      const first = createGoldRequest(requestParams).finally(releaseLock);
      const second = createGoldRequest(requestParams);
      const outcomes = await Promise.allSettled([first, second]);
      expect(outcomes.map((outcome) => outcome.status)).toEqual([
        'fulfilled',
        'rejected',
      ]);
      expect(mockPrisma.bank_history.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('should throw error if users are not friends', async () => {
      mockPrisma.social.findFirst.mockResolvedValue(null);

      await expect(createGoldRequest(requestParams)).rejects.toThrow(
        'Users must be friends to perform this operation',
      );
    });

    it('should throw error if feature is disabled', async () => {
      mockConfig.enabled = false;
      mockConfigService.getFriendTransferConfig.mockReturnValue(mockConfig);

      mockPrisma.social.findFirst.mockResolvedValue({ id: 123 });

      await expect(createGoldRequest(requestParams)).rejects.toThrow(
        'Friend transfers are currently disabled',
      );
    });

    it('should throw error if amount is invalid', async () => {
      mockConfigService.isValidTransferAmount.mockReturnValue(false);

      mockPrisma.social.findFirst.mockResolvedValue({ id: 123 });

      await expect(
        createGoldRequest({ ...requestParams, amount: BigInt(500) }),
      ).rejects.toThrow('Request amount must be between 1 and 1000000 gold');
    });

    it('should throw error if user has existing pending request', async () => {
      mockPrisma.social.findFirst.mockResolvedValue({ id: 123 });
      mockPrisma.bank_history.findFirst.mockResolvedValue({ id: 999 });

      await expect(createGoldRequest(requestParams)).rejects.toThrow(
        'You must wait before making another request to this friend',
      );
    });
  });

  describe('respondToGoldRequest', () => {
    const requestParams = {
      actorUserId: 1,
      requestId: 123,
      action: 'accept' as const,
      message: 'Accepted!',
    };

    it('should successfully accept a gold request', async () => {
      const mockRequest = {
        id: 123,
        from_user_id: 2,
        to_user_id: 1,
        gold_amount: BigInt(500),
        history_type: 'FRIEND_REQUEST',
        stats: {
          transferType: 'FRIEND_REQUEST',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          friendshipId: 456,
          senderNote: 'Test request',
        },
        from_user: { id: 2, display_name: 'Friend' },
        to_user: { id: 1, display_name: 'User' },
      };

      mockPrisma.bank_history.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.bank_history.update.mockResolvedValue({
        ...mockRequest,
        stats: {
          ...mockRequest.stats,
          transferType: 'FRIEND_REQUEST_FULFILLED',
        },
      });

      mockPrisma.social.findFirst.mockResolvedValue({ id: 456 });
      mockPrisma.users.findUnique
        .mockResolvedValueOnce({ id: 1, gold: 1000n })
        .mockResolvedValueOnce({ id: 2, gold: 0n });
      mockPrisma.bank_history.create.mockResolvedValue({ id: 987 });

      // Mock the transfer that happens when accepting
      vi.spyOn(mockPrisma, '$transaction').mockImplementation(
        async (callback: any) => {
          const tx = mockPrisma;
          await callback(tx);
          return { success: true };
        },
      );

      const result = await respondToGoldRequest(requestParams);

      expect(result).toEqual({ success: true });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.bank_history.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: expect.objectContaining({
          stats: expect.objectContaining({
            transferType: 'FRIEND_REQUEST_FULFILLED',
            acceptedAt: expect.any(String),
            fulfillerMessage: 'Accepted!',
          }),
        }),
      });
    });

    it('should successfully decline a gold request', async () => {
      const mockRequest = {
        id: 123,
        from_user_id: 2,
        to_user_id: 1,
        gold_amount: BigInt(500),
        history_type: 'FRIEND_REQUEST',
        stats: {
          transferType: 'FRIEND_REQUEST',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          friendshipId: 456,
          senderNote: 'Test request',
        },
        from_user: { id: 2, display_name: 'Friend' },
        to_user: { id: 1, display_name: 'User' },
      };

      mockTx.bank_history.findUnique.mockResolvedValue(mockRequest);
      mockTx.bank_history.update.mockResolvedValue({
        ...mockRequest,
        stats: {
          ...mockRequest.stats,
          transferType: 'FRIEND_REQUEST_DECLINED',
        },
      });

      const result = await respondToGoldRequest({
        ...requestParams,
        action: 'decline',
      });

      expect(result).toEqual({ success: true });
      expect(mockTx.bank_history.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: expect.objectContaining({
          stats: expect.objectContaining({
            transferType: 'FRIEND_REQUEST_DECLINED',
            declinedAt: expect.any(String),
            declineReason: 'Accepted!',
          }),
        }),
      });
    });

    it('rejects another account responding without moving gold', async () => {
      mockPrisma.bank_history.findUnique.mockResolvedValue({
        id: 123,
        to_user_id: 8,
        history_type: 'FRIEND_REQUEST',
        stats: {
          transferType: 'FRIEND_REQUEST',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      });
      await expect(respondToGoldRequest(requestParams)).rejects.toThrow(
        'not authorized',
      );
      expect(mockPrisma.users.update).not.toHaveBeenCalled();
      expect(mockPrisma.bank_history.update).not.toHaveBeenCalled();
    });

    it('rejects already fulfilled, declined, and cancelled requests', async () => {
      for (const transferType of [
        'FRIEND_REQUEST_FULFILLED',
        'FRIEND_REQUEST_DECLINED',
        'FRIEND_REQUEST_CANCELLED',
      ]) {
        mockPrisma.bank_history.findUnique.mockResolvedValue({
          id: 123,
          to_user_id: 1,
          history_type: 'FRIEND_REQUEST',
          stats: { transferType },
        });
        await expect(respondToGoldRequest(requestParams)).rejects.toThrow(
          'no longer pending',
        );
      }
      expect(mockPrisma.users.update).not.toHaveBeenCalled();
    });

    it('rejects expired or malformed expiry timestamps', async () => {
      for (const expiresAt of [
        new Date(Date.now() - 1).toISOString(),
        'invalid',
        undefined,
      ]) {
        mockPrisma.bank_history.findUnique.mockResolvedValue({
          id: 123,
          to_user_id: 1,
          history_type: 'FRIEND_REQUEST',
          stats: { transferType: 'FRIEND_REQUEST', expiresAt },
        });
        await expect(respondToGoldRequest(requestParams)).rejects.toThrow(
          'expired',
        );
      }
      expect(mockPrisma.users.update).not.toHaveBeenCalled();
    });

    it('rejects a request that expires while waiting for account locks', async () => {
      const now = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
      try {
        mockPrisma.bank_history.findUnique.mockResolvedValue({
          id: 123,
          from_user_id: 2,
          to_user_id: 1,
          gold_amount: 500n,
          history_type: 'FRIEND_REQUEST',
          stats: {
            transferType: 'FRIEND_REQUEST',
            expiresAt: new Date(now + 1000).toISOString(),
          },
        });
        mockPrisma.$queryRaw.mockImplementation(
          async (sql: TemplateStringsArray) => {
            if (sql.join('').includes('FROM users'))
              clock.mockReturnValue(now + 1001);
            return [];
          },
        );
        await expect(respondToGoldRequest(requestParams)).rejects.toThrow(
          'expired',
        );
        expect(mockPrisma.users.update).not.toHaveBeenCalled();
      } finally {
        clock.mockRestore();
      }
    });

    it('serializes duplicate accept requests and transfers only once', async () => {
      const request = {
        id: 123,
        from_user_id: 2,
        to_user_id: 1,
        gold_amount: 500n,
        history_type: 'FRIEND_REQUEST',
        stats: {
          transferType: 'FRIEND_REQUEST',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      };
      let releaseLock: () => void = () => {};
      const locked = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      let requestLocks = 0;
      mockPrisma.$queryRaw.mockImplementation(
        async (sql: TemplateStringsArray) => {
          if (sql.join('').includes('bank_history')) {
            requestLocks += 1;
            if (requestLocks > 1) await locked;
          }
          return [];
        },
      );
      mockPrisma.bank_history.findUnique.mockImplementation(
        async () => request,
      );
      mockPrisma.bank_history.update.mockImplementation(
        async ({ data }: { data: { stats: typeof request.stats } }) => {
          request.stats = data.stats;
          return request;
        },
      );
      mockPrisma.social.findFirst.mockResolvedValue({ id: 456 });
      mockPrisma.users.findUnique.mockResolvedValue({ gold: 5000n });
      mockPrisma.bank_history.create.mockResolvedValue({ id: 987 });
      const first = respondToGoldRequest(requestParams).finally(releaseLock);
      const second = respondToGoldRequest(requestParams);
      const outcomes = await Promise.allSettled([first, second]);
      expect(outcomes.map((result) => result.status)).toEqual([
        'fulfilled',
        'rejected',
      ]);
      expect(mockPrisma.users.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.bank_history.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('propagates completion failure through the same transaction as gold writes', async () => {
      mockPrisma.bank_history.findUnique.mockResolvedValue({
        id: 123,
        from_user_id: 2,
        to_user_id: 1,
        gold_amount: 500n,
        history_type: 'FRIEND_REQUEST',
        stats: {
          transferType: 'FRIEND_REQUEST',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      });
      mockPrisma.social.findFirst.mockResolvedValue({ id: 456 });
      mockPrisma.users.findUnique.mockResolvedValue({ gold: 5000n });
      mockPrisma.bank_history.create.mockResolvedValue({ id: 987 });
      mockPrisma.bank_history.update.mockRejectedValueOnce(
        new Error('synthetic completion failure'),
      );
      await expect(respondToGoldRequest(requestParams)).rejects.toThrow(
        'synthetic completion failure',
      );
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should throw error if request is not found', async () => {
      mockTx.bank_history.findUnique.mockResolvedValue(null);

      await expect(respondToGoldRequest(requestParams)).rejects.toThrow(
        'Invalid request',
      );
    });

    it('should throw error if request is not a FRIEND_REQUEST type', async () => {
      const mockRequest = {
        id: 123,
        from_user_id: 2,
        to_user_id: 1,
        gold_amount: BigInt(500),
        history_type: 'FRIEND_TRANSFER', // Wrong type
        stats: {},
      };

      mockTx.bank_history.findUnique.mockResolvedValue(mockRequest);

      await expect(respondToGoldRequest(requestParams)).rejects.toThrow(
        'Invalid request',
      );
    });
  });

  describe('getFriendTransferHistory', () => {
    it('should return friend transfer history', async () => {
      const mockTransfers = [
        {
          id: 1,
          gold_amount: BigInt(1000),
          from_user_id: 1,
          to_user_id: 2,
          history_type: 'FRIEND_TRANSFER',
          date_time: new Date(),
          from_user: {
            id: 1,
            display_name: 'User1',
            race: 'ELF',
            class: 'WARRIOR',
          },
          to_user: {
            id: 2,
            display_name: 'User2',
            race: 'HUMAN',
            class: 'MAGE',
          },
        },
      ];

      mockPrisma.bank_history.findMany.mockResolvedValue(mockTransfers);
      mockPrisma.bank_history.count.mockResolvedValue(1);

      const result = await getFriendTransferHistory({ userId: 1 });

      expect(result).toEqual({ transfers: mockTransfers, total: 1 });
      expect(mockPrisma.bank_history.findMany).toHaveBeenCalledWith({
        where: {
          date_time: { gte: expect.any(Date) },
          history_type: { in: ['FRIEND_TRANSFER', 'FRIEND_REQUEST'] },
          OR: [{ from_user_id: 1 }, { to_user_id: 1 }],
        },
        include: expect.any(Object),
        orderBy: { date_time: 'desc' },
        skip: 0,
        take: 20,
      });
    });

    it('should filter by friend ID when provided', async () => {
      mockPrisma.bank_history.findMany.mockResolvedValue([]);
      mockPrisma.bank_history.count.mockResolvedValue(0);

      await getFriendTransferHistory({ userId: 1, friendId: 2 });

      expect(mockPrisma.bank_history.findMany).toHaveBeenCalledWith({
        where: {
          date_time: { gte: expect.any(Date) },
          history_type: { in: ['FRIEND_TRANSFER', 'FRIEND_REQUEST'] },
          OR: [
            { from_user_id: 1, to_user_id: 2 },
            { from_user_id: 2, to_user_id: 1 },
          ],
        },
        include: expect.any(Object),
        orderBy: { date_time: 'desc' },
        skip: 0,
        take: 20,
      });
    });

    it('should handle pagination', async () => {
      mockPrisma.bank_history.findMany.mockResolvedValue([]);
      mockPrisma.bank_history.count.mockResolvedValue(0);

      await getFriendTransferHistory({ userId: 1, page: 2, limit: 10 });

      expect(mockPrisma.bank_history.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('getPendingFriendTransfers', () => {
    it('should return pending friend transfer requests', async () => {
      const mockRequests = [
        {
          id: 1,
          gold_amount: BigInt(500),
          from_user_id: 2,
          to_user_id: 1,
          date_time: new Date(),
          stats: {
            transferType: 'FRIEND_REQUEST',
            senderNote: 'Test request',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
          from_user: {
            id: 2,
            display_name: 'Friend',
            race: 'ELF',
            class: 'WARRIOR',
          },
        },
      ];

      mockPrisma.bank_history.findMany.mockResolvedValue(mockRequests);

      const result = await getPendingFriendTransfers(1);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 1,
        from_user_id: 2,
        to_user_id: 1,
        amount: BigInt(500),
        message: 'Test request',
        status: 'PENDING',
        created_at: expect.any(Date),
        from_user: {
          id: 2,
          display_name: 'Friend',
          race: 'ELF',
          class: 'WARRIOR',
        },
        expires_at: expect.any(Date),
      });
    });

    it('should return empty array when no pending requests', async () => {
      mockPrisma.bank_history.findMany.mockResolvedValue([]);

      const result = await getPendingFriendTransfers(1);

      expect(result).toEqual([]);
    });
  });

  describe('cancelFriendTransfer', () => {
    it('should successfully cancel a pending transfer request', async () => {
      const mockRequest = {
        id: 123,
        from_user_id: 1,
        to_user_id: 2,
        gold_amount: BigInt(500),
        history_type: 'FRIEND_REQUEST',
        stats: {
          transferType: 'FRIEND_REQUEST',
          senderNote: 'Test request',
        },
        date_time: new Date(),
      };

      mockPrisma.bank_history.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.bank_history.update.mockResolvedValue({
        ...mockRequest,
        stats: {
          ...mockRequest.stats,
          transferType: 'FRIEND_REQUEST_CANCELLED',
        },
      });

      const result = await cancelFriendTransfer(123, 1);

      expect(result).toEqual({
        id: 123,
        from_user_id: 1,
        to_user_id: 2,
        amount: BigInt(500),
        message: 'Test request',
        status: 'CANCELLED',
        created_at: expect.any(Date),
        cancelled_at: expect.any(Date),
      });
    });

    it('should throw error if transfer request not found', async () => {
      mockPrisma.bank_history.findUnique.mockResolvedValue(null);

      await expect(cancelFriendTransfer(123, 1)).rejects.toThrow(
        'Transfer request not found',
      );
    });

    it('should throw error if user is not authorized to cancel', async () => {
      const mockRequest = {
        id: 123,
        from_user_id: 2, // Different user
        to_user_id: 1,
        gold_amount: BigInt(500),
        history_type: 'FRIEND_REQUEST',
        stats: {},
      };

      mockPrisma.bank_history.findUnique.mockResolvedValue(mockRequest);

      await expect(cancelFriendTransfer(123, 1)).rejects.toThrow(
        'You are not authorized to cancel this transfer',
      );
    });

    it('should throw error if transfer request is not cancellable', async () => {
      const mockRequest = {
        id: 123,
        from_user_id: 1,
        to_user_id: 2,
        gold_amount: BigInt(500),
        history_type: 'FRIEND_REQUEST',
        stats: {
          transferType: 'FRIEND_REQUEST_FULFILLED', // Already fulfilled
        },
      };

      mockPrisma.bank_history.findUnique.mockResolvedValue(mockRequest);

      await expect(cancelFriendTransfer(123, 1)).rejects.toThrow(
        'Transfer request is not cancellable',
      );
    });
  });
});
