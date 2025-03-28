import prisma from "@/lib/prisma";
import { createUser, userExists } from "@/services";
import { logError } from "@/utils/logger";
import type { NextApiRequest, NextApiResponse } from 'next';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
const argon2 = require('argon2');

// SMTP configuration from .env file
const smtpConfig: SMTPTransport.Options = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10) || 587,
  secure: true, // true for 465, false for other ports like 587 or 25
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    await handlePOST(res, req);
  } else {
    throw new Error(
      `The HTTP ${req.method} method is not supported at this route.`
    );
  }
}

export async function handlePOST(res: NextApiResponse, req: NextApiRequest) {
  try {
    if (process.env.NEXT_PUBLIC_DISABLE_REGISTRATION === 'true') {
      return res.status(403).json({ error: 'Registrations are disabled' });
    }
    const { turnstileToken } = req.body;
    const captchaRes = await fetch(`${process.env.NEXT_PUBLIC_URL_ROOT}/api/captcha/verify`, {
    method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: turnstileToken }),
    });
    const captchaData = await captchaRes.json();
    if (!captchaData.success) {
      return res.status(400).json({ error: 'Captcha verification failed' });
    }
    const { email, password, race, display_name } = await req.body;
    let exists = await userExists(email);
    if (exists) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const phash = await argon2.hash(password);
    
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    const user = createUser(email, phash, display_name, race, req.body.class, 'en-US');

    return res.json(user);

  } catch (error) {
    logError('Error in handlePOST:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

