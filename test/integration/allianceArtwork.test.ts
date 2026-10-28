import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import { promises as fs } from 'fs';
import { createServer } from 'http';
import os from 'os';
import path from 'path';

import prisma from '@/lib/prisma';
import { handleAllianceArtwork } from '@/pages/api/alliances/[id]/artwork';
import { AllianceService } from '@/services/Alliance.service';
import { createUser } from '@/services/User.service';

import { resetDatabase } from './db';

let actorId: number;
let leaderId: number;
let memberId: number;
let allianceId: number;
let temporaryDirectory: string;
const originalDirectory = process.cwd();
const server = createServer((req, res) => {
  // Synthetic session replaces only the authentication boundary. The real
  // multipart parser, profile permissions, storage and database writes run.
  Object.assign(req, { session: { user: { id: actorId } } });
  const response = Object.assign(res, {
    status(code: number) {
      res.statusCode = code;
      return response;
    },
    json(data: unknown) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
      return response;
    },
  });
  handleAllianceArtwork(req as never, response as never, {
    query: { id: allianceId },
  });
});
let baseUrl: string;
beforeAll(async () => {
  temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ot-artwork-integration-'),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No local HTTP port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  process.chdir(originalDirectory);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});
beforeEach(async () => {
  process.chdir(originalDirectory);
  await resetDatabase();
  leaderId = (
    await createUser(
      'art-leader@example.test',
      'synthetic',
      'Art leader',
      'HUMAN',
      'FIGHTER',
    )
  ).id;
  memberId = (
    await createUser(
      'art-member@example.test',
      'synthetic',
      'Art member',
      'ELF',
      'FIGHTER',
    )
  ).id;
  await prisma.users.update({
    where: { id: leaderId },
    data: { experience: 1000000, gold: 100000000n },
  });
  const alliance = await AllianceService.createAlliance(leaderId, {
    name: 'Art test',
  });
  allianceId = alliance.id;
  const role = await prisma.alliance_roles.findFirstOrThrow({
    where: { alliance_id: allianceId },
    orderBy: { rank_order: 'desc' },
  });
  await prisma.alliance_memberships.create({
    data: { alliance_id: allianceId, user_id: memberId, role_id: role.id },
  });
  actorId = leaderId;
  // Uploaded files stay in the task-owned temporary directory, never the checkout.
  process.chdir(temporaryDirectory);
});
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=',
  'base64',
);
const send = (form: FormData) => fetch(baseUrl, { method: 'POST', body: form });
const upload = () => {
  const form = new FormData();
  form.append(
    'avatar',
    new Blob([png], { type: 'image/png' }),
    '../../photo.png',
  );
  form.append(
    'bannerimg',
    new Blob([png], { type: 'image/png' }),
    'banner.png',
  );
  return form;
};
describe('alliance artwork upload and authorization', () => {
  test('a leader can replace and remove both images with server-generated paths', async () => {
    expect((await send(upload())).status).toBe(200);
    const alliance = await prisma.alliances.findUniqueOrThrow({
      where: { id: allianceId },
    });
    expect(alliance.avatar).toMatch(
      /^\/alliances\/\d+\/avatar\/\d+-[a-f0-9]+\.png$/,
    );
    expect(alliance.bannerimg).toMatch(
      /^\/alliances\/\d+\/bannerimg\/\d+-[a-f0-9]+\.png$/,
    );
    expect(
      await fs.readFile(
        path.join(temporaryDirectory, 'public', alliance.avatar!),
      ),
    ).toEqual(png);
    const remove = new FormData();
    remove.append('removeAvatar', 'true');
    remove.append('removeBanner', 'true');
    expect((await send(remove)).status).toBe(200);
    const cleared = await prisma.alliances.findUniqueOrThrow({
      where: { id: allianceId },
    });
    expect(cleared.avatar).toBe('');
    expect(cleared.bannerimg).toBe('');
  });
  test('persists crop metadata for uploads and allows reframing without uploading again', async () => {
    const form = upload();
    form.append('bannerFraming', JSON.stringify({ x: 75, y: 20, zoom: 2 }));
    expect((await send(form)).status).toBe(200);
    const first = await prisma.alliances.findUniqueOrThrow({
      where: { id: allianceId },
    });
    expect(first.bannerimg).toEndWith('#frame=75,20,2');
    const framing = new FormData();
    framing.append(
      'avatarFraming',
      JSON.stringify({ x: 10, y: 90, zoom: 1.5 }),
    );
    expect((await send(framing)).status).toBe(200);
    const changed = await prisma.alliances.findUniqueOrThrow({
      where: { id: allianceId },
    });
    expect(changed.avatar).toEndWith('#frame=10,90,1.5');
    expect(changed.bannerimg).toBe(first.bannerimg);
  });
  test('rejects invalid framing and framing a missing image', async () => {
    for (const value of [
      'invalid',
      JSON.stringify({ x: 50, y: 50, zoom: 99 }),
      JSON.stringify({ x: 50, y: 50, zoom: 1 }),
    ]) {
      const form = new FormData();
      form.append('bannerFraming', value);
      expect((await send(form)).status).toBe(400);
    }
  });
  test('members need edit_profile; authorized officers may replace artwork', async () => {
    actorId = memberId;
    expect((await send(upload())).status).toBe(403);
    const role = await prisma.alliance_roles.create({
      data: {
        alliance_id: allianceId,
        name: 'Artist',
        rank_order: 1,
        permissions: { edit_profile: true },
      },
    });
    await prisma.alliance_memberships.update({
      where: {
        unique_alliance_user: { alliance_id: allianceId, user_id: memberId },
      },
      data: { role_id: role.id },
    });
    expect((await send(upload())).status).toBe(200);
  });
  test('rejects spoofed image content before persisting either image', async () => {
    const form = new FormData();
    form.append('avatar', new Blob([png], { type: 'image/png' }), 'valid.png');
    form.append(
      'bannerimg',
      new Blob(['<svg><script>alert(1)</script></svg>'], { type: 'image/png' }),
      'fake.png',
    );
    expect((await send(form)).status).toBe(400);
    const alliance = await prisma.alliances.findUniqueOrThrow({
      where: { id: allianceId },
    });
    expect(alliance.avatar).toBeNull();
    expect(alliance.bannerimg).toBeNull();
  });
});
