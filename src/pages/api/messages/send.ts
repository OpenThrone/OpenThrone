// src/pages/api/messages/send.ts

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';

export default async function handle(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (req.method === 'POST') {
    const { recipient, subject, body } = req.body;

    try {
      const recipientUser = await prisma.users.findUnique({
        where: {
          display_name: recipient, // Assuming recipient input is based on email.
        },
      });

      if (!recipientUser) {
        return res.status(404).json({ message: 'Recipient not found' });
      }

      await prisma.messages.create({
        data: {
          subject,
          body,
          from_user_id: session.player?.id,
          to_user_id: recipientUser.id,
          unread: true,
          // other fields can be filled as required.
        },
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      return res
        .status(500)
        .json({ message: 'An error occurred while sending the message.', error: error.message, stats: session });
    }
  }

  return res.status(405).json({ message: 'Method not allowed.' });
}
