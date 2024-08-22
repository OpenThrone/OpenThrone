// /pages/api/upload.ts
import prisma from "@/lib/prisma";
import type { NextApiRequest, NextApiResponse } from 'next';
import AWS from 'aws-sdk';
import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import mime from 'mime-types';
import { stringifyObj } from '@/utils/numberFormatting';
import imageSize from 'image-size';
import { withAuth } from '@/middleware/auth';

// Function to save the uploaded file to the local file system
const saveToLocal = async (file: formidable.File, userId: number): Promise<string> => {
  const uploadDir = path.join(process.cwd(), 'public', `users/${userId}/avatar`);

  // Ensure the directory exists
  fs.mkdirSync(uploadDir, { recursive: true });

  const filePath = path.join(uploadDir, file.originalFilename || 'unknown_filename');

  // Move the file to the upload directory
  await fs.promises.rename(file.filepath, filePath);

  return `/users/${userId}/avatar/${file.originalFilename}`;
};

// AWS S3 upload function
const uploadToS3 = (file: formidable.File, uId: Number): Promise<AWS.S3.ManagedUpload.SendData> => {
  // Configure AWS S3
  const s3 = new AWS.S3({
    endpoint: process.env.AWS_S3_ENDPOINT, 
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    signatureVersion: 'v4',
  });

  const fileStream = fs.createReadStream(file.filepath);
  const contentType = mime.lookup(file.originalFilename) || 'application/octet-stream'; // Fallback to application/octet-stream if the MIME type is unknown

  const params = {
    Bucket: process.env.AWS_BUCKET_NAME!,
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

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    const form = formidable({ multiples: false, maxFileSize: 1.5 * 1024 * 1024 })
    form.uploadDir = path.join(process.cwd(), 'temp'); 
    form.keepExtensions = true; // Keep file extension

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('Error parsing the form: ', err);
        return res.status(500).json({ error: err.message });
      }

      const file = Array.isArray(files.avatar) ? files.avatar[0] : files.avatar;
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Check image dimensions
      const dimensions = imageSize(file.filepath);
      if (dimensions.width > 450 || dimensions.height > 450) {
        return res.status(400).json({ error: 'Image dimensions must not exceed 450x450px.' });
      }

      try {
        if (process.env.NEXT_PUBLIC_USE_AWS === 'true') {
          // Upload the file to S3
          const result = await uploadToS3(file, req.session.user.id);
          const updated = await prisma.users.update({
            where: { id: req.session.user.id },
            data: {
              avatar: process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT + "/" + result.Key,
            },
          });
          // Respond back with the result
          return res.status(200).json({ status: 'success', data: stringifyObj({ result, updated }) });
        } else {
          // Save the file to the local file system
          const filePath = await saveToLocal(file, req.session.user.id);
          console.log('File uploaded to:', filePath);
          // Update the user's avatar path in the database
          const updated = await prisma.users.update({
            where: { id: req.session.user.id },
            data: {
              avatar: filePath,
            },
          });
          // Respond back with the file path
          return res.status(200).json({ status: 'success', data: stringifyObj({ filePath, updated }) });
        }
      } catch (uploadError) {
        console.error('Error uploading to S3:', uploadError);
        return res.status(500).json({ error: 'Error uploading to S3' });
      }
    });
  } else {
    // Handle any other HTTP methods
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

export default withAuth(handler);
