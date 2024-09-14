import type { NextApiRequest, NextApiResponse } from 'next';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { generateRandomString } from '@/utils/utilities';

// SMTP configuration from .env file
const smtpConfig: SMTPTransport.Options = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10) || 587,
  secure: true, // true for 465, false for other ports like 587 or 25
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: { rejectUnauthorized: false },
  debug: true
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed!' });
  }
  // handle password reset
  const { email } = req.body;
  try {
    const user = await prisma.users.findUnique({ where: { email } });
    console.log('user', user)
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const uModel = new UserModel(user, false);

    const resetToken = generateRandomString(6);
    const existingReset = await prisma.passwordReset.findMany({
      where: {
        userId: uModel.id,
        status: 0,
        type: "PASSWORD",
      },
    });
    console.log('existingReset', existingReset)
    for (const reset of existingReset) {
      await prisma.passwordReset.update({
        where: { id: reset.id },
        data: {
          status: 1,
        },
      });
    }

    // save reset token
    const resetReq = await prisma.passwordReset.create({
      data: {
        userId: parseInt(uModel.id.toString()),
        verificationCode: resetToken,
        type: 'PASSWORD',
      },
    });

    // Configure Nodemailer
    const transporter = nodemailer.createTransport(smtpConfig);
    // Send email
    const info = await transporter.sendMail({
      from: `<OpenThrone> ${process.env.SMTP_FROM_EMAIL}`,
      to: uModel.email,
      subject: 'Password Reset',
      text: `Your password reset token is: ${resetToken} 
      Please use this token to reset your password here <a href='https://openthrone.dev/account/password-reset/verify'>https://openthrone.dev/account/password-reset/verify</a>`,
    });
    
    return res.json({
      status: true,
      message: 'Password reset email sent',
      id: resetReq.id,
      uId: uModel.id,
      info
    });
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}
