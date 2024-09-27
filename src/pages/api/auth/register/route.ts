import prisma from "@/lib/prisma";
import { createUser, userExists } from "@/services";
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
    const { email, password, race, display_name } = await req.body;
    let exists = await userExists(email);
    if (exists) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const phash = await argon2.hash(password);
    
    const user = createUser(email, phash, display_name, race, req.body.class, 'en-US');

    return res.json(user);

  } catch (error) {
    console.error('Error in handlePOST:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

