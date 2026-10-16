import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { encode } from 'next-auth/jwt';
import { tmpdir } from 'os';
import path from 'path';

import prisma from '../src/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const puppeteer = require('../../../.bun/install/global/node_modules/puppeteer-core');

interface CaptureRecord {
  cycle: string;
  route: string;
  pathWithLocale: string;
  locale: string;
  viewport: string;
  width: number;
  height: number;
  screenshot: string;
  timestamp: string;
  final_url?: string;
  full_page: boolean;
  horizontal_overflow: boolean;
  scroll_width?: number;
  client_width?: number;
  overflowing_elements?: Array<{
    tag: string;
    id: string;
    className: string;
    right: number;
    width: number;
  }>;
  status: 'SUCCESS' | 'ERROR';
  errors: string[];
}

interface DomMetrics {
  scrollWidth: number;
  clientWidth: number;
  overflow: boolean;
  overflowingElements: Array<{
    tag: string;
    id: string;
    className: string;
    right: number;
    width: number;
  }>;
}

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

interface CaptureConfig {
  cycle: string;
  baseUrl: string;
  routes: string[];
  viewports: { name: string; width: number; height: number }[];
  locales: string[];
  outputDir: string;
}

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-1024', width: 1024, height: 768 },
  { name: 'mobile-390', width: 390, height: 844 },
];

/** Public routes captured before session cookies are installed. */
const UNAUTHENTICATED_ROUTES: Record<string, true> = {
  '/account/login': true,
  '/account/register': true,
};

async function createSessionToken(): Promise<{
  token: string;
  eraKey: string;
}> {
  const user = await prisma.users.findUnique({
    where: { id: 1 },
    include: { currentEra: true },
  });
  if (!user) throw new Error('User id 1 not found');
  const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  const token = {
    sub: '1',
    user: {
      id: 1,
      display_name: user.display_name,
      email: user.email,
      class: user.class,
      race: user.race,
      colorScheme: user.colorScheme || 'ELF',
      alliances: [],
    },
  };
  // Mirrors NewPlayerWalkthrough.getCompletionKey's era segment.
  const eraKey = String(
    user.currentEra?.id ?? user.currentEra?.name ?? 'current',
  );
  return { token: await encode({ token, secret }), eraKey };
}

function sanitizeRouteName(route: string): string {
  if (route === '/' || route === '') return 'root';
  return route.replace(/^\//, '').replace(/\//g, '__');
}

/** Installs pre-navigation guards: walkthrough dismissal + dev overlay removal. */
function installCaptureGuards(
  page: {
    evaluateOnNewDocument: (
      fn: (...args: unknown[]) => void,
      ...args: unknown[]
    ) => Promise<unknown>;
  },
  eraKeys: string[],
): Promise<unknown> {
  return page.evaluateOnNewDocument((keys: string[]) => {
    // Seed the walkthrough completion flag so the first-turn tour never
    // mounts, blurs, or dims authenticated captures.
    for (const eraKey of keys) {
      localStorage.setItem(`openthrone.walkthrough.completed.1.${eraKey}`, '1');
    }

    // Strip Next.js dev indicators (N badge, crosshair, FPS readout) so the
    // audit frames contain only product UI.
    const DEV_OVERLAY_SELECTOR = [
      'nextjs-portal',
      'nextjs-portal-anchor',
      'nextjs-viewport-badge',
      'nextjs-terminal',
      '[data-next-badge]',
      '[data-next-dev-tools-button]',
      '[data-nextjs-dev-tools-button]',
    ].join(',');
    const stripDevOverlays = () => {
      document
        .querySelectorAll(DEV_OVERLAY_SELECTOR)
        .forEach((el) => el.remove());
    };
    stripDevOverlays();
    const observer = new MutationObserver(stripDevOverlays);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }, eraKeys);
}

export async function runCapture(
  config: Partial<CaptureConfig> = {},
): Promise<CaptureRecord[]> {
  const cycle = config.cycle || 'cycle-01';
  const baseUrl = config.baseUrl || 'https://ot.aioxhost.com';
  const locales = config.locales || ['en', 'de'];
  const viewports = config.viewports || VIEWPORTS;
  const outputDir = path.resolve(
    process.cwd(),
    `.ui-audit/screenshots/${cycle}`,
  );
  mkdirSync(outputDir, { recursive: true });

  const { token: sessionToken, eraKey } = await createSessionToken();
  const domain = new URL(baseUrl).hostname;

  console.log(
    `Starting capture for ${cycle} at ${baseUrl} across ${locales.join(', ')} locales`,
  );

  // A fresh profile directory guarantees no React DevTools or other
  // extensions survive from the host profile; --disable-extensions alone
  // does not remove an inspector already attached to a reused context.
  const userDataDir = mkdtempSync(path.join(tmpdir(), `ot-audit-${cycle}-`));
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    headless: 'new',
    userDataDir,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      `--user-data-dir=${userDataDir}`,
    ],
  });

  const page = await browser.newPage();

  // Suppress the walkthrough modal and dev overlays on every navigation.
  await installCaptureGuards(page, [eraKey, 'current', '1', '2']);

  // Session cookies. Installed lazily so public auth routes render their
  // real content instead of redirecting to /home/overview.
  const sessionCookies = [
    {
      name: '__Secure-next-auth.session-token',
      value: sessionToken,
      domain,
      path: '/',
      secure: true,
      httpOnly: true,
    },
    {
      name: 'next-auth.session-token',
      value: sessionToken,
      domain,
      path: '/',
      secure: false,
      httpOnly: true,
    },
  ];
  let cookiesInstalled = false;

  const routeList = config.routes || [
    '/',
    '/about',
    '/how-to-play',
    '/account/login',
    '/account/register',
    '/community/news',
    '/community/stats',
    '/auto-recruit',
    '/home/overview',
    '/home/profile',
    '/home/levels',
    '/home/settings',
    '/structures/bank',
    '/structures/armory',
    '/structures/housing',
    '/structures/repair',
    '/structures/upgrades',
    '/battle/users',
    '/battle/training',
    '/battle/upgrades',
    '/battle/history',
    '/battle/battleSimulator',
    '/social/friends',
    '/social/requests',
    '/alliances',
    '/alliances/browse',
    '/alliances/create',
    '/messaging',
    '/home/admin/overview',
  ];

  const results: CaptureRecord[] = [];

  // Public auth routes first (captured logged-out), then everything else.
  const orderedRoutes = [
    ...routeList.filter((route) => UNAUTHENTICATED_ROUTES[route]),
    ...routeList.filter((route) => !UNAUTHENTICATED_ROUTES[route]),
  ];

  for (const route of orderedRoutes) {
    // Every authenticated route installs the session cookie on first use,
    // after the public auth routes have already been captured logged-out.
    if (!cookiesInstalled) {
      await page.setCookie(...sessionCookies);
      cookiesInstalled = true;
    }
    for (const locale of locales) {
      for (const vp of viewports) {
        await page.setViewport({ width: vp.width, height: vp.height });

        const pathWithLocale =
          locale === 'en' ? route : `/${locale}${route === '/' ? '' : route}`;
        const targetUrl = `${baseUrl}${pathWithLocale}`;
        const filename = `${cycle}__${sanitizeRouteName(route)}__${vp.name}__${locale}.png`;
        const filePath = path.join(outputDir, filename);

        // Mobile viewports capture the full page so below-the-fold content
        // is observable; desktop/tablet stay viewport-only.
        const fullPage = vp.width <= 500;

        const record: CaptureRecord = {
          cycle,
          route,
          pathWithLocale,
          locale,
          viewport: vp.name,
          width: vp.width,
          height: vp.height,
          screenshot: `.ui-audit/screenshots/${cycle}/${filename}`,
          timestamp: new Date().toISOString(),
          final_url: undefined,
          full_page: fullPage,
          horizontal_overflow: false,
          status: 'SUCCESS',
          errors: [],
        };

        try {
          console.log(`[Capturing] ${targetUrl} @ ${vp.name} (${locale})...`);
          await page.goto(targetUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          await delay(1500);
          // Post-redirect URL: proves locale-preserving redirects on routes
          // like /de/structures/bank that would otherwise silently 307 to /.
          record.final_url = page.url();

          // Run DOM layout checks
          const domMetrics = (await page.evaluate(() => {
            const { body } = document;
            const html = document.documentElement;
            const scrollWidth = Math.max(
              body.scrollWidth,
              body.offsetWidth,
              html.clientWidth,
              html.scrollWidth,
              html.offsetWidth,
            );
            const clientWidth = window.innerWidth;
            const overflow = scrollWidth > clientWidth + 2;

            const overflowingElements: Array<{
              tag: string;
              id: string;
              className: string;
              right: number;
              width: number;
            }> = [];
            document.querySelectorAll('*').forEach((el) => {
              const rect = el.getBoundingClientRect();
              if (
                rect.right > window.innerWidth + 5 &&
                rect.width > 0 &&
                rect.height > 0
              ) {
                const style = window.getComputedStyle(el);
                if (
                  style.display !== 'none' &&
                  style.visibility !== 'hidden' &&
                  style.opacity !== '0'
                ) {
                  overflowingElements.push({
                    tag: el.tagName.toLowerCase(),
                    id: el.id || '',
                    className:
                      el.className && typeof el.className === 'string'
                        ? el.className.slice(0, 100)
                        : '',
                    right: Math.round(rect.right),
                    width: Math.round(rect.width),
                  });
                }
              }
            });

            return {
              scrollWidth,
              clientWidth,
              overflow,
              overflowingElements: overflowingElements.slice(0, 5),
            };
          })) as DomMetrics;

          record.horizontal_overflow = domMetrics.overflow;
          record.scroll_width = domMetrics.scrollWidth;
          record.client_width = domMetrics.clientWidth;
          record.overflowing_elements = domMetrics.overflowingElements;

          // Capture screenshot
          await page.screenshot({ path: filePath, fullPage });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`Error on ${targetUrl}:`, message);
          record.status = 'ERROR';
          record.errors.push(message);
        }

        results.push(record);
      }
    }
  }

  await browser.close();
  rmSync(userDataDir, { recursive: true, force: true });

  const manifestPath = path.resolve(
    process.cwd(),
    `.ui-audit/capture-${cycle}.json`,
  );
  writeFileSync(manifestPath, JSON.stringify(results, null, 2));
  console.log(
    `Capture complete! Saved ${results.length} captures. Manifest written to ${manifestPath}`,
  );
  return results;
}

if (import.meta.main) {
  runCapture().catch(console.error);
}
