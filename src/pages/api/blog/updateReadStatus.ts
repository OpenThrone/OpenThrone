import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';


export default async function updateReadStatus(req: NextApiRequest, res: NextApiResponse) {
  if(req.method !== 'POST') {
    res.status(405).json({error: 'Method not allowed'});
    return;
  }
  // Get the session on the server-side
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const { postId, isRead } = req.body;

  // Update the read status for the current user
  await prisma.post_read_status.upsert({
    where: {
      post_id_user_id: {
        user_id: parseInt(session.user.id.toString()),
        post_id: postId,
      },
    },
    update: {
      last_read_at: new Date(),
    },
    create: {
      user_id: parseInt(session.user.id.toString()),
      post_id: postId,
      last_read_at: new Date(),
    },
  });

}