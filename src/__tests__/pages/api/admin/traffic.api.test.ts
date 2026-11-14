import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

import * as guard from '@/middleware/apiGuard';
import * as gaService from '@/services/analytics/GoogleAnalyticsData.service';
import { getOTDayKey, getOTStartDate } from '@/utils/timefunctions';

installMockPrisma(vi);

const guardSpy = vi
  .spyOn(guard, 'withApiGuard')
  .mockImplementation(
    (options: any) => (handler: any) => async (req: any, res: any) => {
      let { query } = req;
      if (options.querySchema) {
        const parsed = options.querySchema.safeParse(req.query ?? {});
        if (!parsed.success)
          return res.status(422).json({ message: 'Invalid query parameters' });
        query = parsed.data;
      }
      return handler(req, res, { query, body: req.body });
    },
  );
const trafficRoute = require('@/pages/api/admin/analytics/traffic');

const trafficGuard = (guardSpy.mock.calls[0] as any[])[0] as any;
guardSpy.mockRestore();

const getGaServerConfig = vi.spyOn(gaService, 'getGaServerConfig');
const fetchGaTrafficData = vi.spyOn(gaService, 'fetchGaTrafficData');
const fetchGaRealtime = vi.spyOn(gaService, 'fetchGaRealtimeActiveUsers');

const response = () => {
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};
const request = (query: Record<string, unknown> = {}) => ({
  method: 'GET',
  query,
  headers: {},
});

const GA_FIXTURE = {
  totals: {
    activeUsers: 100,
    newUsers: 10,
    sessions: 150,
    screenPageViews: 400,
    averageSessionDurationSeconds: 90,
    engagementRate: 0.5,
  },
  trend: [
    {
      date: getOTDayKey(),
      activeUsers: 100,
      sessions: 150,
      screenPageViews: 400,
    },
  ],
  topPages: [{ pagePath: '/', views: 300, users: 90 }],
  sources: [{ sessionSourceMedium: 'direct / none', sessions: 150 }],
  countries: [{ country: 'Germany', activeUsers: 80 }],
  devices: [{ deviceCategory: 'desktop', activeUsers: 90 }],
};

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  getGaServerConfig.mockReset().mockReturnValue(null);
  fetchGaTrafficData.mockReset();
  fetchGaRealtime.mockReset().mockResolvedValue(null);
  mockPrisma.consentTally.findMany.mockReset().mockResolvedValue([]);
});

describe('GET /api/admin/analytics/traffic guard', () => {
  it('is a GET behind VIEW_ANALYTICS with the admin rate limit and a days query schema', () => {
    expect(trafficGuard).toEqual(
      expect.objectContaining({
        methods: ['GET'],
        authMode: 'permission',
        requiredAnyPermissions: ['VIEW_ANALYTICS'],
        rateLimitProfile: 'admin',
      }),
    );
    expect(trafficGuard.querySchema).toBeDefined();
    expect(
      trafficGuard.querySchema.safeParse({ days: 31 }).success,
    ).toBeFalse();
    for (const days of [7, 30, 90, undefined]) {
      expect(
        trafficGuard.querySchema.safeParse(
          days === undefined ? {} : { days: String(days) },
        ).success,
      ).toBeTrue();
    }
  });
});

describe('GET /api/admin/analytics/traffic responses', () => {
  it('shows the not-configured state with variable names and still returns consent', async () => {
    const res = response();
    await trafficRoute.default(request(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.configured).toBeFalse();
    // Variable NAMES only — never values.
    expect(payload.envNames).toEqual([
      'NEXT_PUBLIC_GA_MEASUREMENT_ID',
      'GA_PROPERTY_ID',
      'GA_SERVICE_ACCOUNT_EMAIL',
      'GA_SERVICE_ACCOUNT_PRIVATE_KEY',
    ]);
    expect(payload.totals).toBeUndefined();
    expect(payload.trend).toBeUndefined();
    expect(payload.consent).toBeDefined();
    expect(fetchGaTrafficData).not.toHaveBeenCalled();
  });

  it('aggregates the consent tally per OT day with an opt-in rate', async () => {
    const today = getOTStartDate(0);
    const yesterday = getOTStartDate(-1);
    mockPrisma.consentTally.findMany.mockResolvedValue([
      { day: today, choice: 'granted', count: 3 },
      { day: today, choice: 'denied', count: 1 },
      { day: yesterday, choice: 'granted', count: 2 },
    ]);
    const res = response();
    await trafficRoute.default(request({ days: '7' }), res);
    const { consent } = res.json.mock.calls[0][0];
    expect(consent.totals).toEqual({ granted: 5, denied: 1 });
    expect(consent.optInRate).toBeCloseTo(5 / 6);
    expect(consent.trend).toHaveLength(7);
    // Trend runs oldest -> today; today is the last bucket.
    expect(consent.trend[6]).toEqual({
      date: getOTDayKey(today),
      granted: 3,
      denied: 1,
    });
    expect(consent.trend[5]).toEqual({
      date: getOTDayKey(yesterday),
      granted: 2,
      denied: 0,
    });
    expect(consent.trend[0]).toEqual({
      date: getOTDayKey(getOTStartDate(-6)),
      granted: 0,
      denied: 0,
    });
  });

  it('reports no opt-in rate while nobody has chosen anything', async () => {
    const res = response();
    await trafficRoute.default(request(), res);
    const { consent } = res.json.mock.calls[0][0];
    expect(consent.totals).toEqual({ granted: 0, denied: 0 });
    expect(consent.optInRate).toBeNull();
  });

  it('returns the GA block when configured', async () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-TEST123';
    getGaServerConfig.mockReturnValue({
      propertyId: '123',
      clientEmail: 'ga@example.iam.gserviceaccount.com',
      privateKey: '-----BEGIN PRIVATE KEY-----',
    });
    fetchGaTrafficData.mockResolvedValue(GA_FIXTURE as any);
    fetchGaRealtime.mockResolvedValue(17);
    const res = response();
    await trafficRoute.default(request({ days: '7' }), res);
    expect(fetchGaTrafficData).toHaveBeenCalledWith(7);
    const payload = res.json.mock.calls[0][0];
    expect(payload.configured).toBeTrue();
    expect(payload.totals).toEqual(GA_FIXTURE.totals);
    expect(payload.topPages).toEqual(GA_FIXTURE.topPages);
    expect(payload.realtimeActiveUsers).toBe(17);
  });

  it('keeps the consent block and flags gaError when Google fails', async () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-TEST123';
    getGaServerConfig.mockReturnValue({
      propertyId: '123',
      clientEmail: 'ga@example.iam.gserviceaccount.com',
      privateKey: '-----BEGIN PRIVATE KEY-----',
    });
    fetchGaTrafficData.mockRejectedValue(
      new gaService.GaDataError(
        'Google Analytics request failed',
        'ga_unavailable',
      ),
    );
    mockPrisma.consentTally.findMany.mockResolvedValue([
      { day: getOTStartDate(0), choice: 'granted', count: 2 },
    ]);
    const res = response();
    await trafficRoute.default(request(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.configured).toBeTrue();
    expect(payload.gaError).toBe('ga_unavailable');
    expect(payload.totals).toBeUndefined();
    expect(payload.consent.totals).toEqual({ granted: 2, denied: 0 });
  });

  it('survives a realtime failure with a null value', async () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-TEST123';
    getGaServerConfig.mockReturnValue({
      propertyId: '123',
      clientEmail: 'ga@example.iam.gserviceaccount.com',
      privateKey: '-----BEGIN PRIVATE KEY-----',
    });
    fetchGaTrafficData.mockResolvedValue(GA_FIXTURE as any);
    fetchGaRealtime.mockResolvedValue(null);
    const res = response();
    await trafficRoute.default(request(), res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.gaError).toBeUndefined();
    expect(payload.realtimeActiveUsers).toBeNull();
  });
});
