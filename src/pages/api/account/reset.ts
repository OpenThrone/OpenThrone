import type { NextApiRequest, NextApiResponse } from 'next';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // handle password reset
  const { email } = req.body;
  console.log(email);
  console.log(req.body);
  try {
    const user = await prisma.users.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    console.log('user exists ');
    const uModel = new UserModel(user, false);

    // Generate a password reset token
    // For simplicity, we'll use a dummy token here
    const resetToken = '1234567890';
    console.log('reset', resetToken);
    // Configure Nodemailer
    const transporter = nodemailer.createTransport(smtpConfig);
    console.log('transporter created');
    // Send email
    const info = await transporter.sendMail({
      from: `<OpenThrone> ${process.env.SMTP_FROM_EMAIL}`,
      to: uModel.email,
      subject: 'Password Reset',
      text: `Your password reset token is: ${resetToken}`,
      // You can also use HTML content here
    });
    console.log('email sent', info);

    return res.json({ status: true, message: 'Password reset email sent' });
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}
