import { afterAll, describe, expect, it, mock, vi } from 'bun:test';

const guardOptions: any[] = [];
const productionGuard = require('@/middleware/apiGuard');
const productionConfig = require('@/services/RuntimeConfig.service');

const configStub = {
  ...productionConfig,
  // Supporter sales on through the env default, with no database row.
  getRuntimeConfig: vi.fn(async () => ({
    enableSupporter: true,
    enableAttacking: false,
    attackLevelRange: 7,
    maintenance: { enabled: false, message: '' },
  })),
};
const guardStub = {
  withApiGuard: (options: any) => {
    guardOptions.push(options);
    return (handler: any) => async (req: any, res: any) =>
      handler(req, res, { query: req.query, body: req.body });
  },
};
mock.module('@/middleware/apiGuard', () => guardStub);
mock.module('@/services/RuntimeConfig.service', () => configStub);
const handler = require('@/pages/api/admin/system/server-settings').default;

const response = () => {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

afterAll(() => {
  guardStub.withApiGuard = productionGuard.withApiGuard;
  configStub.getRuntimeConfig = productionConfig.getRuntimeConfig;
});

describe('admin server settings: effective values', () => {
  it('reports the value the server runs with for settings without a row', async () => {
    const res = response();
    await handler({ method: 'GET', query: { effective: '1' } }, res);
    expect(guardOptions).toContainEqual(
      expect.objectContaining({
        requiredAnyPermissions: ['MANAGE_SERVER_SETTINGS'],
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const values = res.json.mock.calls[0][0];
    expect(values.ENABLE_SUPPORTER).toBe(true);
    expect(values.ENABLE_ATTACKING).toBe(false);
    expect(values.ATTACK_LEVEL_RANGE).toBe(7);
    expect(values.MAINTENANCE_MODE).toEqual({ enabled: false, message: '' });
  });
});
