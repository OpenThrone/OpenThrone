import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { getDepositHistory } from '@/services/bank.service';
import UserModel from '@/models/Users';

const getDeposits = async (req: NextApiRequest, res: NextApiResponse) => {
  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const history = await getDepositHistory(Number(session.user.id));
    const user = await prisma.users.findUnique({
      where: { id: Number(session.user.id) },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const getCountdown = (timestamp: string) => {
      var targetDate = new Date(timestamp);
      targetDate.setHours(targetDate.getHours() + 24);
      var currentDate = new Date();
      var timeDiff = targetDate.getTime() - currentDate.getTime();

      if (timeDiff > 0) {
        var hours = Math.floor(timeDiff / (1000 * 60 * 60));
        var minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
        var seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
        return { hours, minutes, seconds };
      } else {
        return { hours: 0, minutes: 0, seconds: 0 };
      }
    };

    const userMod = new UserModel(user);
    return res.status(200).json({
      deposits: userMod.maximumBankDeposits - history.length,
      nextDepositAvailable: history.length > 0 ? getCountdown(history[0].date_time.toString()) : 0,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(getDeposits);
