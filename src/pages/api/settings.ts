import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth/next';

import { authOptions } from './auth/[...nextauth]';
import password from 'inquirer/lib/prompts/password';
import { Locales, PlayerRace } from '@/types/typings';

const prisma = new PrismaClient();
const argon2 = require('argon2');
export default async (req, res) => {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await prisma.users.findUnique({
    where: {
      id: session.user.id,
    },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  switch (req.body.type) {
    case 'password':
      if (req.body.password !== req.body.password_confirm) {
        return res.status(400).json({ error: 'Passwords do not match' });
      }
      if (await argon2.verify(password, user.password_hash) === false)
        return res.status(400).json({ error: 'Incorrect password' });
        
      await prisma.users.update({
        where: {
          id: session.user.id,
        },
        data: {
          password_hash: await argon2.hash(req.body.password),
        },
      });

      return res.status(200).json({ success: true });
    case 'gameoptions':

      const locales: Locales[] = ['en-US', 'es-ES'];
      const colorSchemes: PlayerRace[] = ['UNDEAD', 'HUMAN', 'GOBLIN', 'ELF'];
      console.log(session);
      if (!req.body.colorScheme || !req.body.locale) return res.status(400).json({ error: 'Missing parameters' })
      if (colorSchemes.includes(req.body.colorScheme) === false) return res.status(400).json({ error: 'Invalid color scheme' })
      if (locales.includes(req.body.locale) === false) return res.status(400).json({ error: 'Invalid locale' })
      
      await prisma.users.update({
        where: {
          id: session?.user?.id,
        },
        data: {
          locale: req.body.locale,
          colorScheme: req.body.colorScheme,
        },
      });
      return res.status(200).json({ success: true });
  }

  return res.status(200).json(req.body);
};
