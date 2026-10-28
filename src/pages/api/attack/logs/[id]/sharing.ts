import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import {
  getReportSharing,
  ReportShareActionSchema,
  ReportSharingError,
  updateReportSharing,
} from '@/services/ReportSharing.service';
import { logError } from '@/utils/logger';

export default withApiGuard({
  methods: ['GET', 'POST'],
  authMode: 'required',
  rateLimitProfile: 'attack_read',
  querySchema: z.object({ id: z.coerce.number().int().positive() }),
})(async (req, res, { query }) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const userId = Number(req.session?.user?.id);
  try {
    if (req.method === 'GET')
      return res.status(200).json(await getReportSharing(query.id, userId));
    const action = ReportShareActionSchema.safeParse(req.body);
    if (!action.success)
      return res.status(400).json({ message: 'Invalid sharing request' });
    return res
      .status(200)
      .json(await updateReportSharing(query.id, userId, action.data));
  } catch (error) {
    if (error instanceof ReportSharingError)
      return res.status(error.status).json({ message: error.message });
    logError('Report sharing failed', error);
    return res
      .status(500)
      .json({ message: 'Unable to update sharing. Please try again.' });
  }
});
