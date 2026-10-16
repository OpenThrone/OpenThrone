import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../prisma/generated/prisma/client';
import { logError, logInfo } from '../src/utils/logger';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.POSTGRES_PRISMA_URL }),
});

async function checkUserUnitConstraint() {
  try {
    // Query the database to check the indexes on UserUnit table
    const result = await prisma.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'UserUnit'
    `;

    logInfo('UserUnit table indexes:', result);

    // Check if the correct unique constraint exists
    const hasCorrectConstraint = result.some(
      (idx) => idx.indexname === 'UserUnit_userId_type_level_isMercenary_key',
    );

    if (hasCorrectConstraint) {
      logInfo(
        '\n✅ SUCCESS: The correct unique constraint (userId, type, level, isMercenary) exists!',
      );
    } else {
      logInfo('\n❌ ERROR: The correct unique constraint does NOT exist!');
      logInfo('Expected: UserUnit_userId_type_level_isMercenary_key');
    }
  } catch (error) {
    logError('Error checking constraint:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserUnitConstraint();
