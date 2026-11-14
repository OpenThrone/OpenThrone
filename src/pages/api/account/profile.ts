import mime from 'mime-types';
import type { NextApiResponse } from 'next';
import path from 'path';
import { z } from 'zod';

import {
  localAvatarStorageAvailable,
  resolveAvatarStorageDriver,
} from '@/lib/avatarUpload';
import type { MultipartForm } from '@/lib/imageUpload';
import {
  inspectImage,
  InvalidMultipartError,
  parseMultipartForm,
  putPublicObject,
  sha256Hex,
  UploadTooLargeError,
  writeLocalFile,
} from '@/lib/imageUpload';
import { withAuth } from '@/middleware/auth';
import { AccountService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import type { AvatarFraming } from '@/utils/avatarFraming';
import { sanitizeAvatarFraming } from '@/utils/avatarFraming';
import {
  avatarExtensionFromImageType,
  buildAvatarFileName,
  resolveAvatarPath,
} from '@/utils/avatarStorage';
import { logError, logInfo } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorMessage } from '@/utils/publicError';

export const config = {
  api: {
    bodyParser: false, // Multipart is parsed in memory by parseMultipartForm
  },
};

const MAX_AVATAR_BYTES = 1.5 * 1024 * 1024;
// Room for the multipart envelope and the text fields around the file.
const MAX_BODY_BYTES = MAX_AVATAR_BYTES + 64 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const ProfileSchema = z.object({
  bio: z.string().optional(),
  // JSON {x, y, zoom} for the portrait framing, or 'reset' to clear it.
  avatarFraming: z.string().max(200).optional(),
});

/** undefined = not sent, null = reset, false = invalid. */
const parseAvatarFraming = (
  raw: string | undefined,
): AvatarFraming | null | undefined | false => {
  if (raw === undefined) return undefined;
  if (raw === 'reset') return null;
  try {
    return sanitizeAvatarFraming(JSON.parse(raw)) ?? false;
  } catch {
    return false;
  }
};

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    const storage = resolveAvatarStorageDriver();
    // Local-disk storage needs a writable filesystem; on runtimes without one
    // answer with a clean 503. S3 storage works everywhere.
    if (storage === 'local' && !(await localAvatarStorageAvailable())) {
      logError('Local avatar storage is unavailable in this runtime');
      return res.status(503).json({ error: 'avatar_upload_unavailable' });
    }

    let form: MultipartForm;
    try {
      form = await parseMultipartForm(req, { maxBytes: MAX_BODY_BYTES });
    } catch (err) {
      if (err instanceof UploadTooLargeError) {
        return res
          .status(400)
          .json({ error: 'Image files must be at most 1.5 MB.' });
      }
      if (err instanceof InvalidMultipartError) {
        return res.status(400).json({ error: 'Invalid upload' });
      }
      logError('Error parsing the form: ', err);
      return res.status(500).json({ error: publicErrorMessage(err) });
    }

    const normalizedFields = Object.fromEntries(
      Object.entries(form.fields).map(([key, [first]]) => [key, first]),
    );

    const validatedFields = ProfileSchema.safeParse(normalizedFields);
    if (!validatedFields.success) {
      return res.status(400).json({
        error: 'Invalid fields',
        details: validatedFields.error.flatten().fieldErrors,
      });
    }

    const { bio } = validatedFields.data;
    const avatarFraming = parseAvatarFraming(
      validatedFields.data.avatarFraming,
    );
    if (avatarFraming === false) {
      return res.status(400).json({ error: 'Invalid avatar framing' });
    }
    const file = form.files.avatar?.[0];

    let avatarPath: string | undefined;

    if (file) {
      // The client filename only gates the allow-list; storage uses content.
      const mimeType = mime.lookup(file.name || '') || '';
      if (!ALLOWED_TYPES.includes(mimeType)) {
        return res.status(400).json({
          error: 'Only image files (jpg, png, gif, webp) are allowed.',
        });
      }
      if (file.size > MAX_AVATAR_BYTES) {
        return res
          .status(400)
          .json({ error: 'Image files must be at most 1.5 MB.' });
      }

      const dimensions = inspectImage(file.bytes);
      if (!dimensions) {
        return res
          .status(400)
          .json({ error: 'Uploaded file is not a valid image.' });
      }
      if (dimensions.width > 450 || dimensions.height > 450) {
        return res
          .status(400)
          .json({ error: 'Image dimensions must not exceed 450x450px.' });
      }

      // Extension comes from the decoded image, and the stored name from user ID plus content hash
      const extension = avatarExtensionFromImageType(dimensions.type);
      if (!extension) {
        return res.status(400).json({
          error: 'Only image files (jpg, png, gif, webp) are allowed.',
        });
      }

      try {
        const userId =
          typeof req.session?.user?.id === 'string'
            ? parseInt(req.session.user.id, 10)
            : Number(req.session?.user?.id ?? 0);
        const fileName = buildAvatarFileName(
          userId,
          sha256Hex(file.bytes),
          extension,
        );
        const key = `users/${userId}/avatar/${fileName}`;

        if (storage === 's3') {
          await putPublicObject(
            key,
            file.bytes,
            mime.lookup(fileName) || 'application/octet-stream',
          );
          avatarPath = `${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/${key}`;
        } else {
          const uploadDir = path.join(
            process.cwd(),
            'public',
            `users/${userId}/avatar`,
          );
          await writeLocalFile(
            uploadDir,
            resolveAvatarPath(uploadDir, fileName),
            file.bytes,
          );
          avatarPath = `/${key}`;
          logInfo('File uploaded to:', avatarPath);
        }
      } catch (uploadError) {
        logError('Error uploading avatar:', uploadError);
        return res.status(500).json({ error: 'Error uploading avatar' });
      }
    }

    const hasBio = typeof bio === 'string';
    const hasAvatar = !!file;
    const hasFraming = avatarFraming !== undefined;

    if (!hasBio && !hasAvatar && !hasFraming) {
      return res.status(400).json({ error: 'No data to update' });
    }

    try {
      const userId =
        typeof req.session?.user?.id === 'string'
          ? parseInt(req.session.user.id, 10)
          : Number(req.session?.user?.id ?? 0);

      const result = await AccountService.updateProfile(userId, {
        bio: hasBio ? bio : undefined,
        avatarFile: avatarPath,
        avatarFraming,
      });

      return res
        .status(200)
        .json({ status: 'success', data: stringifyObj(result) });
    } catch (updateError) {
      logError('Error updating user:', updateError);
      return res.status(500).json({ error: 'Error updating user profile' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};

export default withAuth(handler);
