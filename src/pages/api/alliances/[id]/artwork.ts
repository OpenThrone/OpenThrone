import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import formidable from 'formidable';
import { promises as fs } from 'fs';
import imageSize from 'image-size';
import type { NextApiResponse } from 'next';
import os from 'os';
import path from 'path';
import { z } from 'zod';

import { hasAlliancePermission } from '@/constants/alliancePermissions';
import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import { AllianceService } from '@/services/Alliance.service';
import type { AuthenticatedRequest } from '@/types/api';
import type { AvatarFraming } from '@/utils/avatarFraming';
import { withAvatarFraming } from '@/utils/avatarFraming';
import {
  avatarExtensionFromImageType,
  buildAvatarFileName,
  hashFileSha256,
  resolveAvatarPath,
} from '@/utils/avatarStorage';
import { logError } from '@/utils/logger';

export const config = { api: { bodyParser: false } };
const MAX_BYTES = 4 * 1024 * 1024;
const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** Kept separate from the guard so multipart storage can be integration-tested. */
export async function handleAllianceArtwork(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  { query }: { query: { id?: number } },
) {
  res.setHeader('Cache-Control', 'private, no-store');
  const allianceId = Number(query.id);
  if (!Number.isSafeInteger(allianceId) || allianceId <= 0)
    return res.status(400).json({ error: 'Invalid alliance' });
  const userId = Number(req.session?.user?.id);
  let temporaryDirectory: string | undefined;
  try {
    const alliance = await prisma.alliances.findUnique({
      where: { id: allianceId },
      select: { leader_id: true, avatar: true, bannerimg: true },
    });
    if (!alliance) return res.status(404).json({ error: 'Alliance not found' });
    const membership = await prisma.alliance_memberships.findUnique({
      where: {
        unique_alliance_user: { alliance_id: allianceId, user_id: userId },
      },
      include: { role: true },
    });
    if (
      !hasAlliancePermission(
        alliance.leader_id,
        userId,
        membership?.role,
        'edit_profile',
      )
    ) {
      return res
        .status(403)
        .json({ error: 'You do not have permission to edit this alliance' });
    }
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'ot-alliance-art-'),
    );
    const form = formidable({
      uploadDir: temporaryDirectory,
      maxFiles: 2,
      maxFileSize: MAX_BYTES,
      maxTotalFileSize: MAX_BYTES * 2,
      maxFields: 4,
      maxFieldsSize: 1024,
      allowEmptyFiles: false,
    });
    const [fields, files] = await form.parse(req);
    if (
      Object.keys(files).some(
        (key) => !['avatar', 'bannerimg'].includes(key),
      ) ||
      Object.keys(fields).some(
        (key) =>
          ![
            'removeAvatar',
            'removeBanner',
            'avatarFraming',
            'bannerFraming',
          ].includes(key),
      )
    ) {
      return res.status(400).json({ error: 'Invalid artwork fields' });
    }
    const frames: Partial<Record<'avatar' | 'bannerimg', AvatarFraming>> = {};
    const frameSchema = z
      .object({
        x: z.number().finite().min(0).max(100),
        y: z.number().finite().min(0).max(100),
        zoom: z.number().finite().min(1).max(3),
      })
      .strict();
    for (const [field, kind] of [
      ['avatarFraming', 'avatar'],
      ['bannerFraming', 'bannerimg'],
    ] as const) {
      const raw = fields[field];
      if (!raw) continue;
      try {
        if (raw.length !== 1) throw new Error('Invalid framing');
        const parsed = frameSchema.parse(JSON.parse(raw[0]));
        frames[kind] = { x: parsed.x, y: parsed.y, zoom: parsed.zoom };
      } catch {
        return res.status(400).json({ error: 'Invalid image framing' });
      }
    }
    const data: { avatar?: string; bannerimg?: string } = {};
    const uploads: {
      file: formidable.File;
      kind: 'avatar' | 'bannerimg';
      extension: string;
    }[] = [];
    for (const kind of ['avatar', 'bannerimg'] as const) {
      const removeKey = kind === 'avatar' ? 'removeAvatar' : 'removeBanner';
      const remove = fields[removeKey];
      if (remove && (remove.length !== 1 || remove[0] !== 'true'))
        return res.status(400).json({ error: 'Invalid removal request' });
      const selected = files[kind];
      if ((selected && selected.length !== 1) || (selected && remove))
        return res
          .status(400)
          .json({ error: 'Choose either replacement or removal' });
      if (remove && frames[kind])
        return res.status(400).json({ error: 'Cannot frame a removed image' });
      if (remove) data[kind] = '';
      const file = selected?.[0];
      if (!file) continue;
      let dimensions: { width?: number; height?: number; type?: string };
      try {
        dimensions = imageSize(file.filepath);
      } catch {
        return res
          .status(400)
          .json({ error: 'Upload a valid PNG, JPEG, GIF or WebP image' });
      }
      const extension = avatarExtensionFromImageType(dimensions.type);
      const maxWidth = kind === 'avatar' ? 1024 : 2400;
      const maxHeight = kind === 'avatar' ? 1024 : 1200;
      if (
        !extension ||
        !dimensions.width ||
        !dimensions.height ||
        dimensions.width > maxWidth ||
        dimensions.height > maxHeight
      ) {
        return res.status(400).json({
          error: `Image must be PNG, JPEG, GIF or WebP, at most ${maxWidth} × ${maxHeight} pixels`,
        });
      }
      uploads.push({ file, kind, extension });
    }
    for (const kind of ['avatar', 'bannerimg'] as const) {
      if (frames[kind] && !uploads.some((upload) => upload.kind === kind)) {
        if (!alliance[kind])
          return res.status(400).json({ error: 'No image to frame' });
        data[kind] = alliance[kind];
      }
    }
    if (!uploads.length && !Object.keys(data).length)
      return res.status(400).json({ error: 'No artwork changes provided' });
    // Validate both files before storing either. Filenames come only from decoded content and a content hash.
    for (const { file, kind, extension } of uploads) {
      const fileName = buildAvatarFileName(
        allianceId,
        await hashFileSha256(file.filepath),
        extension,
      );
      const key = `alliances/${allianceId}/${kind}/${fileName}`;
      if (process.env.NEXT_PUBLIC_USE_AWS === 'true') {
        const s3 = new S3Client({
          endpoint: process.env.AWS_S3_ENDPOINT,
          region: process.env.AWS_REGION ?? 'auto',
          forcePathStyle: true,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
          },
        });
        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME ?? '',
            Key: key,
            Body: await fs.readFile(file.filepath),
            ContentType: CONTENT_TYPES[extension],
            ACL: 'public-read',
          }),
        );
        data[kind] = `${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/${key}`;
      } else {
        const directory = path.join(
          process.cwd(),
          'public',
          'alliances',
          String(allianceId),
          kind,
        );
        await fs.mkdir(directory, { recursive: true });
        await fs.copyFile(
          file.filepath,
          resolveAvatarPath(directory, fileName),
        );
        data[kind] = `/${key}`;
      }
    }
    for (const kind of ['avatar', 'bannerimg'] as const) {
      const frame = frames[kind];
      if (frame && data[kind])
        data[kind] = withAvatarFraming(data[kind], frame);
    }
    // Recheck profile permissions after upload before persisting the new URLs.
    await AllianceService.updateAlliance(allianceId, userId, data);
    return res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof formidable.errors.FormidableError)
      return res
        .status(400)
        .json({ error: 'Images must be at most 4 MB each' });
    logError('Alliance artwork update failed', error);
    return res
      .status(500)
      .json({ error: 'Could not save alliance artwork. Try again.' });
  } finally {
    if (temporaryDirectory)
      await fs
        .rm(temporaryDirectory, { recursive: true, force: true })
        .catch(() => undefined);
  }
}

export default withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  rateLimitProfile: 'attack',
  querySchema: z.object({ id: z.coerce.number().int().positive() }),
})(handleAllianceArtwork);
