// /pages/api/upload.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import AWS from 'aws-sdk';
import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import mime from 'mime-types';
import { stringifyObj } from '@/utils/numberFormatting';
import imageSize from 'image-size';
import { withAuth } from '@/middleware/auth';


// AWS S3 upload function
const uploadToS3 = (file: formidable.File, uId: Number): Promise<AWS.S3.ManagedUpload.SendData> => {
  // Configure AWS S3
  const s3 = new AWS.S3({
    endpoint: `https://7c4f7908394dad3137ff31e103712455.r2.cloudflarestorage.com`, // Use your Cloudflare account ID
    accessKeyId: process.env.AWS_ACCESS_KEY_ID, // Your Cloudflare R2 Access Key ID
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, // Your Cloudflare R2 Secret Access Key
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
        console.error('Error parsing the form:', err);
        return res.status(500).json({ error: 'Error parsing the form data.' });
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