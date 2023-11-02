import { getSession } from 'next-auth/react';

import prisma from '@/lib/prisma';

export default async function handle(req, res) {
  const session = await getSession({ req });
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const messageId = req.query.id;
  const userId = session.user.id;

  // Ensure the user is the intended recipient of the message
  const messageToDelete = await prisma.messages.findUnique({
    where: { id: Number(messageId) },
  });
  if (messageToDelete.to_user_id !== userId) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  if (req.method !== 'PUT') {
    return res.status(405).end();
  }

  const messageId = req.query.id;

  try {
    const updatedMessage = await prisma.messages.update({
      where: { id: Number(messageId) },
      data: {
        deletedByRecipient: true,
      },
    });

    res.status(200).json(updatedMessage);
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete the message.' });
  }
}
