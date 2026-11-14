import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { EconomyUpgrades, Fortifications, HouseUpgrades } from '@/constants';
import { ALLIANCE_DUES_ARREARS_MAX } from '@/constants/allianceDues';
import prisma from '@/lib/prisma';
import {
  ItemType,
  ItemUsage,
  PermissionType,
  UnitType,
} from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { AdminService } from '@/services/Admin.service';
import { recordItemLedger } from '@/services/ItemLedger.service';
import type { AuthenticatedRequest } from '@/types/api'; // Import the shared type
import { recomputeStoredStatsInTx } from '@/utils/adminRecomputeStats';
import { currentStatus, deriveAdminUserStatus } from '@/utils/adminStatus';
import { AppConfig } from '@/utils/AppConfig';
import { getRequestIp, logAction, logActionStrict } from '@/utils/auditLogger';
import { countOtherAdministrators } from '@/utils/authorization';
import { lockEraLifecycleShared } from '@/utils/eraLifecycleLock';
import { levelReachedAtUpdate } from '@/utils/levelReachedAt';
import { logError } from '@/utils/logger';
import { getLevelFromXP } from '@/utils/utilities';

const AdminUserQuerySchema = z.object({
  userId: z.coerce.number().int().positive(),
});

const MONEY_MAX = 9223372036854775807n;
const MoneySchema = z
  .union([z.string().regex(/^\d+$/), z.number().int().nonnegative().safe()])
  .transform((value) => BigInt(value))
  .refine((value) => value <= MONEY_MAX, 'Amount is too large');
export const INT_MAX = 2147483647;
const QuantitySchema = z.number().int().min(0).max(INT_MAX);
/** Alliance dues arrears: whole gold, 0..ALLIANCE_DUES_ARREARS_MAX. */
export const DuesArrearsSchema = z
  .union([z.string().regex(/^\d+$/), z.number().int().nonnegative().safe()])
  .transform((value) => BigInt(value))
  .refine(
    (value) => value <= ALLIANCE_DUES_ARREARS_MAX,
    `Dues arrears can be at most ${ALLIANCE_DUES_ARREARS_MAX.toLocaleString('en-US')} gold`,
  );
/** Small allowance for the admin's clock running ahead of the server's. */
const FUTURE_SKEW_MS = 60_000;
/**
 * When the player reached their current level (#334): an ISO timestamp that
 * is not in the future, or null for "just reached" (no anti-camping ramp).
 */
export const LevelReachedAtSchema = z
  .string()
  .datetime({ offset: true })
  .refine(
    (value) => new Date(value).getTime() <= Date.now() + FUTURE_SKEW_MS,
    'Level reached date cannot be in the future',
  )
  .nullable();

export const MAX_FORT_LEVEL = Math.max(...Fortifications.map((f) => f.level));
export const MAX_HOUSE_LEVEL = Math.max(
  ...Object.keys(HouseUpgrades).map(Number),
);
// economy_level indexes EconomyUpgrades (see Structure.service upgrades).
export const MAX_ECONOMY_LEVEL = EconomyUpgrades.length - 1;
export const PLAYER_RACES = ['ELF', 'HUMAN', 'GOBLIN', 'UNDEAD'] as const;
export const PLAYER_CLASSES = [
  'FIGHTER',
  'CLERIC',
  'ASSASSIN',
  'THIEF',
] as const;
export const VETERAN_TITLES = ['ERA1_TESTER'] as const;
export const BIO_MAX_LENGTH = 2000;

export const fortMaxHitpoints = (level: number) =>
  Fortifications.find((f) => f.level === level)?.hitpoints ?? 0;

const GameplayFieldsSchema = z.object({
  fortLevel: z.number().int().min(1).max(MAX_FORT_LEVEL),
  fortHitpoints: z.number().int().min(0).max(INT_MAX),
  stamina: z.number().int().min(0).max(INT_MAX),
  maxStamina: z.number().int().min(1).max(INT_MAX),
  // MAX_ATTACK_TURNS caps turns spent per attack, not the stored balance.
  attackTurns: z.number().int().min(0).max(INT_MAX),
  houseLevel: z.number().int().min(0).max(MAX_HOUSE_LEVEL),
  economyLevel: z.number().int().min(0).max(MAX_ECONOMY_LEVEL),
  race: z.enum(PLAYER_RACES),
  class: z.enum(PLAYER_CLASSES),
  locale: z.enum(AppConfig.locales),
  bio: z.string().max(BIO_MAX_LENGTH),
  // Veteran badge; edits send only changed fields (patch schema below).
  veteranTitle: z.enum(VETERAN_TITLES).nullable().optional(),
  veteranSince: z.string().datetime().nullable().optional(),
});
/** Full gameplay block; stamina may not exceed max stamina. */
export const GameplaySchema = GameplayFieldsSchema.refine(
  (value) => value.stamina <= value.maxStamina,
  { message: 'Stamina cannot exceed max stamina', path: ['stamina'] },
);
/** Edits send only changed gameplay fields; cross-field rules run on the merged row. */
export const GameplayPatchSchema = GameplayFieldsSchema.partial();
export type AdminGameplayUpdate = z.infer<typeof GameplaySchema>;

export const STALE_EDIT_MESSAGE =
  'This player changed since you opened the editor. Reload to see current values.';

/**
 * Loaded values the editor based its edit on. Any mismatch with the locked
 * row means a concurrent change, so the edit is rejected instead of
 * overwriting live gameplay.
 */
const ExpectedSchema = z.object({
  eraId: z.number().int().nullable(),
  fields: z
    .record(z.string(), z.union([z.string(), z.number(), z.null()]))
    .default({}),
  units: z.record(z.string(), z.number().int()).default({}),
  items: z.record(z.string(), z.number().int()).default({}),
  /** Loaded dues arrears per alliance id, as whole-gold strings. */
  duesArrears: z.record(z.string(), z.string()).default({}),
  permissions: z.array(z.nativeEnum(PermissionType)).max(100).optional(),
  staffRoles: z.array(z.string()).max(4).optional(),
});
type AdminExpected = z.infer<typeof ExpectedSchema>;

/**
 * Every mutation the request carries must name the value it was based on;
 * returns the mutations that lack one (the request is then rejected).
 */
export function findMissingExpectations(update: {
  profile: Record<string, unknown>;
  stats: Record<string, unknown>;
  gameplay?: Record<string, unknown>;
  army: { units: { id: string }[] };
  items: { items: { id: string }[] };
  alliances?: { memberships: { allianceId: number }[] };
  permissions?: unknown;
  staffRoles?: unknown;
  expected: Partial<AdminExpected>;
}): string[] {
  const expected = {
    ...update.expected,
    fields: update.expected.fields ?? {},
    units: update.expected.units ?? {},
    items: update.expected.items ?? {},
    duesArrears: update.expected.duesArrears ?? {},
  };
  const missing: string[] = [];
  const scalarKeys = [
    ...Object.keys(update.profile),
    ...Object.keys(update.stats),
    ...Object.keys(update.gameplay ?? {}),
  ].filter(
    (key) =>
      ({ ...update.profile, ...update.stats, ...update.gameplay })[key] !==
      undefined,
  );
  for (const key of scalarKeys)
    if (!(key in expected.fields)) missing.push(key);
  // A fort level change can clamp hitpoints, so it needs the loaded HP too.
  if (
    update.gameplay?.fortLevel !== undefined &&
    !('fortHitpoints' in expected.fields) &&
    !missing.includes('fortHitpoints')
  )
    missing.push('fortHitpoints');
  for (const unit of update.army.units)
    if (!(unit.id in expected.units)) missing.push(`unit ${unit.id}`);
  for (const item of update.items.items)
    if (!(item.id in expected.items)) missing.push(`item ${item.id}`);
  for (const membership of update.alliances?.memberships ?? [])
    if (!(String(membership.allianceId) in expected.duesArrears))
      missing.push(`dues arrears ${membership.allianceId}`);
  if (update.permissions && !expected.permissions) missing.push('permissions');
  if (update.staffRoles && !expected.staffRoles) missing.push('staffRoles');
  return missing;
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value) => b.includes(value));

/** Names of `expected.fields` keys whose loaded value no longer matches. */
export function findStaleFields(
  current: Record<string, unknown>,
  expected: Record<string, string | number | null> = {},
): string[] {
  const normalize = (key: string, value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return key === 'email' ? text.trim().toLowerCase() : text;
  };
  return Object.keys(expected).filter(
    (key) =>
      !(key in current) ||
      normalize(key, current[key]) !== normalize(key, expected[key]),
  );
}

/** Proficiency points spent; each player level grants one (UserStatsService). */
export function usedBonusPoints(rows: { level?: number | null }[] = []) {
  return rows.reduce((sum, row) => sum + (row.level || 0), 0);
}

/** Error carrying the HTTP status the admin editor should see. */
export class AdminUpdateError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Validates fort hitpoints against the resulting level. Lowering the level
 * clamps HP to the new maximum; otherwise HP above the maximum is rejected.
 */
export function resolveFortHitpoints(
  previousLevel: number,
  nextLevel: number,
  requestedHp: number,
): number {
  const max = fortMaxHitpoints(nextLevel);
  if (requestedHp <= max) return requestedHp;
  if (nextLevel < previousLevel) return max;
  throw new AdminUpdateError(
    422,
    `Fort hitpoints cannot exceed ${max} at fort level ${nextLevel}`,
  );
}

export interface VeteranFields {
  veteranTitle: (typeof VETERAN_TITLES)[number] | null;
  veteranSince: string | null;
}

/**
 * Merges a veteran-title patch onto the loaded row and validates the result:
 * the since date is an ISO datetime not in the future, and clearing the title
 * clears the date with it. Undefined patch fields mean "not edited".
 */
export function resolveVeteranFields(
  current: VeteranFields,
  patch: Partial<VeteranFields>,
  now = new Date(),
): VeteranFields {
  const veteranTitle =
    patch.veteranTitle !== undefined
      ? patch.veteranTitle
      : (current.veteranTitle ?? null);
  let veteranSince =
    patch.veteranSince !== undefined
      ? patch.veteranSince
      : (current.veteranSince ?? null);
  if (!veteranTitle) veteranSince = null;
  if (veteranSince) {
    const since = new Date(veteranSince);
    if (Number.isNaN(since.getTime()))
      throw new AdminUpdateError(422, 'Veteran since date is invalid');
    if (since.getTime() > now.getTime())
      throw new AdminUpdateError(
        422,
        'Veteran since date cannot be in the future',
      );
  }
  return { veteranTitle, veteranSince };
}

type DiffValue = string | number | boolean | null;
export type FieldDiff = Record<string, { before: DiffValue; after: DiffValue }>;

const toDiffValue = (value: unknown): DiffValue => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
};

/** Before/after pairs for every key whose value changed. */
export function buildFieldDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldDiff {
  const diff: FieldDiff = {};
  for (const key of Object.keys(after)) {
    if (after[key] === undefined) continue;
    const prev = toDiffValue(before[key]);
    const next = toDiffValue(after[key]);
    if (prev !== next) diff[key] = { before: prev, after: next };
  }
  return diff;
}

const setDiff = (before: string[], after: string[]) => {
  const added = after.filter((value) => !before.includes(value));
  const removed = before.filter((value) => !after.includes(value));
  return added.length || removed.length ? { added, removed } : undefined;
};
const AdminUserUpdateSchema = z.object({
  profile: z
    .object({
      username: z.string().trim().min(3).max(100).optional(),
      email: z.string().trim().email().optional(),
    })
    .default({}),
  stats: z
    .object({
      gold: MoneySchema.optional(),
      goldInBank: MoneySchema.optional(),
      experience: QuantitySchema.optional(),
      levelReachedAt: LevelReachedAtSchema.optional(),
    })
    .default({}),
  army: z
    .object({
      units: z
        .array(
          z.object({
            id: z.string(),
            type: z.nativeEnum(UnitType),
            level: z.number().int().min(1).max(100),
            isMercenary: z.boolean().default(false),
            quantity: QuantitySchema,
          }),
        )
        .max(1000),
    })
    .default({ units: [] }),
  items: z
    .object({
      items: z
        .array(
          z.object({
            id: z.string(),
            type: z.nativeEnum(ItemType),
            usage: z.nativeEnum(ItemUsage),
            level: z.number().int().min(1).max(100),
            quantity: QuantitySchema,
          }),
        )
        .max(1000),
    })
    .default({ items: [] }),
  permissions: z
    .object({
      permissions: z.array(z.nativeEnum(PermissionType)).max(100),
    })
    .optional(),
  /** Alliance dues arrears per membership (allianceDues.ts). */
  alliances: z
    .object({
      memberships: z
        .array(
          z.object({
            allianceId: z.number().int().positive(),
            duesArrears: DuesArrearsSchema,
          }),
        )
        .max(10),
    })
    .optional(),
  gameplay: GameplayPatchSchema.optional(),
  expected: ExpectedSchema,
  staffRoles: z
    .object({
      roles: z
        .array(
          z.enum([
            'ADMINISTRATOR',
            'MODERATOR',
            'COMMUNITY_MANAGER',
            'GAME_MASTER',
          ]),
        )
        .max(4),
    })
    .optional(),
});
const guardedRead = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_USERS],
  rateLimitProfile: 'admin',
  querySchema: AdminUserQuerySchema,
});
const guardedUpdate = withApiGuard({
  methods: ['PUT'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  querySchema: AdminUserQuerySchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof AdminUserQuerySchema> },
) {
  const { userId: userIdNum } = context.query;

  // GET - Fetch user details
  if (req.method === 'GET') {
    try {
      // Fetch basic user data
      const user = await prisma.users.findUnique({
        where: { id: userIdNum },
        include: {
          supporterMembership: { select: { badgeVisible: true } },
          UserUnit: true,
          UserItem: true,
          statusHistories: {
            orderBy: [{ start_date: 'desc' }, { id: 'desc' }],
            take: 200,
            select: {
              id: true,
              status: true,
              start_date: true,
              end_date: true,
              reason: true,
              admin: { select: { id: true, display_name: true } },
            },
          },
          alliance_memberships: {
            select: {
              alliance: { select: { id: true, name: true, leader_id: true } },
              role: { select: { name: true } },
              dues_arrears: true,
              dues_paid_through: true,
            },
          },
          permissions: {
            where: { revokedAt: null },
            select: { type: true },
          },
          staffRoleAssignments: {
            where: { revokedAt: null },
            select: { role: true },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const activeEra = await prisma.era.findFirst({
        where: { endDate: null },
        orderBy: { startDate: 'desc' },
        select: { id: true },
      });

      // Format the response
      const formattedResponse = {
        profile: {
          id: user.id.toString(),
          username: user.display_name,
          email: user.email,
          status: deriveAdminUserStatus({
            latestStatus: currentStatus(user.statusHistories),
            lastActive: user.last_active,
            currentEraId: user.currentEraId,
            activeEraId: activeEra?.id ?? null,
          }),
          lastActive: user.last_active,
          joinDate: user.created_at,
        },
        stats: {
          gold: user?.gold.toString() || 0,
          experience: user?.experience || 0,
          goldInBank: user?.gold_in_bank.toString() || 0,
          level: getLevelFromXP(user.experience ?? 0),
          levelReachedAt: user.level_reached_at?.toISOString() ?? null,
        },
        gameplay: {
          fortLevel: user.fort_level,
          fortHitpoints: user.fort_hitpoints,
          stamina: user.stamina,
          maxStamina: user.maxStamina,
          attackTurns: user.attack_turns,
          houseLevel: user.house_level,
          economyLevel: user.economy_level,
          race: user.race,
          class: user.class,
          locale: user.locale,
          bio: user.bio,
          veteranTitle: user.veteranTitle ?? null,
          veteranSince: user.veteranSince?.toISOString() ?? null,
        },
        derived: {
          offense: user.offense ?? 0,
          defense: user.defense ?? 0,
          spy: user.spy ?? 0,
          sentry: user.sentry ?? 0,
        },
        record: {
          supporterUntil: user.supporter_until?.toISOString() ?? null,
          badgeVisible: user.supporterMembership?.badgeVisible ?? true,
          rank: user.rank,
          lastActive: user.last_active,
          createdAt: user.created_at,
          currentEraId: user.currentEraId,
          eraJoinedAt: user.era_joined_at,
          protectionForfeitedEraId: user.protection_forfeited_era_id,
          alliances: (user.alliance_memberships ?? []).map((membership) => ({
            allianceId: membership.alliance.id,
            name: membership.alliance.name,
            role: membership.role?.name ?? null,
            isLeader: membership.alliance.leader_id === user.id,
            duesArrears: String(membership.dues_arrears ?? 0n),
            duesPaidThrough:
              membership.dues_paid_through?.toISOString() ?? null,
          })),
          statusHistory: (user.statusHistories ?? []).map((entry) => ({
            id: entry.id,
            status: entry.status,
            startDate: entry.start_date,
            endDate: entry.end_date,
            reason: entry.reason,
            adminName: entry.admin?.display_name ?? null,
          })),
        },
        army: {
          units: (user.UserUnit ?? []).map((unit) => ({
            id: `${unit.type}:${unit.level}:${unit.isMercenary}`,
            name: unit.type,
            type: unit.type,
            quantity: unit.quantity,
            level: unit.level,
            isMercenary: unit.isMercenary,
          })),
        },
        items: {
          items: (user.UserItem ?? []).map((item) => ({
            id: `${item.type}:${item.usage}:${item.level}`,
            name: item.type,
            type: item.type,
            usage: item.usage,
            quantity: item.quantity,
            level: item.level,
          })),
        },
        permissions: {
          permissions: user.permissions?.map((p) => p.type) || [],
        },
        staffRoles: {
          roles: user.staffRoleAssignments?.map((a) => a.role) || [],
        },
      };

      // The detail view carries the account email; fail closed without a record.
      await logActionStrict({
        userId: Number(req.session?.user?.id),
        action: 'ADMIN_USER_DETAIL_READ',
        ip: getRequestIp(req),
        targetUserId: user.id,
      });

      res.status(200).json(formattedResponse);
    } catch (error) {
      logError('Error fetching user details:', error);
      res.status(500).json({ error: 'Failed to fetch user details' });
    }
  }
  // PUT - Update user
  else if (req.method === 'PUT') {
    const adminUserId = Number(req.session?.user?.id);
    const ip = getRequestIp(req);
    const auditDetails: Record<string, unknown> = { targetUserId: userIdNum };
    let auditAction = 'ADMIN_USER_UPDATE_FAILED';
    let status = 500;
    let body: { message?: string; error?: string; code?: string } = {
      error: 'Failed to update user',
    };

    try {
      const parsed = AdminUserUpdateSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(422).json({
          error: 'Invalid user update',
          details: parsed.error.flatten().fieldErrors,
        });
      const updateData = parsed.data;
      // Optimistic concurrency is mandatory: every change names its base value.
      const missingExpectations = findMissingExpectations(
        updateData as Parameters<typeof findMissingExpectations>[0],
      );
      if (missingExpectations.length > 0)
        return res.status(422).json({
          error: `Missing expected values for: ${missingExpectations.join(', ')}`,
        });
      const duesIds = (updateData.alliances?.memberships ?? []).map(
        (membership) => membership.allianceId,
      );
      if (new Set(duesIds).size !== duesIds.length)
        return res
          .status(422)
          .json({ error: 'Duplicate alliance memberships' });
      const unitIds = updateData.army.units.map((unit) => unit.id);
      const itemIds = updateData.items.items.map((item) => item.id);
      if (
        new Set(unitIds).size !== unitIds.length ||
        new Set(itemIds).size !== itemIds.length
      ) {
        return res
          .status(422)
          .json({ error: 'Duplicate inventory identities' });
      }
      const denial = await prisma.$transaction(
        async (tx) => {
          // Same order as gameplay: shared era lock, then the player row.
          await lockEraLifecycleShared(tx);
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${userIdNum} FOR UPDATE`;
          // Fetch current user data to update JSON fields
          const user = await tx.users.findUnique({
            where: { id: userIdNum },
            include: {
              UserUnit: true,
              UserItem: true,
              UserBonusPoints: true,
              permissions: {
                where: { revokedAt: null },
                select: { type: true },
              },
              staffRoleAssignments: {
                where: { revokedAt: null },
                select: { role: true },
              },
            },
          });

          if (!user) {
            throw new AdminUpdateError(404, 'User not found');
          }
          const duesMemberships =
            Object.keys(updateData.expected.duesArrears).length > 0 ||
            duesIds.length > 0
              ? await tx.alliance_memberships.findMany({
                  where: { user_id: userIdNum },
                  select: {
                    id: true,
                    alliance_id: true,
                    dues_arrears: true,
                  },
                })
              : [];

          // Deliberately unfiltered by revokedAt: an account that has ever held
          // a role or grant stays locked, so revoke-then-edit cannot bypass it.
          const staffRows = await tx.staffRoleAssignment.findMany({
            where: { userId: userIdNum },
            select: { role: true, revokedAt: true },
          });
          const grantCount = await tx.permissionGrant.count({
            where: { user_id: userIdNum },
          });

          const isSelf = adminUserId === userIdNum;
          const targetIsAdmin = staffRows.some(
            (row) => row.role === 'ADMINISTRATOR' && row.revokedAt === null,
          );
          const emailChanged =
            updateData.profile.email !== undefined &&
            updateData.profile.email.trim().toLowerCase() !==
              (user.email ?? '').trim().toLowerCase();
          const holdsStaffOrGrant = staffRows.length > 0 || grantCount > 0;

          auditDetails.emailChanged = emailChanged;
          auditDetails.targetIsStaff = holdsStaffOrGrant;

          // Administrators may not edit other administrators at all.
          if (!isSelf && targetIsAdmin) {
            auditDetails.reason = 'admin_on_admin';
            return {
              status: 403,
              error: 'Administrators cannot edit other administrators',
            };
          }

          // Dropping your own ADMINISTRATOR role must not leave nobody in charge.
          const dropsOwnAdmin =
            isSelf &&
            targetIsAdmin &&
            !!updateData.staffRoles &&
            !updateData.staffRoles.roles.includes('ADMINISTRATOR');
          if (
            dropsOwnAdmin &&
            (await countOtherAdministrators(userIdNum, tx)) === 0
          ) {
            auditDetails.reason = 'last_administrator';
            return {
              status: 409,
              error: 'The last administrator cannot remove their own role',
            };
          }

          // Email changes on staff accounts enable takeover via password reset.
          if (emailChanged && holdsStaffOrGrant) {
            auditDetails.reason = 'staff_email_change';
            return {
              status: 403,
              error:
                'Email cannot be changed on staff or permissioned accounts',
            };
          }

          const currentFields: Record<string, unknown> = {
            username: user.display_name,
            email: user.email,
            gold: user.gold,
            goldInBank: user.gold_in_bank,
            experience: user.experience,
            levelReachedAt: user.level_reached_at?.toISOString() ?? null,
            fortLevel: user.fort_level,
            fortHitpoints: user.fort_hitpoints,
            stamina: user.stamina,
            maxStamina: user.maxStamina,
            attackTurns: user.attack_turns,
            houseLevel: user.house_level,
            economyLevel: user.economy_level,
            race: user.race,
            class: user.class,
            locale: user.locale,
            bio: user.bio,
            veteranTitle: user.veteranTitle ?? null,
            veteranSince: user.veteranSince?.toISOString() ?? null,
          };

          // Optimistic concurrency: the edit must be based on current values.
          const { expected } = updateData;
          {
            const stale = findStaleFields(currentFields, expected.fields);
            if (
              expected.permissions &&
              !sameSet(
                expected.permissions,
                (user.permissions ?? []).map((p) => p.type),
              )
            )
              stale.push('permissions');
            if (
              expected.staffRoles &&
              !sameSet(
                expected.staffRoles,
                (user.staffRoleAssignments ?? []).map((a) => a.role),
              )
            )
              stale.push('staffRoles');
            for (const [id, qty] of Object.entries(expected.units)) {
              const row = (user.UserUnit ?? []).find(
                (r) => `${r.type}:${r.level}:${r.isMercenary}` === id,
              );
              if (row?.quantity !== qty) stale.push(`unit ${id}`);
            }
            for (const [id, qty] of Object.entries(expected.items)) {
              const row = (user.UserItem ?? []).find(
                (r) => `${r.type}:${r.usage}:${r.level}` === id,
              );
              if (row?.quantity !== qty) stale.push(`item ${id}`);
            }
            for (const [allianceId, arrears] of Object.entries(
              expected.duesArrears,
            )) {
              const row = duesMemberships.find(
                (m) => String(m.alliance_id) === allianceId,
              );
              if (!row || String(row.dues_arrears) !== arrears)
                stale.push(`dues arrears ${allianceId}`);
            }
            if (expected.eraId !== (user.currentEraId ?? null))
              stale.push('currentEraId');
            if (stale.length > 0) {
              auditDetails.reason = 'stale_edit';
              auditDetails.staleFields = stale;
              return { status: 409, error: STALE_EDIT_MESSAGE, code: 'STALE' };
            }
          }

          // Lowering XP may not strand already-allocated proficiency points.
          if (updateData.stats.experience !== undefined) {
            const nextLevel = getLevelFromXP(updateData.stats.experience);
            const spent = usedBonusPoints(user.UserBonusPoints ?? []);
            if (nextLevel < spent)
              throw new AdminUpdateError(
                422,
                `Experience gives level ${nextLevel}, but the player has ${spent} proficiency points allocated (one per level). Reset bonus points first or keep level ${spent} or higher.`,
              );
          }

          // Mercenary rows are owned by their contract; quantities are locked.
          for (const unit of updateData.army.units) {
            if (!unit.isMercenary) continue;
            const current = (user.UserUnit ?? []).find(
              (row) =>
                row.isMercenary &&
                row.type === unit.type &&
                row.level === unit.level,
            );
            if (current && current.quantity !== unit.quantity) {
              throw new AdminUpdateError(
                422,
                'Mercenary units are managed by their contract and cannot be edited',
              );
            }
          }

          const gameplay = updateData.gameplay ?? {};
          const fortTouched =
            gameplay.fortLevel !== undefined ||
            gameplay.fortHitpoints !== undefined;
          const fortHitpoints = fortTouched
            ? resolveFortHitpoints(
                user.fort_level,
                gameplay.fortLevel ?? user.fort_level,
                gameplay.fortHitpoints ?? user.fort_hitpoints,
              )
            : undefined;
          if (
            (gameplay.stamina ?? user.stamina) >
            (gameplay.maxStamina ?? user.maxStamina)
          )
            throw new AdminUpdateError(
              422,
              'Stamina cannot exceed max stamina',
            );

          // Veteran badge: cross-field rules run on the merged row.
          const veteranTouched =
            gameplay.veteranTitle !== undefined ||
            gameplay.veteranSince !== undefined;
          const veteran = resolveVeteranFields(
            {
              veteranTitle: user.veteranTitle ?? null,
              veteranSince: user.veteranSince?.toISOString() ?? null,
            },
            gameplay,
          );

          // Before/after record of changed fields (email only as a flag).
          const unitDiff: FieldDiff = {};
          for (const unit of updateData.army.units) {
            const row = (user.UserUnit ?? []).find(
              (current) =>
                current.type === unit.type &&
                current.level === unit.level &&
                current.isMercenary === unit.isMercenary,
            );
            if (row && row.quantity !== unit.quantity)
              unitDiff[unit.id] = {
                before: row.quantity,
                after: unit.quantity,
              };
          }
          const itemDiff: FieldDiff = {};
          for (const item of updateData.items.items) {
            const row = (user.UserItem ?? []).find(
              (current) =>
                current.type === item.type &&
                current.usage === item.usage &&
                current.level === item.level,
            );
            if (row && row.quantity !== item.quantity)
              itemDiff[item.id] = {
                before: row.quantity,
                after: item.quantity,
              };
          }
          // An explicit date wins; otherwise an XP edit that moves the level
          // restarts the anti-camping clock, as any other XP change does.
          const levelReachedAt: Date | null | undefined =
            updateData.stats.levelReachedAt !== undefined
              ? updateData.stats.levelReachedAt === null
                ? null
                : new Date(updateData.stats.levelReachedAt)
              : updateData.stats.experience !== undefined
                ? levelReachedAtUpdate(
                    user.experience,
                    updateData.stats.experience,
                  ).level_reached_at
                : undefined;

          // Email is never copied into the audit diff; emailChanged flags it.
          const { email: _email, ...fieldsWithoutEmail } = currentFields;
          const fieldDiff = buildFieldDiff(fieldsWithoutEmail, {
            username: updateData.profile.username,
            gold: updateData.stats.gold,
            goldInBank: updateData.stats.goldInBank,
            experience: updateData.stats.experience,
            levelReachedAt:
              levelReachedAt === undefined
                ? undefined
                : (levelReachedAt?.toISOString() ?? null),
            ...gameplay,
            fortHitpoints,
            ...(veteranTouched ? veteran : {}),
          });
          const duesDiff: FieldDiff = {};
          for (const edit of updateData.alliances?.memberships ?? []) {
            const row = duesMemberships.find(
              (m) => m.alliance_id === edit.allianceId,
            );
            if (!row)
              throw new AdminUpdateError(
                409,
                'The player is no longer in that alliance',
              );
            if (BigInt(row.dues_arrears) !== edit.duesArrears)
              duesDiff[String(edit.allianceId)] = {
                before: String(row.dues_arrears),
                after: edit.duesArrears.toString(),
              };
          }
          const permissionDiff = updateData.permissions
            ? setDiff(
                (user.permissions ?? []).map((p) => p.type),
                updateData.permissions.permissions,
              )
            : undefined;
          const roleDiff = updateData.staffRoles
            ? setDiff(
                (user.staffRoleAssignments ?? []).map((a) => a.role),
                updateData.staffRoles.roles,
              )
            : undefined;
          auditDetails.changes = {
            fields: fieldDiff,
            units: unitDiff,
            items: itemDiff,
            ...(Object.keys(duesDiff).length > 0
              ? { duesArrears: duesDiff }
              : {}),
            ...(permissionDiff ? { permissions: permissionDiff } : {}),
            ...(roleDiff ? { staffRoles: roleDiff } : {}),
          };

          // Only fields the editor sent are written.
          const definedOnly = (data: Record<string, unknown>) =>
            Object.fromEntries(
              Object.entries(data).filter(([, value]) => value !== undefined),
            );
          const profileData = definedOnly({
            display_name: updateData.profile.username,
            email: updateData.profile.email,
          });
          if (Object.keys(profileData).length > 0)
            await tx.users.update({
              where: { id: userIdNum },
              data: profileData,
            });
          const gameplayData = definedOnly({
            fort_level: gameplay.fortLevel,
            fort_hitpoints: fortHitpoints,
            stamina: gameplay.stamina,
            maxStamina: gameplay.maxStamina,
            attack_turns: gameplay.attackTurns,
            house_level: gameplay.houseLevel,
            economy_level: gameplay.economyLevel,
            race: gameplay.race,
            class: gameplay.class,
            locale: gameplay.locale,
            bio: gameplay.bio,
            ...(veteranTouched
              ? {
                  veteranTitle: veteran.veteranTitle,
                  veteranSince: veteran.veteranSince
                    ? new Date(veteran.veteranSince)
                    : null,
                }
              : {}),
          });
          if (Object.keys(gameplayData).length > 0)
            await tx.users.update({
              where: { id: userIdNum },
              data: gameplayData,
            });

          // Quantity edits target exact normalized rows; unrelated levels/usages are preserved.
          for (const unit of updateData.army.units) {
            if (unit.id !== `${unit.type}:${unit.level}:${unit.isMercenary}`)
              throw new AdminUpdateError(422, 'Invalid unit identity');
            const result = await tx.userUnit.updateMany({
              where: {
                userId: userIdNum,
                type: unit.type,
                level: unit.level,
                isMercenary: unit.isMercenary,
              },
              data: { quantity: unit.quantity },
            });
            if (result.count !== 1)
              throw new AdminUpdateError(409, 'Unit no longer exists');
          }
          for (const item of updateData.items.items) {
            if (item.id !== `${item.type}:${item.usage}:${item.level}`)
              throw new AdminUpdateError(422, 'Invalid item identity');
            const result = await tx.userItem.updateMany({
              where: {
                userId: userIdNum,
                type: item.type,
                usage: item.usage,
                level: item.level,
              },
              data: { quantity: item.quantity },
            });
            if (result.count !== 1)
              throw new AdminUpdateError(409, 'Item no longer exists');
          }
          for (const [allianceId, change] of Object.entries(duesDiff)) {
            await tx.alliance_memberships.updateMany({
              where: { user_id: userIdNum, alliance_id: Number(allianceId) },
              data: { dues_arrears: BigInt(String(change.after)) },
            });
          }
          await recordItemLedger(
            tx,
            userIdNum,
            'ADMIN_EDIT',
            updateData.items.items.flatMap((item) => {
              const change = itemDiff[item.id];
              return change
                ? [
                    {
                      type: item.type,
                      usage: item.usage,
                      level: item.level,
                      delta: Number(change.after) - Number(change.before),
                    },
                  ]
                : [];
            }),
          );
          const statsData = definedOnly({
            gold: updateData.stats.gold,
            gold_in_bank: updateData.stats.goldInBank,
            experience: updateData.stats.experience,
          });
          // null is a real value here (clears the ramp), so it is set apart
          // from definedOnly, which only drops undefined.
          if (levelReachedAt !== undefined)
            statsData.level_reached_at = levelReachedAt;
          if (Object.keys(statsData).length > 0)
            await tx.users.update({
              where: { id: userIdNum },
              data: statsData,
            });

          // Removed grants are soft-revoked so the staff history is kept.
          if (updateData.permissions)
            await AdminService.syncPermissionGrants(
              tx,
              userIdNum,
              updateData.permissions.permissions,
              adminUserId,
            );

          if (updateData.staffRoles) {
            const requestedRoles = updateData.staffRoles.roles;

            await tx.staffRoleAssignment.updateMany({
              where: {
                userId: userIdNum,
                revokedAt: null,
                role: { notIn: requestedRoles },
              },
              data: { revokedAt: new Date() },
            });

            for (const role of requestedRoles) {
              const existingAssignment = await tx.staffRoleAssignment.findFirst(
                {
                  where: { userId: userIdNum, role, revokedAt: null },
                  select: { id: true },
                },
              );

              if (!existingAssignment) {
                await tx.staffRoleAssignment.create({
                  data: {
                    userId: userIdNum,
                    role,
                    grantedByUserId: Number.isFinite(adminUserId)
                      ? adminUserId
                      : undefined,
                  },
                });
              }
            }
          }

          // Recompute stored strength from the gameplay roster (owned + contract troops).
          const strengthInputsChanged =
            Object.keys(unitDiff).length > 0 ||
            Object.keys(itemDiff).length > 0 ||
            ['experience', 'fortLevel', 'race', 'class'].some(
              (key) => key in fieldDiff,
            );
          if (strengthInputsChanged) {
            const strength = await recomputeStoredStatsInTx(tx, userIdNum);
            auditDetails.derivedStats = {
              before: {
                offense: user.offense,
                defense: user.defense,
                spy: user.spy,
                sentry: user.sentry,
              },
              after: {
                offense: strength.offense,
                defense: strength.defense,
                spy: strength.spy,
                sentry: strength.sentry,
              },
            };
          }

          // Commits with the edit; a failed write rolls the edit back.
          await logActionStrict(
            {
              userId: adminUserId,
              action: 'ADMIN_USER_UPDATE',
              ip,
              targetUserId: userIdNum,
              details: auditDetails,
            },
            tx,
          );
          return null;
        },
        { isolationLevel: 'Serializable' },
      );

      if (denial) {
        auditAction = 'ADMIN_USER_UPDATE_DENIED';
        status = denial.status;
        body = {
          error: denial.error,
          ...('code' in denial && denial.code ? { code: denial.code } : {}),
        };
      } else {
        auditAction = 'ADMIN_USER_UPDATE';
        status = 200;
        body = { message: 'User updated successfully' };
      }
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      if (error instanceof AdminUpdateError) {
        status = error.status;
        body = { error: error.message };
        auditDetails.reason = error.message;
        if (error.status === 422) auditAction = 'ADMIN_USER_UPDATE_DENIED';
      } else if (code === 'P2034') {
        // Serialization conflict with a concurrent gameplay write.
        status = 409;
        body = { error: STALE_EDIT_MESSAGE, code: 'STALE' };
        auditAction = 'ADMIN_USER_UPDATE_DENIED';
        auditDetails.reason = 'stale_edit';
      } else if (code === 'P2002') {
        status = 409;
        body = { error: 'Username or email is already in use' };
        auditDetails.reason = 'unique_conflict';
      } else {
        logError('Error updating user:', error);
      }
    }

    // Successful updates are already audited inside the transaction.
    if (auditAction !== 'ADMIN_USER_UPDATE') {
      await logAction(adminUserId, auditAction, ip, auditDetails);
    }
    res.status(status).json(body);
  }
}

export default async function routed(
  req: AuthenticatedRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') return guardedRead(handler)(req, res);
  if (req.method === 'PUT') return guardedUpdate(handler)(req, res);
  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}
