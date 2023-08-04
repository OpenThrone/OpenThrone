import prisma from '@/lib/prisma';

export default async function handle(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const { originalMessageId, recipientId, subject, body } = req.body;

  try {
    const originalMessage = await prisma.messages.findUnique({
      where: { id: originalMessageId },
    });

    if (!originalMessage) {
      return res.status(404).json({ message: 'Original message not found.' });
    }

    const forwardedMessage = await prisma.messages.create({
      data: {
        subject,
        body,
        from_user_id: originalMessage.from_user_id,
        to_user_id: recipientId,
        unread: true,
        created_date: new Date(),
      },
    });

    res.status(200).json(forwardedMessage);
  } catch (error) {
    res.status(500).json({ error: 'Failed to forward the message.' });
  }
}
