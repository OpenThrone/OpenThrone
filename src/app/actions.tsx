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

export async function trainHandler(playerId) {
  'use server';

  const player: UserModel = await prisma?.users.findUnique({
    where: { id: playerId },
  });

  if (player) {
    const PlayerModelInstance = new UserModel(player);

    // Training logic here...
    // For example:
    // PlayerModelInstance.offense += 10;  // Increase offense by 10 for demonstration purposes

    // Save the updated player details to the database
    const updatedPlayer = await prisma?.users.update({
      where: { id: playerId },
      data: {
        offense: PlayerModelInstance.offense, // Update the offense value or any other attributes here
      },
    });

    return {
      status: 'success',
      player: updatedPlayer,
    };
  }
  return { status: 'failed' };
}
