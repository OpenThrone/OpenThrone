import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { obligationOutstanding } from '@/services/ForceDues.service';

const handler = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const userId = Number(req.session?.user?.id);
  const dues = await prisma.forceObligation.findMany({
    where: {
      userId,
      cancelledAt: null,
      dueAt: { lte: new Date(Date.now() + 86400000) },
      alliance: { members: { some: { user_id: userId } } },
    },
    orderBy: { dueAt: 'asc' },
  });
  const relevant = dues.filter(obligationOutstanding);
  return res.status(200).json({
    count: relevant.length,
    allianceId: relevant[0]?.allianceId ?? null,
    overdue: relevant.some((due) => due.dueAt < new Date()),
  });
};
export default withAuth(handler);
