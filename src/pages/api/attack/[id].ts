'use server';
import prisma from "@/lib/prisma";
import { attackHandler } from '@/app/actions';
import { withAuth } from '@/middleware/auth';

const handler = async (req, res) => {
  const session = req.session;
  if (session) {
    if (req.body.turns <= 0) {
      return res.status(400).json({ status: 'failed', message: 'Invalid number of turns' });
    }

    if (req.body.turns > 10) {
      return res.status(400).json({ status: 'failed', message: 'Max 10 turns' });
    }

    if (!req.query.id) {
      return res.status(400).json({ status: 'failed', message: 'Missing ID' });
    }

    if (session.user.id === parseInt(req.query.id)) {
      return res.status(400).json({ status: 'failed', message: 'Cannot attack yourself' });
    }

    const myUser = await prisma?.users.findUnique({
      where: { id: session.user.id },
    });

    if (!myUser) {
      return res.status(400).json({ status: 'failed' });
    }

    if (req.body.turns > myUser.attack_turns) {
      return res.status(400).json({ status: 'failed' });
    }

    const results = await attackHandler(
      session.user.id,
      parseInt(req.query.id),
      parseInt(req.body.turns)
    );

    return res
      .status(200)
      .json(results);
  }
  // console.log('failed: ', session);
  return res.status(401).json({ status: 'failed' });
}

export default withAuth(handler);