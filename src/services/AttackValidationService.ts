import prisma from '@/lib/prisma';

/**
 * Checks if an attacker can attack a defender based on recent attack history (max 5 attacks in 24 hours).
 * @param attacker - The attacker user object.
 * @param defender - The defender user object.
 * @returns True if the attack is allowed, false otherwise.
 */
export const canAttack = async (attacker: { id: number }, defender: { id: number }) => {
  const history = await prisma.attack_log.count({
    where: {
      AND: [
        { attacker_id: attacker.id },
        { defender_id: defender.id },
        { type: 'attack' },
        { timestamp: { gte: new Date(new Date().getTime() - 1000 * 60 * 60 * 24) } }, // Last 24 hours
      ]
    },
  });
  return history < 5; // Allow if less than 5 attacks
};

/**
 * Checks if an attacker can assassinate a defender based on recent intel history (max 5 intel missions in 24 hours).
 * Note: This currently checks 'INTEL' type, adjust if assassination has its own type or limit.
 * @param attacker - The attacker user object.
 * @param defender - The defender user object.
 * @returns True if the assassination is allowed, false otherwise.
 */
export const canAssassinate = async (attacker: { id: number }, defender: { id: number }) => {
  const history = await prisma.attack_log.count({
    where: {
      AND: [
        { attacker_id: attacker.id },
        { defender_id: defender.id },
        { type: 'INTEL' }, // Assuming assassination limit is tied to INTEL missions
        { timestamp: { gte: new Date(new Date().getTime() - 1000 * 60 * 60 * 24) } },
      ]
    },
  });
  return history < 5;
};

/**
 * Checks if an attacker can infiltrate a defender based on recent infiltration history (max 5 infiltrations in 24 hours).
 * @param attacker - The attacker user object.
 * @param defender - The defender user object.
 * @returns True if the infiltration is allowed, false otherwise.
 */
export const canInfiltrate = async (attacker: { id: number }, defender: { id: number }) => {
  const history = await prisma.attack_log.count({
    where: {
      AND: [
        { attacker_id: attacker.id },
        { defender_id: defender.id },
        { type: 'INFILTRATE' },
        { timestamp: { gte: new Date(new Date().getTime() - 1000 * 60 * 60 * 24) } },
      ]
    },
  });
  return history < 5;
};