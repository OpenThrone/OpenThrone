declare module '@/models/Users' {
  import type { Prisma } from '@prisma/client';

  // A permissive compatibility declaration for UserModel used during the
  // migration from legacy JSON fields to normalized relation arrays. This
  // allows older call-sites that passed boolean flags or partial args to
  // compile while we progressively convert callers to the new API.
  export default class UserModel {
    [key: string]: any;
    constructor(
      userData?: any | Prisma.users | null,
      units?: any,
      items?: any,
      structure_upgrades?: any,
      battle_upgrades?: any,
      bonus_points?: any,
      permissions?: any,
      stats?: any,
      filtered?: boolean,
      checkStats?: boolean,
    );
  }
}
