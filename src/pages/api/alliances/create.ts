import { AllianceService } from '@/services';
import { withAuth } from '@/middleware/auth';

const createAlliance = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const { user } = req.session;
  const {
    allianceName,
    name,
    avatar,
    motto,
    comments,
    is_public,
    require_auth,
    closed_enrollment,
  } = req.body || {};

  const resolvedName = (name ?? allianceName ?? "").toString().trim();
  if (!resolvedName) {
    return res.status(400).json({ error: "Alliance name is required" });
  }

  try {
    const alliance = await AllianceService.createAlliance(user.id, {
      name: resolvedName,
      avatar: avatar ? String(avatar) : undefined,
      motto: motto ? String(motto) : undefined,
      comments: comments ? String(comments) : undefined,
      is_public: typeof is_public === "boolean" ? is_public : undefined,
      require_auth: typeof require_auth === "boolean" ? require_auth : undefined,
      closed_enrollment:
        typeof closed_enrollment === "boolean" ? closed_enrollment : undefined,
    });
    return res.status(200).json(alliance);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(createAlliance);
