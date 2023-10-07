import md5 from 'md5';
import type { NextApiRequest, NextApiResponse } from 'next';

import prisma from '@/lib/prisma';

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    await handlePOST(res, req);
  } else {
    throw new Error(
      `The HTTP ${req.method} method is not supported at this route.`
    );
  }
}

export async function handlePOST(res: NextApiResponse, req: NextApiRequest) {
  try {
    const { email, password, race, display_name } = await req.body;
    
    const exists = await prisma.users.findUnique({
      where: {
        email,
      },
    });

    if (exists) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const phash = await Bun.password.hash(password);
    
    const user = await prisma.users.create({
      data: {
        email,
        password_hash: phash,
        display_name,
        race,
        class: req.body.class,
      },
    });
    
    await prisma.users.update({
      where: { id: user.id },
      data: { recruit_link: md5(user.id.toString()) },
    });

    return res.json(user);

  } catch (error) {
    console.error('Error in handlePOST:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

