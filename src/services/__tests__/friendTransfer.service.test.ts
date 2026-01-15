import { beforeEach, describe, expect, it, vi } from 'bun:test';

// Use shared mock helpers
import { installMockMtRand } from '../../../test/utils/mockMtRand';
import { installMockPrisma, mockPrisma } from '../../../test/utils/mockPrisma';
// We'll require the service and config modules after we set up vi.mock so the mocks take effect.
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
type TransactionClient = Omit<
  any,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// Install mocks before requiring modules under test
installMockPrisma(vi);
installMockMtRand(vi);

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
    // For tests we alias mockTx to the shared mockPrisma so both transaction and top-level calls
    // operate on the same mock object. This keeps expectations consistent in tests that use
    // either `mockPrisma` or `mockTx`.
    mockTx = mockPrisma;

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
        transferGoldToFriend({ ...transferParams, amount: BigInt(0) }),
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

    it('should calculate and apply transfer fee correctly', async () => {
      mockTx.social.findFirst.mockResolvedValue({ id: 123 });
      mockPrisma.users.findUnique
        .mockResolvedValueOnce({ id: 1, gold: BigInt(1000) }) // Sender with exact amount
        .mockResolvedValueOnce({ id: 2, gold: BigInt(0) }); // Receiver

      mockPrisma.bank_history.create
        .mockResolvedValueOnce({ id: 456 })
        .mockResolvedValueOnce({ id: 457 });

      await transferGoldToFriend({ ...transferParams, amount: BigInt(1000) });

      // Service subtracts amount + fee from sender (totalAmount) and credits the receiver with amount
      expect(mockPrisma.users.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { gold: BigInt(-50) }, // 1000 - (1000 + 50) = -50
      });

      expect(mockPrisma.users.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { gold: BigInt(1000) }, // 1000 received
      });
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
        data: { gold: BigInt(0) }, // 1000 - 1000 = 0
      });
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
        createGoldRequest({ ...requestParams, amount: BigInt(0) }),
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
