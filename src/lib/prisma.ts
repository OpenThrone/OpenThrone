import { PrismaClient } from '@prisma/client';

declare global {
  let prisma: PrismaClient | undefined;
}

const prisma = global.prisma || new PrismaClient({
  log: [
    //'query', // TODO: let's move this to .env instead or disable it in production
    'info',
    'warn',
    'error'
  ]
});

if (process.env.NODE_ENV === 'development') global.prisma = prisma;

export default prisma;
