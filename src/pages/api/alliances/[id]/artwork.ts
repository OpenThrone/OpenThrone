import type { NextApiResponse } from 'next';
import path from 'path';
import { z } from 'zod';

import { hasAlliancePermission } from '@/constants/alliancePermissions';
import { localAvatarStorageAvailable } from '@/lib/avatarUpload';
import type { UploadedFile } from '@/lib/imageUpload';
import {
  IMAGE_CONTENT_TYPES,
  inspectImage,
  InvalidMultipartError,
  parseMultipartForm,
  putPublicObject,
  sha256Hex,
  UploadTooLargeError,
  writeLocalFile,
} from '@/lib/imageUpload';
import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import { AllianceService } from '@/services/Alliance.service';
import type { AuthenticatedRequest } from '@/types/api';
import type { AvatarFraming } from '@/utils/avatarFraming';
import { withAvatarFraming } from '@/utils/avatarFraming';
import {
  avatarExtensionFromImageType,
  buildAvatarFileName,
  resolveAvatarPath,
} from '@/utils/avatarStorage';
import { logError } from '@/utils/logger';

export const config = { api: { bodyParser: false } };
const MAX_BYTES = 4 * 1024 * 1024;
// Two images plus the multipart envelope and the small framing fields.
const MAX_BODY_BYTES = MAX_BYTES * 2 + 16 * 1024;
const MAX_FIELDS = 4;
const MAX_FIELDS_BYTES = 1024;
const storesInS3 = () => process.env.NEXT_PUBLIC_USE_AWS === 'true';

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
  // Uploads are parsed in memory; only local-disk storage needs a filesystem.
  if (!storesInS3() && !(await localAvatarStorageAvailable()))
    return res
      .status(503)
      .json({ error: 'Artwork uploads are unavailable right now.' });
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
    const { fields, files } = await parseMultipartForm(req, {
      maxBytes: MAX_BODY_BYTES,
    });
    const fieldValues = Object.values(fields).flat();
    if (
      fieldValues.length > MAX_FIELDS ||
      fieldValues.reduce((total, value) => total + value.length, 0) >
        MAX_FIELDS_BYTES
    )
      return res.status(400).json({ error: 'Invalid artwork fields' });
    if (
      Object.values(files)
        .flat()
        .some((file) => file.size > MAX_BYTES)
    )
      return res
        .status(400)
        .json({ error: 'Images must be at most 4 MB each' });
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
      file: UploadedFile;
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
      const dimensions = inspectImage(file.bytes);
      if (!dimensions)
        return res
          .status(400)
          .json({ error: 'Upload a valid PNG, JPEG, GIF or WebP image' });
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
        sha256Hex(file.bytes),
        extension,
      );
      const key = `alliances/${allianceId}/${kind}/${fileName}`;
      if (storesInS3()) {
        await putPublicObject(key, file.bytes, IMAGE_CONTENT_TYPES[extension]);
        data[kind] = `${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/${key}`;
      } else {
        const directory = path.join(
          process.cwd(),
          'public',
          'alliances',
          String(allianceId),
          kind,
        );
        await writeLocalFile(
          directory,
          resolveAvatarPath(directory, fileName),
          file.bytes,
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
    if (error instanceof UploadTooLargeError)
      return res
        .status(400)
        .json({ error: 'Images must be at most 4 MB each' });
    if (error instanceof InvalidMultipartError)
      return res.status(400).json({ error: 'Invalid artwork fields' });
    logError('Alliance artwork update failed', error);
    return res
      .status(500)
      .json({ error: 'Could not save alliance artwork. Try again.' });
  }
}

export default withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  rateLimitProfile: 'attack',
  querySchema: z.object({ id: z.coerce.number().int().positive() }),
})(handleAllianceArtwork);
