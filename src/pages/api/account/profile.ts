import AWS from 'aws-sdk';
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
import { logError, logInfo } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';

// Function to save the uploaded file to the local file system
const saveToLocal = async (
  file: formidable.File,
  userId: number,
): Promise<string> => {
  const uploadDir = path.join(
    process.cwd(),
    'public',
    `users/${userId}/avatar`,
  );

  // Ensure the directory exists
  fs.mkdirSync(uploadDir, { recursive: true });

  const filePath = path.join(
    uploadDir,
    file.originalFilename || 'unknown_filename',
  );

  // Move the file to the upload directory
  await fs.promises.rename(file.filepath, filePath);

  return `/users/${userId}/avatar/${file.originalFilename}`;
};

// AWS S3 upload function
const uploadToS3 = (
  file: formidable.File,
  uId: number,
): Promise<AWS.S3.ManagedUpload.SendData> => {
  // Configure AWS S3
  const s3 = new AWS.S3({
    endpoint: process.env.AWS_S3_ENDPOINT,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    signatureVersion: 'v4',
  });

  const fileStream = fs.createReadStream(file.filepath);
  const contentType =
    mime.lookup(file.originalFilename) || 'application/octet-stream'; // Fallback to application/octet-stream if the MIME type is unknown

  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: `users/${uId}/avatar/${file.originalFilename}`,
    Body: fileStream,
    ACL: 'public-read',
    ContentType: contentType,
  };

  // Return a promise of the upload
  return s3.upload(params).promise();
};

export const config = {
  api: {
    bodyParser: false, // Disable body parsing, use formidable
  },
};

const ProfileSchema = z.object({
  bio: z.string().optional(),
});

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

      const validatedFields = ProfileSchema.safeParse(fields);
      if (!validatedFields.success) {
        return res.status(400).json({
          error: 'Invalid fields',
          details: validatedFields.error.flatten().fieldErrors,
        });
      }

      // Ensure bio is a string
      const { bio } = validatedFields.data;
      const file = Array.isArray(files.avatar) ? files.avatar[0] : files.avatar;

      const updateData: any = {};

      if (bio) {
        updateData.bio = bio;
      }

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

        try {
          if (process.env.NEXT_PUBLIC_USE_AWS === 'true') {
            // Upload the file to S3
            const userId =
              typeof req.session?.user?.id === 'string'
                ? parseInt(req.session.user.id, 10)
                : Number(req.session?.user?.id ?? 0);
            const result = await uploadToS3(file, userId);
            updateData.avatar = `${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/${result.Key}`;
          } else {
            // Save the file to the local file system
            const userId =
              typeof req.session?.user?.id === 'string'
                ? parseInt(req.session.user.id, 10)
                : Number(req.session?.user?.id ?? 0);
            const filePath = await saveToLocal(file, userId);
            logInfo('File uploaded to:', filePath);
            updateData.avatar = filePath;
          }
        } catch (uploadError) {
          logError('Error uploading avatar:', uploadError);
          return res.status(500).json({ error: 'Error uploading avatar' });
        }
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No data to update' });
      }

      try {
        const userId =
          typeof req.session?.user?.id === 'string'
            ? parseInt(req.session.user.id, 10)
            : Number(req.session?.user?.id ?? 0);

        const result = await AccountService.updateProfile(userId, {
          bio: bio || undefined,
          avatarFile: updateData.avatar, // Pass the avatar path
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
