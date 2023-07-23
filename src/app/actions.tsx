import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';

export async function attackHandler(attackerId, defenderId) {
  'use server';

  const attacker: UserModel = await prisma?.users.findUnique({
    where: { id: attackerId },
  });
  const defender: UserModel = await prisma?.users.findUnique({
    where: { id: defenderId },
  });
  if (attacker && defender) {
    const AttackPlayer = new UserModel(attacker);
    const DefensePlayer = new UserModel(defender);
    return {
      status: 'success',
      result: AttackPlayer.offense > DefensePlayer.defense,
      attacker: AttackPlayer,
      defender: DefensePlayer,
    };
  }
  return { status: 'failed' };
}
