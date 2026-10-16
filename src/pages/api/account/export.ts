import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';

export default withApiGuard({
  methods: ['GET'],
  authMode: 'required',
  rateLimitProfile: 'password_reset',
  allowRestrictedAccount: true,
})(async (req, res) => {
  const userId = Number(req.session.user.id);
  const [user, attacks, defense, status, messages, reports, emailPreferences] =
    await Promise.all([
      prisma.users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          display_name: true,
          created_at: true,
          last_active: true,
          locale: true,
          bio: true,
          avatar: true,
          colorScheme: true,
        },
      }),
      prisma.attack_log.findMany({
        where: { attacker_id: userId },
        orderBy: { id: 'desc' },
        take: 100,
        select: {
          id: true,
          attacker_id: true,
          defender_id: true,
          timestamp: true,
          winner: true,
          type: true,
          pillaged_gold: true,
          attacker_losses_total: true,
          defender_losses_total: true,
        },
      }),
      prisma.attack_log.findMany({
        where: { defender_id: userId },
        orderBy: { id: 'desc' },
        take: 100,
        select: {
          id: true,
          attacker_id: true,
          defender_id: true,
          timestamp: true,
          winner: true,
          type: true,
          pillaged_gold: true,
          attacker_losses_total: true,
          defender_losses_total: true,
        },
      }),
      prisma.accountStatusHistory.findMany({
        where: { user_id: userId },
        orderBy: { id: 'desc' },
        select: { id: true, status: true, start_date: true, end_date: true },
      }),
      prisma.messages.findMany({
        where: { OR: [{ from_user_id: userId }, { to_user_id: userId }] },
        orderBy: { id: 'desc' },
        take: 50,
        select: {
          id: true,
          subject: true,
          body: true,
          from_user_id: true,
          to_user_id: true,
          date_time: true,
          unread: true,
        },
      }),
      // Only reports authored by this user; reports against them contain other people's private statements.
      prisma.report.findMany({
        where: { reporterUserId: userId },
        orderBy: { id: 'desc' },
        select: {
          id: true,
          reportedUserId: true,
          category: true,
          status: true,
          subject: true,
          description: true,
          createdAt: true,
        },
      }),
      prisma.emailPreference.findUnique({
        where: { userId },
        select: {
          newsEmails: true,
          announcementEmails: true,
          attackNotificationEmails: true,
          unsubscribedAllAt: true,
          updatedAt: true,
        },
      }),
    ]);
  const data = {
    exportedAt: new Date().toISOString(),
    user,
    accountStatusHistory: status,
    recentAttacks: attacks,
    recentDefense: defense,
    recentMessages: messages,
    reports,
    emailPreferences: emailPreferences ?? {
      newsEmails: true,
      announcementEmails: true,
      attackNotificationEmails: false,
      unsubscribedAllAt: null,
    },
    limits: { recentAttacks: 100, recentDefense: 100, recentMessages: 50 },
  };
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="openthrone-data-${userId}.json"`,
  );
  return res
    .status(200)
    .send(
      JSON.stringify(data, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    );
});
