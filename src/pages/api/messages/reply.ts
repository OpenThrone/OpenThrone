import { getSession } from 'next-auth/react';

import prisma from '@/lib/prisma';

export default async function handle(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const session = await getSession({ req });
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const { originalMessageId, subject, body } = req.body;
  const { userId } = session;

  try {
    const originalMessage = await prisma.messages.findUnique({
      where: { id: originalMessageId },
    });

    if (!originalMessage) {
      return res.status(404).json({ message: 'Original message not found.' });
    }

    const newMessage = await prisma.messages.create({
      data: {
        subject,
        body,
        from_user_id: userId,
        to_user_id: originalMessage.from_user_id,
        unread: true,
        created_date: new Date(),
      },
    });

    res.status(200).json(newMessage);
  } catch (error) {
    res.status(500).json({ error: 'Failed to send reply.' });
  }
}
