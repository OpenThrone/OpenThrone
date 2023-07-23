'use server';

import prisma from '@/lib/prisma';

export default async function handler(req, res) {
  console.log(req.query.id);
  const exists = await prisma.users.findUnique({
    where: { id: parseInt(req.query?.id, 10) },
  });
  if (exists) {
    const results = await prisma.attack_log.findMany({
      where: {
        OR: [
          { attacker_id: parseInt(req.query.id, 10) },
          { defender_id: parseInt(req.query.id, 10) },
        ],
      },
    });
    res.status(200).json(results);
  } else {
    res.status(200).json(['User not found']);
  }
}
