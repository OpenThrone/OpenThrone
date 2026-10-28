import { beforeEach, describe, expect, test } from 'bun:test';

import {
  calculateFriendTransferFee,
  FRIEND_TRANSFER_DAILY_RECEIVED_CAP,
} from '@/constants/FriendTransfer';
import { EconomyUpgrades } from '@/constants/Structure_Upgrades';
import prisma from '@/lib/prisma';
import {
  getFriendTransferStatus,
  transferGoldToFriend,
} from '@/services/FriendTransfer.service';
import { createUser } from '@/services/User.service';

import { resetDatabase } from './db';

const DAY_MS = 24 * 60 * 60 * 1000;
/** EconomyUpgrades index 2 = Livestock Market: GOLD_TRANSFER still locked. */
const LOCKED_ECONOMY_LEVEL = 2;
/** EconomyUpgrades index 3 = Coal Mine: 150,000 send / 50,000 receive. */
const UNLOCKED_ECONOMY_LEVEL = 3;
const DEFAULT_GOLD = 1_000_000n;
const RECIPIENT_STARTING_GOLD = 5_000n;

const coalMine = EconomyUpgrades[UNLOCKED_ECONOMY_LEVEL];
if (!coalMine) throw new Error('Coal Mine economy tier is missing');

const coalMineSendLimit = BigInt(coalMine.goldTransferTx);
const coalMineReceiveLimit = BigInt(coalMine.goldTransferRec);

interface PlayerOptions {
  economyLevel?: number;
  createdAt?: Date;
  gold?: bigint;
  fortLevel?: number;
}

/** Creates a player and sets the upgrade/gold/age fields the transfer rules read. */
const createPlayer = async (
  name: string,
  {
    economyLevel = UNLOCKED_ECONOMY_LEVEL,
    createdAt = new Date(Date.now() - 30 * DAY_MS),
    gold = DEFAULT_GOLD,
    fortLevel = 11,
  }: PlayerOptions = {},
) => {
  const user = await createUser(
    `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@example.test`,
    'not-a-real-hash',
    name,
    'HUMAN',
    'FIGHTER',
  );
  await prisma.users.update({
    where: { id: user.id },
    data: {
      economy_level: economyLevel,
      created_at: createdAt,
      fort_level: fortLevel,
      gold,
    },
  });
  return user.id;
};

/** Accepted friendship row in the shape the transfer service expects. */
const befriend = async (playerId: number, friendId: number) => {
  await prisma.social.create({
    data: {
      playerId,
      friendId,
      relationshipType: 'FRIEND',
      status: 'accepted',
      acceptanceDate: new Date(),
    },
  });
};

const logAttack = async (
  attackerId: number,
  defenderId: number,
  when: Date,
) => {
  await prisma.attack_log.create({
    data: {
      attacker_id: attackerId,
      defender_id: defenderId,
      timestamp: when,
      winner: attackerId,
      stats: {},
    },
  });
};

const goldOf = async (id: number) => {
  const row = await prisma.users.findUniqueOrThrow({
    where: { id },
    select: { gold: true },
  });
  return row.gold;
};

/** Runs a transfer and returns its refusal message, or '' when it succeeded. */
const refusalMessage = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return '';
  } catch (error) {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message);
    }
    return String(error);
  }
};

beforeEach(async () => {
  await resetDatabase();
});

describe('friend gold-transfer limits against a real database', () => {
  test('refuses a locked sender and leaves gold and bank history untouched', async () => {
    const sender = await createPlayer('Locked Sender', {
      economyLevel: LOCKED_ECONOMY_LEVEL,
    });
    const recipient = await createPlayer('Locked Sender Recipient');
    await befriend(sender, recipient);

    const senderGoldBefore = await goldOf(sender);
    const recipientGoldBefore = await goldOf(recipient);

    const error = await refusalMessage(
      transferGoldToFriend({
        fromUserId: sender,
        toUserId: recipient,
        amount: 1_000n,
      }),
    );

    expect(error).toContain('Gold transfers unlock with the Coal Mine');
    expect(await goldOf(sender)).toBe(senderGoldBefore);
    expect(await goldOf(recipient)).toBe(recipientGoldBefore);
    expect(await prisma.bank_history.count()).toBe(0);
  });

  test('refuses accounts younger than seven days', async () => {
    const youngSender = await createPlayer('Young Sender', {
      createdAt: new Date(),
    });
    const recipient = await createPlayer('Young Sender Recipient');
    await befriend(youngSender, recipient);

    const senderRefusal = await refusalMessage(
      transferGoldToFriend({
        fromUserId: youngSender,
        toUserId: recipient,
        amount: 1_000n,
      }),
    );
    expect(senderRefusal).toContain(
      'Your account must be at least 7 days old to send gold transfers',
    );

    const olderSender = await createPlayer('Older Sender');
    const youngRecipient = await createPlayer('Young Recipient', {
      createdAt: new Date(),
    });
    await befriend(olderSender, youngRecipient);

    const recipientRefusal = await refusalMessage(
      transferGoldToFriend({
        fromUserId: olderSender,
        toUserId: youngRecipient,
        amount: 1_000n,
      }),
    );
    expect(recipientRefusal).toContain(
      'This player must be at least 7 days old to receive gold transfers',
    );
  });

  test('blocks a transfer when the pair fought within 24 hours', async () => {
    const sender = await createPlayer('Recent Fight Sender');
    const recipient = await createPlayer('Recent Fight Recipient');
    await befriend(sender, recipient);
    await logAttack(
      sender,
      recipient,
      new Date(Date.now() - 60 * 60 * 1000),
    );

    const error = await refusalMessage(
      transferGoldToFriend({
        fromUserId: sender,
        toUserId: recipient,
        amount: 1_000n,
      }),
    );
    expect(error).toContain(
      "You can't send gold to a player you've fought in the last 24 hours",
    );
  });

  test('allows a transfer when the last fight is older than 24 hours', async () => {
    const sender = await createPlayer('Old Fight Sender');
    const recipient = await createPlayer('Old Fight Recipient');
    await befriend(sender, recipient);
    await logAttack(
      sender,
      recipient,
      new Date(Date.now() - 25 * 60 * 60 * 1000),
    );

    const result = await transferGoldToFriend({
      fromUserId: sender,
      toUserId: recipient,
      amount: 1_000n,
    });
    expect(result.success).toBe(true);
  });

  test('charges the amount plus a 10% Coal Mine fee and writes the transfer and tax rows', async () => {
    const sender = await createPlayer('Coal Mine Sender');
    const recipient = await createPlayer('Coal Mine Recipient', {
      gold: RECIPIENT_STARTING_GOLD,
    });
    await befriend(sender, recipient);

    const senderGoldBefore = await goldOf(sender);
    const recipientGoldBefore = await goldOf(recipient);
    const amount = 10_000n;
    const expectedFee = calculateFriendTransferFee(
      amount,
      UNLOCKED_ECONOMY_LEVEL,
    );
    expect(expectedFee).toBe(1_000n);

    const result = await transferGoldToFriend({
      fromUserId: sender,
      toUserId: recipient,
      amount,
      notes: 'test gift',
    });
    expect(result.success).toBe(true);

    expect(await goldOf(sender)).toBe(
      senderGoldBefore - amount - expectedFee,
    );
    expect(await goldOf(recipient)).toBe(recipientGoldBefore + amount);

    const history = await prisma.bank_history.findMany({
      orderBy: { id: 'asc' },
    });
    expect(history).toHaveLength(2);

    const transferRow = history.find(
      (row) => row.to_user_account_type === 'HAND',
    );
    expect(transferRow).toBeDefined();
    expect(transferRow!.from_user_id).toBe(sender);
    expect(transferRow!.to_user_id).toBe(recipient);
    expect(transferRow!.gold_amount).toBe(amount);
    expect(transferRow!.history_type).toBe('FRIEND_TRANSFER');
    expect((transferRow!.stats as Record<string, unknown>).transferType).toBe(
      'FRIEND_TRANSFER',
    );
    expect((transferRow!.stats as Record<string, unknown>).taxAmount).toBe(
      expectedFee.toString(),
    );
    expect((transferRow!.stats as Record<string, unknown>).totalAmount).toBe(
      (amount + expectedFee).toString(),
    );

    const taxRow = history.find(
      (row) => row.to_user_account_type === 'SYSTEM',
    );
    expect(taxRow).toBeDefined();
    expect(taxRow!.from_user_id).toBe(sender);
    expect(taxRow!.gold_amount).toBe(expectedFee);
    expect(taxRow!.history_type).toBe('FRIEND_TRANSFER');
    expect((taxRow!.stats as Record<string, unknown>).transferType).toBe(
      'FRIEND_TRANSFER_TAX',
    );
    expect((taxRow!.stats as Record<string, unknown>).originalAmount).toBe(
      amount.toString(),
    );
    const expectedSystemUserId = process.env.SYSTEM_USER_ID
      ? Number(process.env.SYSTEM_USER_ID)
      : 0;
    expect(taxRow!.to_user_id).toBe(expectedSystemUserId);
  });

  test("refuses a transfer above the sender's daily send limit", async () => {
    const sender = await createPlayer('Send Limit Sender');
    const recipient = await createPlayer('Send Limit Recipient', {
      economyLevel: 5,
    });
    await befriend(sender, recipient);

    const overLimit = coalMineSendLimit + 1n;
    expect(overLimit).toBeLessThanOrEqual(
      BigInt(EconomyUpgrades[5]!.goldTransferRec),
    );

    const error = await refusalMessage(
      transferGoldToFriend({
        fromUserId: sender,
        toUserId: recipient,
        amount: overLimit,
      }),
    );
    expect(error).toContain(
      'You have reached your daily limit for sending gold',
    );
    expect(await prisma.bank_history.count()).toBe(0);
  });

  test('serializes concurrent gifts so the recipient never exceeds its receive limit', async () => {
    const recipient = await createPlayer('Concurrent Recipient');
    const senders = await Promise.all([
      createPlayer('Concurrent Sender A'),
      createPlayer('Concurrent Sender B'),
      createPlayer('Concurrent Sender C'),
    ]);
    await Promise.all(senders.map((sender) => befriend(sender, recipient)));

    const recipientGoldBefore = await goldOf(recipient);
    const amount = 20_000n;
    const results = await Promise.allSettled(
      senders.map((sender) =>
        transferGoldToFriend({
          fromUserId: sender,
          toUserId: recipient,
          amount,
        }),
      ),
    );

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(1);

    const receivedRows = await prisma.bank_history.findMany({
      where: {
        to_user_id: recipient,
        to_user_account_type: 'HAND',
        history_type: 'FRIEND_TRANSFER',
      },
    });
    const totalReceived = receivedRows.reduce(
      (sum, row) => sum + row.gold_amount,
      0n,
    );
    expect(totalReceived).toBe(BigInt(fulfilled.length) * amount);
    expect(totalReceived).toBeLessThanOrEqual(coalMineReceiveLimit);
    expect(totalReceived).toBeLessThanOrEqual(
      FRIEND_TRANSFER_DAILY_RECEIVED_CAP,
    );
    expect(await goldOf(recipient)).toBe(recipientGoldBefore + totalReceived);

    const fee = calculateFriendTransferFee(amount, UNLOCKED_ECONOMY_LEVEL);
    for (let index = 0; index < senders.length; index += 1) {
      const senderGold = await goldOf(senders[index]!);
      if (results[index]!.status === 'fulfilled') {
        expect(senderGold).toBe(DEFAULT_GOLD - amount - fee);
      } else {
        expect(senderGold).toBe(DEFAULT_GOLD);
        const reason = results[index] as PromiseRejectedResult;
        expect(String(reason.reason?.message ?? reason.reason)).toContain(
          'This player has reached the daily limit for receiving gold',
        );
      }
    }
  });

  test('reports integer string limits and rolling daily totals', async () => {
    const sender = await createPlayer('Status Sender');
    const recipient = await createPlayer('Status Recipient', {
      gold: RECIPIENT_STARTING_GOLD,
    });
    await befriend(sender, recipient);
    const amount = 10_000n;
    await transferGoldToFriend({
      fromUserId: sender,
      toUserId: recipient,
      amount,
    });

    const senderStatus = await getFriendTransferStatus(sender);
    expect(senderStatus.unlocked).toBe(true);
    expect(senderStatus.sendPerDay).toBe(coalMineSendLimit.toString());
    expect(senderStatus.receivePerDay).toBe(coalMineReceiveLimit.toString());
    expect(senderStatus.feePercent).toBe(10);
    expect(senderStatus.sentToday).toBe(amount.toString());
    expect(senderStatus.receivedToday).toBe('0');

    for (const value of [
      senderStatus.sendPerDay,
      senderStatus.receivePerDay,
      senderStatus.sentToday,
      senderStatus.receivedToday,
    ]) {
      expect(value).toMatch(/^\d+$/);
      expect(value.endsWith('n')).toBe(false);
    }

    const recipientStatus = await getFriendTransferStatus(recipient);
    expect(recipientStatus.unlocked).toBe(true);
    expect(recipientStatus.sendPerDay).toBe(coalMineSendLimit.toString());
    expect(recipientStatus.receivePerDay).toBe(coalMineReceiveLimit.toString());
    expect(recipientStatus.feePercent).toBe(10);
    expect(recipientStatus.sentToday).toBe('0');
    expect(recipientStatus.receivedToday).toBe(amount.toString());

    const locked = await createPlayer('Status Locked', {
      economyLevel: LOCKED_ECONOMY_LEVEL,
    });
    const lockedStatus = await getFriendTransferStatus(locked);
    expect(lockedStatus.unlocked).toBe(false);
    expect(lockedStatus.sendPerDay).toBe('0');
    expect(lockedStatus.receivePerDay).toBe('0');
    expect(lockedStatus.feePercent).toBe(0);
  });
});
