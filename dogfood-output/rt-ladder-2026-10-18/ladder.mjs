/**
 * Ladder driver for realtime-pilot §8.3 (dogfood tooling, not shipped code).
 *
 * Registers synthetic ladder users on the preview, creates one shared chat
 * room, then for each rung mints fresh one-time tickets (they expire 60 s
 * after minting) and invokes scripts/loadtest-chat.ts.
 *
 * Usage: bun dogfood-output/rt-ladder-2026-10-18/ladder.mjs [--users N]
 * (run from the repo root)
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const BASE = 'https://openthrone-preview.example.workers.dev';
const DIR = new URL('.', import.meta.url).pathname;
const USERS = Number(process.argv.includes('--users')
  ? process.argv[process.argv.indexOf('--users') + 1] : 52);
const RUNGS = [5, 20, 50];
const MSGS_PER_CONN = 4;
const SEND_INTERVAL_MS = 1200; // 8.3 sends/10s per user — under the 10 cap
const DRAIN_MS = 15000;

class Jar {
  constructor() { this.cookies = new Map(); }
  header() { return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }
  absorb(res) {
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }
}

async function login(email, password) {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  jar.absorb(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: jar.header() },
    body: new URLSearchParams({ csrfToken, email, password }).toString(),
    redirect: 'manual',
  });
  jar.absorb(res);
  return jar;
}

async function register(i, suffix) {
  const email = `rt-ladder-${i}-${suffix}@openthrone-e2e.test`;
  const password = `Ladder!${suffix}${i}x`;
  const res = await fetch(`${BASE}/api/auth/register/route`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email, password,
      display_name: `rtLadder${i}${suffix.slice(0, 4)}`,
      race: 'HUMAN', class: 'FIGHTER',
    }),
  });
  if (!res.ok) throw new Error(`register ${i} failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const user = await res.json();
  return { id: user.id, email, password };
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const credsPath = `${DIR}creds.json`;
  let users;
  if (existsSync(credsPath)) {
    users = JSON.parse(readFileSync(credsPath, 'utf8'));
    console.log(`reusing ${users.length} ladder users`);
  } else {
    const suffix = Math.random().toString(36).slice(2, 8);
    users = [];
    for (let i = 0; i < USERS; i++) {
      users.push(await register(i, suffix));
      console.log(`registered ${users[i].email} (id ${users[i].id})`);
    }
    writeFileSync(credsPath, JSON.stringify(users, null, 2));
  }

  // One shared room: user0 creates it with everyone else as recipients.
  const roomPath = `${DIR}room.json`;
  let roomId;
  if (existsSync(roomPath)) {
    roomId = JSON.parse(readFileSync(roomPath, 'utf8')).roomId;
  } else {
    const jar = await login(users[0].email, users[0].password);
    const res = await fetch(`${BASE}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: jar.header() },
      body: JSON.stringify({ recipients: users.slice(1).map((u) => u.id) }),
    });
    if (!res.ok) throw new Error(`room create failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    roomId = body.id;
    writeFileSync(roomPath, JSON.stringify({ roomId }));
  }
  console.log(`room ${roomId}`);

  for (const c of RUNGS) {
    console.log(`\n=== rung concurrency=${c} ===`);
    const tickets = [];
    for (let i = 0; i < c; i++) {
      const jar = await login(users[i].email, users[i].password);
      const mint = await fetch(`${BASE}/api/realtime/ticket`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: jar.header() },
        body: `{"roomId":${roomId}}`,
      });
      if (!mint.ok) throw new Error(`mint ${i} failed ${mint.status}`);
      tickets.push((await mint.json()).ticket);
    }
    const tPath = `${DIR}tickets-${c}.txt`;
    writeFileSync(tPath, `${tickets.join('\n')}\n`);
    console.log(`minted ${tickets.length} tickets`);

    const out = spawnSync('bun', [
      'scripts/loadtest-chat.ts', '--room', String(roomId),
      '--tickets', tPath, '--concurrency', String(c),
      '--messages-per-conn', String(MSGS_PER_CONN),
      '--send-interval-ms', String(SEND_INTERVAL_MS),
      '--drain-ms', String(DRAIN_MS),
    ], { encoding: 'utf8', timeout: 15 * 60_000 });
    writeFileSync(`${DIR}ladder-${c}-stdout.txt`, out.stdout || '');
    writeFileSync(`${DIR}ladder-${c}-stderr.txt`, out.stderr || '');
    const line = (out.stdout || '').trim().split('\n').filter((l) => l.startsWith('{')).pop();
    if (line) {
      writeFileSync(`${DIR}ladder-${c}-summary.json`, line + '\n');
      console.log(line);
    } else {
      console.log('NO SUMMARY — see ladder-%d-stderr.txt', c);
    }
    await new Promise((r) => setTimeout(r, 20_000)); // cooldown between rungs
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
