import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';

const handle = async (req, res) => {
  const session = req.session
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (req.method === 'POST') {
    const { recipients, subject, body } = req.body;

    try {
      // Loop through each recipient and send a message
      for (const recipient of recipients) {
        const recipientUser = await prisma.users.findUnique({
          where: {
            display_name: recipient,
          },
        });

        if (!recipientUser) {
          return res.status(404).json({ message: `Recipient ${recipient} not found` });
        }

        await prisma.messages.create({
          data: {
            subject,
            body,
            from_user_id: session.user?.id,
            to_user_id: recipientUser.id,
            unread: true,
            // other fields can be filled as required.
          },
        });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: 'An error occurred while sending the message.', error: error.message });
    }
  }

  return res.status(405).json({ message: 'Method not allowed.' });
}

export default withAuth(handle);