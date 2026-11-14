import { createSign } from 'node:crypto';

import { logError } from '@/utils/logger';
import { getOTDayKey, getOTStartDate } from '@/utils/timefunctions';

/**
 * Google Analytics Data API (GA4) client for the admin traffic page.
 *
 * Talks to `analyticsdata.googleapis.com` over plain fetch with a
 * service-account JWT (RS256) signed with node:crypto — no `googleapis` or
 * `google-auth-library` dependency. The service-account key is never logged
 * and never returned to the client.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DATA_API_ROOT = 'https://analyticsdata.googleapis.com/v1beta';
const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const REQUEST_TIMEOUT_MS = 10_000;
const REPORT_CACHE_TTL_MS = 5 * 60 * 1000;
const TOKEN_LIFETIME_SECONDS = 3600;
/** Refresh the token a little before it actually expires. */
const TOKEN_EARLY_REFRESH_MS = 60_000;
const MAX_REPORTS_PER_BATCH = 5;

export class GaDataError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'GaDataError';
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface GaServerConfig {
  propertyId: string;
  clientEmail: string;
  privateKey: string;
}

interface GaEnvLike {
  GA_PROPERTY_ID?: string;
  GA_SERVICE_ACCOUNT_EMAIL?: string;
  GA_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
  // Index signature so `process.env` satisfies this without a cast.
  [key: string]: string | undefined;
}

/** Accepts PEM keys whose newlines were flattened to literal `\n`. */
export function normalizeGaPrivateKey(raw: string): string {
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

/**
 * All server variables present, or null. The property id must be numeric
 * (GA4 Data API property ids are digits only).
 */
export function getGaServerConfig(
  env: GaEnvLike = process.env,
): GaServerConfig | null {
  const propertyId = env.GA_PROPERTY_ID?.trim();
  const clientEmail = env.GA_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKeyRaw = env.GA_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!propertyId || !clientEmail || !privateKeyRaw) return null;
  if (!/^\d+$/.test(propertyId)) return null;
  const privateKey = normalizeGaPrivateKey(privateKeyRaw.trim());
  if (!privateKey.includes('PRIVATE KEY')) return null;
  return { propertyId, clientEmail, privateKey };
}

/** The environment variable names the setup state lists (never values). */
export const GA_SERVER_ENV_NAMES = [
  'NEXT_PUBLIC_GA_MEASUREMENT_ID',
  'GA_PROPERTY_ID',
  'GA_SERVICE_ACCOUNT_EMAIL',
  'GA_SERVICE_ACCOUNT_PRIVATE_KEY',
] as const;

// ---------------------------------------------------------------------------
// Service-account JWT
// ---------------------------------------------------------------------------

export interface GaJwtClaims {
  iss: string;
  scope: string;
  aud: string;
  iat: number;
  exp: number;
}

/** Pure claim builder; `exp` stays inside the standard 1-hour bound. */
export function buildGaJwtClaims(options: {
  clientEmail: string;
  nowMs?: number;
  lifetimeSeconds?: number;
}): GaJwtClaims {
  const lifetime = Math.min(
    options.lifetimeSeconds ?? TOKEN_LIFETIME_SECONDS,
    TOKEN_LIFETIME_SECONDS,
  );
  const iat = Math.floor((options.nowMs ?? Date.now()) / 1000);
  return {
    iss: options.clientEmail,
    scope: GA_SCOPE,
    aud: TOKEN_URL,
    iat,
    exp: iat + lifetime,
  };
}

const base64urlJson = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/** Signs the JWT with RS256; the key never leaves this function. */
export function buildSignedGaJwt(
  claims: GaJwtClaims,
  privateKeyPem: string,
): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const unsigned = `${base64urlJson(header)}.${base64urlJson(claims)}`;
  const signature = createSign('RSA-SHA256')
    .update(unsigned)
    .sign(privateKeyPem, 'base64url');
  return `${unsigned}.${signature}`;
}

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCacheEntry | null = null;

async function getAccessToken(config: GaServerConfig): Promise<string> {
  if (
    tokenCache &&
    tokenCache.expiresAt > Date.now() + TOKEN_EARLY_REFRESH_MS
  ) {
    return tokenCache.token;
  }
  const claims = buildGaJwtClaims({ clientEmail: config.clientEmail });
  const assertion = buildSignedGaJwt(claims, config.privateKey);
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // Never include the assertion or the key in logs.
    logError('GA token request failed:', (error as Error)?.message);
    throw new GaDataError('Google authentication unavailable', 'ga_auth');
  }
  if (!response.ok) {
    logError('GA token request rejected:', response.status);
    throw new GaDataError('Google authentication rejected', 'ga_auth');
  }
  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return tokenCache.token;
}

// ---------------------------------------------------------------------------
// Report types and pure mapping
// ---------------------------------------------------------------------------

export interface GaTotals {
  activeUsers: number;
  newUsers: number;
  sessions: number;
  screenPageViews: number;
  averageSessionDurationSeconds: number;
  engagementRate: number;
}

export interface GaTrendPoint {
  date: string;
  activeUsers: number;
  sessions: number;
  screenPageViews: number;
}

export interface GaTopPage {
  pagePath: string;
  views: number;
  users: number;
}

export interface GaSource {
  sessionSourceMedium: string;
  sessions: number;
}

export interface GaCountry {
  country: string;
  activeUsers: number;
}

export interface GaDevice {
  deviceCategory: string;
  activeUsers: number;
}

export interface GaTrafficData {
  totals: GaTotals;
  trend: GaTrendPoint[];
  topPages: GaTopPage[];
  sources: GaSource[];
  countries: GaCountry[];
  devices: GaDevice[];
}

/** GA reports arrive as `GA4 date` = YYYYMMDD; make it ISO for the UI. */
export function gaDateToDayKey(value: string): string {
  return value.length === 8
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value;
}

/** GA sends every metric as a string; convert defensively. */
export function toGaNumber(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

interface GaReport {
  dimensionHeaders?: Array<{ name?: string }>;
  metricHeaders?: Array<{ name?: string }>;
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
}

function metricValues(
  report: GaReport,
  row: NonNullable<GaReport['rows']>[number],
  name: string,
): number {
  const index =
    report.metricHeaders?.findIndex((header) => header.name === name) ?? -1;
  if (index < 0) return 0;
  return toGaNumber(row.metricValues?.[index]?.value);
}

const emptyTotals = (): GaTotals => ({
  activeUsers: 0,
  newUsers: 0,
  sessions: 0,
  screenPageViews: 0,
  averageSessionDurationSeconds: 0,
  engagementRate: 0,
});

/** Page field name -> GA metric name (they differ for duration). */
const TOTALS_METRIC_NAMES: Record<keyof GaTotals, string> = {
  activeUsers: 'activeUsers',
  newUsers: 'newUsers',
  sessions: 'sessions',
  screenPageViews: 'screenPageViews',
  averageSessionDurationSeconds: 'averageSessionDuration',
  engagementRate: 'engagementRate',
};

/** Maps the no-dimension totals report; missing rows stay zero. */
export function mapGaTotals(report: GaReport): GaTotals {
  const totals = emptyTotals();
  const row = report.rows?.[0];
  if (!row) return totals;
  for (const key of Object.keys(totals) as Array<keyof GaTotals>) {
    totals[key] = metricValues(report, row, TOTALS_METRIC_NAMES[key]);
  }
  return totals;
}

/** Maps the per-day report, zero-filling days GA did not return. */
export function mapGaTrend(
  report: GaReport,
  dayKeys: string[],
): GaTrendPoint[] {
  const byDay = new Map<string, GaTrendPoint>();
  for (const row of report.rows ?? []) {
    const day = gaDateToDayKey(row.dimensionValues?.[0]?.value ?? '');
    byDay.set(day, {
      date: day,
      activeUsers: metricValues(report, row, 'activeUsers'),
      sessions: metricValues(report, row, 'sessions'),
      screenPageViews: metricValues(report, row, 'screenPageViews'),
    });
  }
  return dayKeys.map(
    (day) =>
      byDay.get(day) ?? {
        date: day,
        activeUsers: 0,
        sessions: 0,
        screenPageViews: 0,
      },
  );
}

/** Maps a one-dimension report to `{ label, values }` rows in order. */
export function mapGaDimensionReport(
  report: GaReport,
  metrics: string[],
): Array<{ label: string; values: number[] }> {
  return (report.rows ?? []).map((row) => ({
    label: row.dimensionValues?.[0]?.value ?? '',
    values: metrics.map((name) => metricValues(report, row, name)),
  }));
}

export function mapGaTopPages(report: GaReport): GaTopPage[] {
  return mapGaDimensionReport(report, ['screenPageViews', 'activeUsers']).map(
    (row) => ({
      pagePath: row.label,
      views: row.values[0],
      users: row.values[1],
    }),
  );
}

export function mapGaSources(report: GaReport): GaSource[] {
  return mapGaDimensionReport(report, ['sessions']).map((row) => ({
    sessionSourceMedium: row.label,
    sessions: row.values[0],
  }));
}

export function mapGaCountries(report: GaReport): GaCountry[] {
  return mapGaDimensionReport(report, ['activeUsers']).map((row) => ({
    country: row.label,
    activeUsers: row.values[0],
  }));
}

export function mapGaDevices(report: GaReport): GaDevice[] {
  return mapGaDimensionReport(report, ['activeUsers']).map((row) => ({
    deviceCategory: row.label,
    activeUsers: row.values[0],
  }));
}

/** Active users in the last 30 minutes, or null when the call fails. */
export function mapGaRealtime(report: GaReport): number | null {
  const row = report.rows?.[0];
  if (!row) return 0;
  return metricValues(report, row, 'activeUsers');
}

// ---------------------------------------------------------------------------
// Report requests
// ---------------------------------------------------------------------------

interface RunReportRequest {
  dateRanges: Array<{ startDate: string; endDate: string }>;
  dimensions?: Array<{ name: string }>;
  metrics: Array<{ name: string }>;
  limit?: number;
  orderBys?: Array<{ metric: { metricName: string }; desc: boolean }>;
}

export function buildGaDateRange(
  days: number,
  now: Date = new Date(),
): { startDate: string; endDate: string; dayKeys: string[] } {
  const since = getOTStartDate(-(days - 1), now);
  const dayKeys = Array.from({ length: days }, (_, offset) =>
    getOTDayKey(getOTStartDate(offset, since)),
  );
  return {
    startDate: dayKeys[0],
    endDate: dayKeys[dayKeys.length - 1],
    dayKeys,
  };
}

/** The six reports the traffic page needs, in a fixed order. */
export function buildGaReportRequests(range: {
  startDate: string;
  endDate: string;
}): RunReportRequest[] {
  const dateRanges = [{ startDate: range.startDate, endDate: range.endDate }];
  return [
    {
      dateRanges,
      metrics: [
        { name: 'activeUsers' },
        { name: 'newUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'averageSessionDuration' },
        { name: 'engagementRate' },
      ],
    },
    {
      dateRanges,
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
      ],
    },
    {
      dateRanges,
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
      limit: 15,
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    },
    {
      dateRanges,
      dimensions: [{ name: 'sessionSourceMedium' }],
      metrics: [{ name: 'sessions' }],
      limit: 10,
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    },
    {
      dateRanges,
      dimensions: [{ name: 'country' }],
      metrics: [{ name: 'activeUsers' }],
      limit: 10,
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
    },
    {
      dateRanges,
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'activeUsers' }],
    },
  ];
}

interface ReportCacheEntry {
  expiresAt: number;
  data: GaTrafficData;
}

const reportCache = new Map<string, ReportCacheEntry>();

async function postGa(
  path: string,
  body: unknown,
  accessToken: string,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${DATA_API_ROOT}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    logError(`GA request failed (${path}):`, (error as Error)?.message);
    throw new GaDataError('Google Analytics request failed', 'ga_unavailable');
  }
  if (!response.ok) {
    // Body text is Google's own error message; it holds no secrets.
    const detail = await response.text().catch(() => '');
    logError(`GA request rejected (${path}):`, response.status, detail);
    throw new GaDataError(
      'Google Analytics rejected the request',
      'ga_rejected',
    );
  }
  return (await response.json()) as Record<string, unknown>;
}

/**
 * Runs all six traffic reports (two batched calls; the API caps a batch at
 * five), maps them and returns the page data. Responses are cached in memory
 * for five minutes per range so several staff viewing the page share one
 * quota hit.
 */
export async function fetchGaTrafficData(
  days: number,
  options: { now?: Date; skipCache?: boolean } = {},
): Promise<GaTrafficData> {
  const config = getGaServerConfig();
  if (!config)
    throw new GaDataError(
      'Google Analytics is not configured',
      'ga_not_configured',
    );
  const cacheKey = `${config.propertyId}:${days}`;
  const cached = reportCache.get(cacheKey);
  if (!options.skipCache && cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const range = buildGaDateRange(days, options.now);
  const requests = buildGaReportRequests(range);
  const batches: RunReportRequest[][] = [];
  for (let i = 0; i < requests.length; i += MAX_REPORTS_PER_BATCH) {
    batches.push(requests.slice(i, i + MAX_REPORTS_PER_BATCH));
  }
  const accessToken = await getAccessToken(config);
  const reports: GaReport[] = [];
  for (const batch of batches) {
    const payload = await postGa(
      `/properties/${config.propertyId}:batchRunReports`,
      { requests: batch },
      accessToken,
    );
    for (const report of (payload.reports as GaReport[]) ?? []) {
      reports.push(report);
    }
  }
  if (reports.length !== requests.length) {
    logError(
      'GA returned an unexpected report count:',
      reports.length,
      requests.length,
    );
    throw new GaDataError(
      'Unexpected Google Analytics response',
      'ga_bad_response',
    );
  }
  const [totals, trend, topPages, sources, countries, devices] = reports;
  const data: GaTrafficData = {
    totals: mapGaTotals(totals),
    trend: mapGaTrend(trend, range.dayKeys),
    topPages: mapGaTopPages(topPages),
    sources: mapGaSources(sources),
    countries: mapGaCountries(countries),
    devices: mapGaDevices(devices),
  };
  reportCache.set(cacheKey, {
    expiresAt: Date.now() + REPORT_CACHE_TTL_MS,
    data,
  });
  return data;
}

/**
 * The realtime request for "active in the last 30 minutes". GA counts minutes
 * back from now, so the window starts 29 minutes ago and ends now (0): the
 * start must be the larger number, or GA rejects it with INVALID_ARGUMENT.
 */
export function buildGaRealtimeRequest() {
  return {
    metrics: [{ name: 'activeUsers' }],
    minuteRanges: [{ name: 'last30', startMinutesAgo: 29, endMinutesAgo: 0 }],
  };
}

/** Realtime active users (last 30 minutes); null when the call fails. */
export async function fetchGaRealtimeActiveUsers(): Promise<number | null> {
  const config = getGaServerConfig();
  if (!config) return null;
  try {
    const accessToken = await getAccessToken(config);
    const payload = await postGa(
      `/properties/${config.propertyId}:runRealtimeReport`,
      buildGaRealtimeRequest(),
      accessToken,
    );
    return mapGaRealtime(payload as unknown as GaReport);
  } catch (error) {
    logError('GA realtime report failed:', (error as Error)?.message);
    return null;
  }
}
