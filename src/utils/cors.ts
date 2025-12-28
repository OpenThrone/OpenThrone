export const DEFAULT_DASHBOARD_TEST_ORIGIN = 'https://dashboard-test.openthrone.dev';

export function parseOriginList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getRequestOrigin(req: { headers?: Record<string, any> } | undefined): string | null {
  const originHeader = req?.headers?.origin;
  if (typeof originHeader === 'string' && originHeader.trim()) return originHeader.trim();

  const refererHeader = req?.headers?.referer ?? req?.headers?.referrer;
  if (typeof refererHeader === 'string' && refererHeader.trim()) {
    try {
      return new URL(refererHeader).origin;
    } catch {
      return null;
    }
  }

  return null;
}

export function isOriginAllowed(origin: string | null | undefined, allowlist: string[]): boolean {
  if (!origin) return false;
  if (allowlist.includes('*')) return true;
  return allowlist.includes(origin);
}

export function setCorsHeaders(
  res: { setHeader: (name: string, value: string | string[]) => void; getHeader?: (name: string) => unknown },
  reqOrigin: string | null,
  allowlist: string[],
) {
  if (!reqOrigin || !isOriginAllowed(reqOrigin, allowlist)) return;

  res.setHeader('Access-Control-Allow-Origin', reqOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  const existingVary = typeof res.getHeader === 'function' ? res.getHeader('Vary') : undefined;
  const varyValue = (() => {
    if (!existingVary) return 'Origin';
    if (Array.isArray(existingVary)) return Array.from(new Set([...existingVary, 'Origin']));
    if (typeof existingVary === 'string') {
      const parts = existingVary
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      return Array.from(new Set([...parts, 'Origin'])).join(', ');
    }
    return 'Origin';
  })();

  res.setHeader('Vary', varyValue as any);
}

