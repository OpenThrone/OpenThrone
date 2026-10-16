import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import formidable from 'formidable';
import fs from 'fs';
import imageSize from 'image-size';
import mime from 'mime-types';
import type { NextApiResponse } from 'next';
import path from 'path';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { AccountService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import type { AvatarFraming } from '@/utils/avatarFraming';
import { sanitizeAvatarFraming } from '@/utils/avatarFraming';
import {
  avatarExtensionFromImageType,
  buildAvatarFileName,
  hashFileSha256,
  resolveAvatarPath,
} from '@/utils/avatarStorage';
import { logError, logInfo } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';

// Function to save the uploaded file to the local file system.
// fileName is server-generated; the client filename is never used for storage.
const saveToLocal = async (
  file: formidable.File,
  userId: number,
  fileName: string,
): Promise<string> => {
  const uploadDir = path.join(
    process.cwd(),
    'public',
    `users/${userId}/avatar`,
  );

  // Ensure the directory exists
  fs.mkdirSync(uploadDir, { recursive: true });

  const filePath = resolveAvatarPath(uploadDir, fileName);

  // Move the file to the upload directory
  await fs.promises.rename(file.filepath, filePath);

  return `/users/${userId}/avatar/${fileName}`;
};

// AWS S3 upload function (key built from the server-generated name only)
const uploadToS3 = async (
  file: formidable.File,
  uId: number,
  fileName: string,
): Promise<{ Key: string }> => {
  const s3 = new S3Client({
    endpoint: process.env.AWS_S3_ENDPOINT,
    region: process.env.AWS_REGION ?? 'auto',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    },
    forcePathStyle: true,
  });

  const fileStream = fs.createReadStream(file.filepath);
  const contentType = mime.lookup(fileName) || 'application/octet-stream'; // Fallback to application/octet-stream if the MIME type is unknown

  const key = `users/${uId}/avatar/${fileName}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME ?? '',
      Key: key,
      Body: fileStream,
      ACL: 'public-read',
      ContentType: contentType,
    }),
  );

  return { Key: key };
};

export const config = {
  api: {
    bodyParser: false, // Disable body parsing, use formidable
  },
};

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
    const form = formidable({
      multiples: false,
      maxFileSize: 1.5 * 1024 * 1024,
    });
    form.uploadDir = path.join(process.cwd(), 'temp');
    form.keepExtensions = true; // Keep file extension

    form.parse(req, async (err, fields, files) => {
      if (err) {
        logError('Error parsing the form: ', err);
        return res.status(500).json({ error: err.message });
      }

      const normalizedFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        normalizedFields[key] = Array.isArray(value) ? value[0] : value;
      }

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
      const file = Array.isArray(files.avatar) ? files.avatar[0] : files.avatar;

      let avatarPath: string | undefined;

      if (file) {
        // Check MIME type
        const allowedTypes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
        ];
        const mimeType = mime.lookup(file.originalFilename || '') || '';
        if (!allowedTypes.includes(mimeType)) {
          return res.status(400).json({
            error: 'Only image files (jpg, png, gif, webp) are allowed.',
          });
        }

        // Check image dimensions
        let dimensions;
        try {
          dimensions = imageSize(file.filepath);
        } catch {
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
            await hashFileSha256(file.filepath),
            extension,
          );

          if (process.env.NEXT_PUBLIC_USE_AWS === 'true') {
            // Upload the file to S3
            const result = await uploadToS3(file, userId, fileName);
            avatarPath = `${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/${result.Key}`;
          } else {
            // Save the file to the local file system
            const filePath = await saveToLocal(file, userId, fileName);
            logInfo('File uploaded to:', filePath);
            avatarPath = filePath;
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
    });
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};

export default withAuth(handler);
