import { describe, expect, it } from 'bun:test';

import {
  buildGaDateRange,
  buildGaJwtClaims,
  buildGaRealtimeRequest,
  buildGaReportRequests,
  gaDateToDayKey,
  getGaServerConfig,
  mapGaCountries,
  mapGaDevices,
  mapGaRealtime,
  mapGaSources,
  mapGaTopPages,
  mapGaTotals,
  mapGaTrend,
  normalizeGaPrivateKey,
  toGaNumber,
} from '@/services/analytics/GoogleAnalyticsData.service';

describe('getGaServerConfig (not-configured detection)', () => {
  it('is null until every server variable is present and well-formed', () => {
    expect(getGaServerConfig({})).toBeNull();
    expect(
      getGaServerConfig({
        GA_PROPERTY_ID: '123456789',
        GA_SERVICE_ACCOUNT_EMAIL: 'ga@project.iam.gserviceaccount.com',
      }),
    ).toBeNull();
    expect(
      getGaServerConfig({
        GA_PROPERTY_ID: 'not-numeric',
        GA_SERVICE_ACCOUNT_EMAIL: 'ga@project.iam.gserviceaccount.com',
        GA_SERVICE_ACCOUNT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----x',
      }),
    ).toBeNull();
    expect(
      getGaServerConfig({
        GA_PROPERTY_ID: '123456789',
        GA_SERVICE_ACCOUNT_EMAIL: 'ga@project.iam.gserviceaccount.com',
        GA_SERVICE_ACCOUNT_PRIVATE_KEY: 'no key material here',
      }),
    ).toBeNull();
  });

  it('accepts numeric property ids and PEM keys with literal \\n', () => {
    const config = getGaServerConfig({
      GA_PROPERTY_ID: ' 123456789 ',
      GA_SERVICE_ACCOUNT_EMAIL: ' ga@project.iam.gserviceaccount.com ',
      GA_SERVICE_ACCOUNT_PRIVATE_KEY:
        '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
    });
    expect(config).toEqual({
      propertyId: '123456789',
      clientEmail: 'ga@project.iam.gserviceaccount.com',
      privateKey:
        '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
    });
    expect(normalizeGaPrivateKey('a\\nb')).toBe('a\nb');
    expect(normalizeGaPrivateKey('a\nb')).toBe('a\nb');
  });
});

describe('buildGaJwtClaims', () => {
  it('builds the service-account claims with the analytics readonly scope', () => {
    const nowMs = Date.UTC(2026, 10, 10, 12, 0, 0); // 2026-11-10T12:00:00Z
    const iat = Math.floor(nowMs / 1000);
    const claims = buildGaJwtClaims({
      clientEmail: 'ga@project.iam.gserviceaccount.com',
      nowMs,
      lifetimeSeconds: 3600,
    });
    expect(claims).toEqual({
      iss: 'ga@project.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat,
      exp: iat + 3600,
    });
  });

  it('caps the lifetime at one hour', () => {
    const claims = buildGaJwtClaims({
      clientEmail: 'ga@example.iam.gserviceaccount.com',
      nowMs: 0,
      lifetimeSeconds: 999_999,
    });
    expect(claims.exp - claims.iat).toBe(3600);
  });
});

describe('GA response mapping', () => {
  it('converts GA dates and string metrics safely', () => {
    expect(gaDateToDayKey('20261101')).toBe('2026-11-01');
    expect(toGaNumber('123')).toBe(123);
    expect(toGaNumber('12.5')).toBe(12.5);
    expect(toGaNumber('not-a-number')).toBe(0);
    expect(toGaNumber(undefined)).toBe(0);
  });

  it('maps the totals report, GA sending numbers as strings', () => {
    const totalsFixture = {
      dimensionHeaders: [],
      metricHeaders: [
        { name: 'activeUsers' },
        { name: 'newUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'averageSessionDuration' },
        { name: 'engagementRate' },
      ],
      rows: [
        {
          dimensionValues: [],
          metricValues: [
            { value: '4213' },
            { value: '312' },
            { value: '5890' },
            { value: '15332' },
            { value: '184.27' },
            { value: '0.6234' },
          ],
        },
      ],
    };
    expect(mapGaTotals(totalsFixture)).toEqual({
      activeUsers: 4213,
      newUsers: 312,
      sessions: 5890,
      screenPageViews: 15332,
      averageSessionDurationSeconds: 184.27,
      engagementRate: 0.6234,
    });
  });

  it('maps totals to zero when GA returns no rows', () => {
    expect(mapGaTotals({ dimensionHeaders: [], metricHeaders: [] })).toEqual({
      activeUsers: 0,
      newUsers: 0,
      sessions: 0,
      screenPageViews: 0,
      averageSessionDurationSeconds: 0,
      engagementRate: 0,
    });
  });

  it('maps the per-day trend and zero-fills missing days', () => {
    const trendFixture = {
      dimensionHeaders: [{ name: 'date' }],
      metricHeaders: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
      ],
      rows: [
        {
          dimensionValues: [{ value: '20261108' }],
          metricValues: [{ value: '90' }, { value: '120' }, { value: '300' }],
        },
        {
          dimensionValues: [{ value: '20261110' }],
          metricValues: [{ value: '45' }, { value: '60' }, { value: '150' }],
        },
      ],
    };
    expect(
      mapGaTrend(trendFixture, ['2026-11-08', '2026-11-09', '2026-11-10']),
    ).toEqual([
      {
        date: '2026-11-08',
        activeUsers: 90,
        sessions: 120,
        screenPageViews: 300,
      },
      { date: '2026-11-09', activeUsers: 0, sessions: 0, screenPageViews: 0 },
      {
        date: '2026-11-10',
        activeUsers: 45,
        sessions: 60,
        screenPageViews: 150,
      },
    ]);
  });

  it('maps top pages, sources, countries and devices', () => {
    const pagesFixture = {
      dimensionHeaders: [{ name: 'pagePath' }],
      metricHeaders: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
      rows: [
        {
          dimensionValues: [{ value: '/home/overview' }],
          metricValues: [{ value: '812' }, { value: '400' }],
        },
        {
          dimensionValues: [{ value: '/userprofile/[id]' }],
          metricValues: [{ value: '150' }, { value: '90' }],
        },
      ],
    };
    expect(mapGaTopPages(pagesFixture)).toEqual([
      { pagePath: '/home/overview', views: 812, users: 400 },
      { pagePath: '/userprofile/[id]', views: 150, users: 90 },
    ]);

    const sourcesFixture = {
      dimensionHeaders: [{ name: 'sessionSourceMedium' }],
      metricHeaders: [{ name: 'sessions' }],
      rows: [
        {
          dimensionValues: [{ value: 'google / organic' }],
          metricValues: [{ value: '310' }],
        },
      ],
    };
    expect(mapGaSources(sourcesFixture)).toEqual([
      { sessionSourceMedium: 'google / organic', sessions: 310 },
    ]);

    const countriesFixture = {
      dimensionHeaders: [{ name: 'country' }],
      metricHeaders: [{ name: 'activeUsers' }],
      rows: [
        {
          dimensionValues: [{ value: 'Germany' }],
          metricValues: [{ value: '712' }],
        },
      ],
    };
    expect(mapGaCountries(countriesFixture)).toEqual([
      { country: 'Germany', activeUsers: 712 },
    ]);

    const devicesFixture = {
      dimensionHeaders: [{ name: 'deviceCategory' }],
      metricHeaders: [{ name: 'activeUsers' }],
      rows: [
        {
          dimensionValues: [{ value: 'desktop' }],
          metricValues: [{ value: '600' }],
        },
      ],
    };
    expect(mapGaDevices(devicesFixture)).toEqual([
      { deviceCategory: 'desktop', activeUsers: 600 },
    ]);
  });

  it('asks for the last 30 minutes with the start further back than the end', () => {
    const [range] = buildGaRealtimeRequest().minuteRanges;
    // GA rejects a window whose endMinutesAgo exceeds startMinutesAgo.
    expect(range.startMinutesAgo).toBeGreaterThanOrEqual(range.endMinutesAgo);
    expect(range).toMatchObject({ startMinutesAgo: 29, endMinutesAgo: 0 });
  });

  it('maps realtime active users, including the empty answer', () => {
    const realtimeFixture = {
      metricHeaders: [{ name: 'activeUsers' }],
      rows: [{ dimensionValues: [], metricValues: [{ value: '17' }] }],
    };
    expect(mapGaRealtime(realtimeFixture)).toBe(17);
    expect(mapGaRealtime({ metricHeaders: [{ name: 'activeUsers' }] })).toBe(0);
  });
});

describe('report request builders', () => {
  it('builds an OT-day range with contiguous day keys', () => {
    const range = buildGaDateRange(
      3,
      new Date('2026-11-10T14:00:00-05:00'), // 19:00 UTC, still OT day 2026-11-10
    );
    expect(range.startDate).toBe('2026-11-08');
    expect(range.endDate).toBe('2026-11-10');
    expect(range.dayKeys).toEqual(['2026-11-08', '2026-11-09', '2026-11-10']);
  });

  it('requests the six reports in the order the page maps them', () => {
    const requests = buildGaReportRequests({
      startDate: '2026-11-01',
      endDate: '2026-11-10',
    });
    expect(requests).toHaveLength(6);
    expect(requests[0].metrics.map((m) => m.name)).toEqual([
      'activeUsers',
      'newUsers',
      'sessions',
      'screenPageViews',
      'averageSessionDuration',
      'engagementRate',
    ]);
    expect(requests[1].dimensions).toEqual([{ name: 'date' }]);
    expect(requests[2].limit).toBe(15);
    expect(requests[2].orderBys).toEqual([
      { metric: { metricName: 'screenPageViews' }, desc: true },
    ]);
    expect(requests[3].dimensions).toEqual([{ name: 'sessionSourceMedium' }]);
    expect(requests[3].limit).toBe(10);
    expect(requests[4].dimensions).toEqual([{ name: 'country' }]);
    expect(requests[5].dimensions).toEqual([{ name: 'deviceCategory' }]);
    for (const request of requests) {
      expect(request.dateRanges).toEqual([
        { startDate: '2026-11-01', endDate: '2026-11-10' },
      ]);
    }
  });
});
