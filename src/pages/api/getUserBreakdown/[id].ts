'use server';
import prisma from "@/lib/prisma";
import { withAuth } from "@/middleware/auth";

const handler = async (req, res) => {
    const { id, token } = req.query;
    const user = await prisma?.users.findUnique({
      where: { id: Number(id) },
    });
    return res.status(200).json(
      {
        status: 'success',
        results: {
          player: user.display_name,
          xp: user.experience,
          units: user.units,
          items: user.items,
          battle_upgrades: user.battle_upgrades,
          structure_upgrades: user.structure_upgrades,
          fort: user.fort_level,
          proficiencies: user.bonus_points
        }
      });
}

export default withAuth(handler);