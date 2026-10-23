#!/usr/bin/env bun
/**
 * Extract layer trees from the live site for the FigCraft design file.
 *
 *   bun run design:extract [--base https://alpha.openthrone.dev] [--only home,overview]
 *                          [--public-only | --game-only] [--creds <file>]
 *
 * Logged-in pages need a disposable alpha test account: OT_DESIGN_EMAIL and
 * OT_DESIGN_PASSWORD, or --creds pointing at a JSON file ({ email, password }, or the
 * alpha harness format { users: [{ email }], pw }). Credentials are never printed.
 * Writes design/exports/{dom,assets,screens}. See design/README.md.
 */
import { spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { homedir } from 'os';
import path from 'path';

import { snapshotPage } from './page-snapshot';
import { type DesignPage, GAME_PAGES, PUBLIC_PAGES, VIEWPORT } from './pages';

// Same browser setup as scripts/capture-audit.ts: puppeteer-core installed with `bun add -g`.
// eslint-disable-next-line import/no-dynamic-require -- the global install path is per machine
const puppeteer = require(
  process.env.PUPPETEER_CORE_PATH ??
    path.join(homedir(), '.bun/install/global/node_modules/puppeteer-core'),
);
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/chromium-browser';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const BASE = (arg('base') ?? 'https://alpha.openthrone.dev').replace(/\/$/, '');
const OUT = path.resolve(arg('out') ?? 'design/exports');
const ONLY = arg('only')?.split(',') ?? null;
const ASSETS = path.join(OUT, 'assets');
const RUN_ID = randomUUID();
const MANIFEST = path.join(OUT, 'manifest.json');
const HIDE_DEV = 'nextjs-portal{display:none!important}';

// Production is never a design source: it would run logged-in automation against real players.
const host = new URL(BASE).hostname;
if (host === 'openthrone.dev' || host === 'www.openthrone.dev') {
  console.error(
    `Refusing to extract from production (${host}). Use alpha or a local dev server.`,
  );
  process.exit(1);
}

const loadCreds = (): { email: string; password: string } | null => {
  if (process.env.OT_DESIGN_EMAIL && process.env.OT_DESIGN_PASSWORD) {
    return {
      email: process.env.OT_DESIGN_EMAIL,
      password: process.env.OT_DESIGN_PASSWORD,
    };
  }
  const file = arg('creds');
  if (!file) return null;
  const c = JSON.parse(readFileSync(file, 'utf8'));
  if (c.email && c.password) return { email: c.email, password: c.password };
  if (c.users?.[0]?.email && c.pw)
    return { email: c.users[0].email, password: c.pw };
  throw new Error(`Unrecognised credentials file format: ${file}`);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const urlsIn = (node: any, acc: Set<string>): Set<string> => {
  if (!node || node.t === 'text') return acc;
  if (node.src) acc.add(node.src);
  for (const m of (node.bgImage || '').matchAll(/url\("?([^")]+)"?\)/g))
    acc.add(m[1]);
  for (const k of node.kids || []) urlsIn(k, acc);
  return acc;
};

const EXT: [string, string][] = [
  ['png', 'png'],
  ['jpeg', 'jpg'],
  ['jpg', 'jpg'],
  ['webp', 'webp'],
  ['gif', 'gif'],
  ['svg', 'svg'],
  ['avif', 'avif'],
];

// Download every image the tree references; SVG and AVIF become PNG (FigCraft can't place them).
const fetchAssets = async (tree: any): Promise<Record<string, string>> => {
  const urls = urlsIn(tree.root, new Set());
  for (const m of (tree.htmlBgImage || '').matchAll(/url\("?([^")]+)"?\)/g))
    urls.add(m[1]);
  const map: Record<string, string> = {};
  for (const u of urls) {
    if (u.startsWith('data:') && !u.startsWith('data:image/')) continue;
    const key = createHash('sha1').update(u).digest('hex').slice(0, 16);
    const existing = readdirSync(ASSETS).find((f) => f.startsWith(`${key}.`));
    if (existing) {
      map[u] = path.join(ASSETS, existing);
      continue;
    }
    try {
      let buf: Buffer;
      let type: string;
      if (u.startsWith('data:')) {
        const [meta, data] = u.slice(5).split(',');
        [type] = meta.split(';');
        buf = meta.includes('base64')
          ? Buffer.from(data, 'base64')
          : Buffer.from(decodeURIComponent(data));
      } else {
        const res = await fetch(u, {
          headers: { Accept: 'image/webp,image/png,image/jpeg,*/*' },
        });
        if (!res.ok) {
          console.log(`  asset ${res.status}: ${u.slice(0, 90)}`);
          continue;
        }
        buf = Buffer.from(await res.arrayBuffer());
        type = res.headers.get('content-type') ?? '';
      }
      const ext = EXT.find(([needle]) => type.includes(needle))?.[1] ?? 'bin';
      let file = path.join(ASSETS, `${key}.${ext}`);
      writeFileSync(file, buf);
      if (ext === 'svg' || ext === 'avif' || ext === 'bin') {
        const png = path.join(ASSETS, `${key}.png`);
        const conv = spawnSync('magick', [
          '-background',
          'none',
          '-density',
          '192',
          file,
          png,
        ]);
        unlinkSync(file);
        if (conv.status !== 0) {
          console.log(`  could not convert ${u.slice(0, 90)}`);
          continue;
        }
        file = png;
      }
      map[u] = file;
    } catch (e) {
      console.log(
        `  asset error ${String((e as Error).message).split('\n')[0]}: ${u.slice(0, 90)}`,
      );
    }
  }
  return map;
};

// FigCraft has no colour-emoji support: render emoji-only text to transparent PNGs.
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const isEmojiOnly = (t: string) =>
  EMOJI.test(t) &&
  [...t].every(
    (ch) => EMOJI.test(ch) || /\s/.test(ch) || ch === '‍' || ch === '️',
  );

const renderEmoji = async (browser: any, tree: any) => {
  const items: any[] = [];
  const walk = (n: any) => {
    if (!n) return;
    if (n.t === 'text') {
      if (isEmojiOnly(n.text)) items.push(n);
      return;
    }
    for (const k of n.kids || []) walk(k);
  };
  walk(tree.root);
  if (!items.length) return;
  const page = await browser.newPage();
  for (const it of items) {
    const key = createHash('sha1')
      .update(`${it.text}|${it.style.size}`)
      .digest('hex')
      .slice(0, 16);
    const file = path.join(ASSETS, `emoji-${key}.png`);
    if (!existsSync(file)) {
      await page.setContent(
        `<html><body style="margin:0;background:transparent"><span id="e" style="font-size:${it.style.size * 2}px;line-height:1;font-family:'Noto Color Emoji',sans-serif">${it.text}</span></body></html>`,
      );
      const el = await page.$('#e');
      await el.screenshot({ path: file, omitBackground: true });
    }
    it.img = file;
  }
  await page.close();
};

const preparePage = async (page: any) => {
  await page.setViewport(VIEWPORT);
  page.setDefaultTimeout(60000);
  // Dev-only overlays (react-scan toolbar, Next.js badge) are not part of the design.
  await page.setRequestInterception(true);
  page.on('request', (req: any) =>
    req.url().includes('react-scan') ? req.abort() : req.continue(),
  );
  await page.evaluateOnNewDocument((css: string) => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
    });
  }, HIDE_DEV);
};

const capture = async (browser: any, page: any, key: string, p: DesignPage) => {
  if (ONLY && !ONLY.includes(p.name)) return;
  try {
    const expected = new URL(BASE + p.url);
    const response = await page.goto(expected.href, { waitUntil: 'load' });
    const checkRoute = () => {
      const actual = new URL(page.url());
      if (!response?.ok())
        throw new Error('Page returned an unsuccessful HTTP response');
      if (
        actual.origin !== expected.origin ||
        actual.pathname.replace(/\/$/, '') !==
          expected.pathname.replace(/\/$/, '')
      )
        throw new Error('Page redirected away from the requested route');
    };
    checkRoute();
    await page
      .waitForNetworkIdle({ idleTime: 500, timeout: 10000 })
      .catch(() => {});
    await sleep(3000);
    // Walk down the page so lazy images and sections load, then return to the top.
    const h: number = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    for (let y = 0; y < h; y += 800) {
      await page.evaluate((v: number) => window.scrollTo(0, v), y);
      await sleep(120);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1500);
    checkRoute(); // Authentication can also redirect after client hydration.
    const tree = await page.evaluate(snapshotPage);
    tree.assets = await fetchAssets(tree);
    await renderEmoji(browser, tree);
    tree.captureId = RUN_ID;
    tree.url = p.url;
    tree.name = p.name;
    writeFileSync(
      path.join(OUT, 'dom', key, `${p.name}.json`),
      JSON.stringify(tree),
    );
    await page.screenshot({
      path: path.join(OUT, 'screens', key, `${p.name}.png`),
      fullPage: true,
    });
    console.log(`ok   ${key}/${p.name}`);
  } catch (e) {
    throw new Error(`Capture failed for ${key}/${p.name}`, { cause: e });
  }
};

const login = async (page: any, creds: { email: string; password: string }) => {
  await page.goto(`${BASE}/account/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type=password]');
  await page.type('input[type=email], input[name=email]', creds.email);
  await page.type('input[type=password]', creds.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.keyboard.press('Enter'),
  ]);
  if (page.url().includes('/login'))
    throw new Error('Login failed: still on the login page');
  // Dismiss the first-turn tour offer (stored in localStorage only).
  await page.goto(`${BASE}/home/overview`, { waitUntil: 'load' });
  for (let i = 0; i < 30; i++) {
    const skipped = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(
        (x) => x.textContent?.trim() === 'Skip',
      );
      b?.click();
      return Boolean(b);
    });
    if (skipped) break;
    await sleep(500);
  }
};

const main = async () => {
  // Invalidate the previous run before any validation or capture can fail.
  mkdirSync(OUT, { recursive: true });
  if (existsSync(MANIFEST)) unlinkSync(MANIFEST);
  if (flag('public-only') && flag('game-only'))
    throw new Error('Choose public-only or game-only, not both');
  const creds = flag('public-only') ? null : loadCreds();
  const selected = [
    ...(!flag('game-only')
      ? PUBLIC_PAGES.map((p) => ({ key: 'public', ...p }))
      : []),
    ...(!flag('public-only') && creds
      ? GAME_PAGES.map((p) => ({ key: 'game', ...p }))
      : []),
  ].filter((p) => !ONLY || ONLY.includes(p.name));
  if (
    !selected.length ||
    ONLY?.some((name) => !selected.some((p) => p.name === name))
  )
    throw new Error(
      'Requested pages are unavailable; check page names, flags and game credentials',
    );
  for (const key of ['public', 'game']) {
    mkdirSync(path.join(OUT, 'dom', key), { recursive: true });
    mkdirSync(path.join(OUT, 'screens', key), { recursive: true });
  }
  mkdirSync(ASSETS, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    if (!flag('game-only')) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await preparePage(page);
      for (const p of PUBLIC_PAGES) await capture(context, page, 'public', p);
      await context.close();
    }
    if (!flag('public-only')) {
      if (!creds) {
        console.log(
          'skip game pages: set OT_DESIGN_EMAIL/OT_DESIGN_PASSWORD or pass --creds <file>',
        );
      } else {
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await preparePage(page);
        await login(page, creds);
        for (const p of GAME_PAGES) await capture(context, page, 'game', p);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  // Only a fully completed run can be consumed by the builder.
  writeFileSync(
    MANIFEST,
    JSON.stringify({ captureId: RUN_ID, pages: selected }),
  );
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
