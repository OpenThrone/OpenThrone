import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { NextApiResponse } from 'next';

import { handler } from '@/pages/api/armory/upgrade';
import { ArmoryService } from '@/services/Armory.service';
import type { AuthenticatedRequest } from '@/types/api';

const originalUpgrade = ArmoryService.upgradeItems;
afterEach(() => {
  ArmoryService.upgradeItems = originalUpgrade;
});
const body = {
  userId: 7,
  conversions: [
    {
      fromItem: 'OFFENSE_OFFENSE_DAGGER',
      toItem: 'OFFENSE_OFFENSE_HATCHET',
      conversionAmount: 1,
    },
  ],
};
const response = () => {
  const state = {
    statusCode: 0,
    body: null as unknown,
    allow: null as unknown,
  };
  const res = {
    status: (code: number) => {
      state.statusCode = code;
      return res;
    },
    json: (data: unknown) => {
      state.body = data;
      return res;
    },
    setHeader: (_name: string, value: unknown) => {
      state.allow = value;
      return res;
    },
  };
  return { state, res: res as unknown as NextApiResponse };
};

describe('upgrade order API authorization and validation', () => {
  it('rejects another user and missing sessions before calling the service', async () => {
    const upgrade = mock(async () => ({ message: 'ok', data: [] }));
    ArmoryService.upgradeItems = upgrade;
    for (const session of [{ user: { id: 8 } }, undefined]) {
      const { state, res } = response();
      await handler(
        { method: 'POST', body, session } as unknown as AuthenticatedRequest,
        res,
      );
      expect(state.statusCode).toBe(403);
    }
    expect(upgrade).not.toHaveBeenCalled();
  });
  it('rejects empty orders and invalid quantities without invoking the service', async () => {
    const upgrade = mock(async () => ({ message: 'ok', data: [] }));
    ArmoryService.upgradeItems = upgrade;
    for (const conversions of [
      [],
      [{ ...body.conversions[0], conversionAmount: -1 }],
      [{ ...body.conversions[0], conversionAmount: 0.5 }],
    ]) {
      const { state, res } = response();
      await handler(
        {
          method: 'POST',
          body: { ...body, conversions },
          session: { user: { id: 7 } },
        } as unknown as AuthenticatedRequest,
        res,
      );
      expect(state.statusCode).toBe(400);
    }
    expect(upgrade).not.toHaveBeenCalled();
  });
  it('rejects unsupported methods', async () => {
    const { state, res } = response();
    await handler({ method: 'GET' } as AuthenticatedRequest, res);
    expect(state.statusCode).toBe(405);
    expect(state.allow).toEqual(['POST']);
  });
});
