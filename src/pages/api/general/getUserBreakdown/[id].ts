'use server';
import { GeneralService } from '@/services';
import { withAuth } from "@/middleware/auth";

const handler = async (req, res) => {
    const { id, token } = req.query;
    const user = await GeneralService.getUserBreakdown(Number(id));
    return res.status(200).json(
      {
        status: 'success',
        results: {
          player: user.display_name,
          xp: user.experience,
          units: user.UserUnit,
          items: user.UserItem,
          battle_upgrades: user.UserBattleUpgrade,
          structure_upgrades: user.UserStructureUpgrade,
          fort: user.fort_level,
          proficiencies: user.UserBonusPoints
        }
      });
}

export default withAuth(handler);