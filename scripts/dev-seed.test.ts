import { describe, expect, it } from 'bun:test';

import {
  ArmoryUpgrades,
  Fortifications,
  ItemTypes,
  levelXPArray,
  OffensiveUpgrades,
  SentryUpgrades,
  SpyUpgrades,
  UnitTypes,
} from '@/constants';

import {
  buildSeedAccounts,
  resolveSeedIdentity,
  validateSeedConfig,
} from './dev-seed';

const localEnv = {
  NODE_ENV: 'development',
  POSTGRES_PRISMA_URL: 'postgresql://seed_user:secret@127.0.0.1:5432/seed_test',
};

const identity = {
  id: 7,
  email: 'admin@openthrone.local',
  recruit_link: 'unrelated-link',
  isBot: false,
  staffRoleAssignments: [],
};
const admin = { key: 'admin' as const, email: identity.email };

describe('development seed safety', () => {
  it('refuses production even with an explicit remote opt-in', () => {
    for (const mode of ['production', ' PRODUCTION ']) {
      expect(() =>
        validateSeedConfig({ ...localEnv, NODE_ENV: mode }, true),
      ).toThrow('production');
    }
  });

  it('requires deliberate development opt-in for remote hosts and query overrides', () => {
    const remote = {
      ...localEnv,
      POSTGRES_PRISMA_URL: 'postgresql://user:secret@192.168.5.110/dev_stage',
    };
    expect(() => validateSeedConfig(remote)).toThrow('non-loopback');
    expect(validateSeedConfig(remote, true).host).toBe('192.168.5.110');
    expect(() =>
      validateSeedConfig({ ...remote, NODE_ENV: 'test' }, true),
    ).toThrow('NODE_ENV=development');
    expect(() =>
      validateSeedConfig({
        ...localEnv,
        POSTGRES_PRISMA_URL: `${localEnv.POSTGRES_PRISMA_URL}?host=remote.example`,
      }),
    ).toThrow('non-loopback');
    expect(() =>
      validateSeedConfig(
        {
          ...localEnv,
          POSTGRES_PRISMA_URL: `${localEnv.POSTGRES_PRISMA_URL}?hostaddr=192.168.5.110`,
        },
        true,
      ),
    ).toThrow('ambiguous');
  });

  it('accepts explicit IPv6 loopback and Unix socket connections', () => {
    expect(
      validateSeedConfig({
        ...localEnv,
        POSTGRES_PRISMA_URL: 'postgresql://user:secret@[::1]:5432/seed_test',
      }).host,
    ).toBe('[::1]');
    expect(
      validateSeedConfig({
        ...localEnv,
        POSTGRES_PRISMA_URL:
          'postgresql:///seed_test?host=%2Fvar%2Frun%2Fpostgresql',
      }).host,
    ).toBe('/var/run/postgresql');
  });

  it('rejects invalid passwords and colliding account configuration before provisioning', () => {
    for (const key of ['DEV_SEED_ADMIN_PASSWORD', 'DEV_SEED_TEST_PASSWORD']) {
      expect(() => validateSeedConfig({ ...localEnv, [key]: 'short' })).toThrow(
        key,
      );
    }
    expect(() =>
      validateSeedConfig({
        ...localEnv,
        DEV_SEED_ADMIN_EMAIL: 'DEV-RAIDER@openthrone.local',
      }),
    ).toThrow('conflicts');
    expect(() =>
      validateSeedConfig({ ...localEnv, DEV_SEED_ADMIN_EMAIL: 'not-an-email' }),
    ).toThrow('valid email');
  });

  it('never reveals connection credentials in configuration errors', () => {
    try {
      validateSeedConfig({
        ...localEnv,
        POSTGRES_PRISMA_URL:
          'postgresql://secret_user:secret_password@remote.example/dev',
      });
      throw new Error('Expected refusal');
    } catch (error) {
      expect(String(error)).toContain('non-loopback');
      expect(String(error)).not.toContain('secret_user');
      expect(String(error)).not.toContain('secret_password');
    }
  });

  it('does not silently elevate an unrelated account or overwrite an identity collision', () => {
    expect(() => resolveSeedIdentity(admin, [identity])).toThrow(
      'Unrelated account',
    );
    expect(() =>
      resolveSeedIdentity(admin, [
        { ...identity, email: 'other@example.local' },
      ]),
    ).toThrow('Identity conflict');
    expect(() =>
      resolveSeedIdentity(admin, [identity, { ...identity, id: 8 }]),
    ).toThrow('Identity conflict');
  });

  it('recognizes seed provenance without repairing revoked roles or requiring unchanged gameplay', () => {
    expect(
      resolveSeedIdentity(admin, [
        {
          ...identity,
          recruit_link: `dev-seed-v1-admin-${'a'.repeat(32)}`,
          staffRoleAssignments: [
            { role: 'ADMINISTRATOR', revokedAt: new Date(0) },
          ],
        },
      ]),
    ).toBe(7);
    expect(() =>
      resolveSeedIdentity(admin, [
        {
          ...identity,
          isBot: true,
          recruit_link: `dev-seed-v1-admin-${'a'.repeat(32)}`,
        },
      ]),
    ).toThrow('Identity conflict');
  });

  it('can report an existing active administrator but never revive a revoked one', () => {
    expect(
      resolveSeedIdentity(admin, [
        {
          ...identity,
          staffRoleAssignments: [{ role: 'ADMINISTRATOR', revokedAt: null }],
        },
      ]),
    ).toBe(7);
    expect(() =>
      resolveSeedIdentity(admin, [
        {
          ...identity,
          staffRoleAssignments: [
            { role: 'ADMINISTRATOR', revokedAt: new Date(0) },
          ],
        },
      ]),
    ).toThrow('Unrelated account');
  });
});

describe('development seed combat profiles', () => {
  it('provisions peers at one legal level with all mission tiers and bounded valid gear', async () => {
    const profiles = (await buildSeedAccounts(admin.email)).filter(
      (profile) => profile.key !== 'admin',
    );
    const { xp } = levelXPArray.find((row) => row.level === 80);
    for (const profile of profiles) {
      expect(profile.scalars.experience).toBe(xp);
      const fort = Fortifications.find(
        (row) => row.level === profile.scalars.fort_level,
      );
      expect(fort.levelRequirement).toBeLessThanOrEqual(80);
      expect(profile.scalars.fort_hitpoints).toBe(fort.hitpoints);
      const spy = SpyUpgrades.find(
        (row) =>
          row.level ===
          profile.structures.find((row) => row.type === 'SPY').level,
      );
      expect(spy.maxAssassinsPerMission).toBeGreaterThan(0);
      expect(spy.maxInfiltratorsPerMission).toBeGreaterThan(0);
      expect(spy.fortLevelRequirement).toBeLessThanOrEqual(fort.level);
      const sentry =
        SentryUpgrades[
          profile.structures.find((row) => row.type === 'SENTRY').level - 1
        ];
      expect(sentry.fortLevelRequirement).toBeLessThanOrEqual(fort.level);
      const offense = OffensiveUpgrades.find(
        (row) =>
          row.level ===
          profile.structures.find((row) => row.type === 'OFFENSE').level,
      );
      expect(offense.fortLevelRequirement).toBeLessThanOrEqual(fort.level);
      const armory = ArmoryUpgrades.find(
        (row) =>
          row.level ===
          profile.structures.find((row) => row.type === 'ARMORY').level,
      );
      expect(armory.fortLevel).toBeLessThanOrEqual(fort.level);
      for (const role of ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY']) {
        for (const level of [1, 2, 3]) {
          const unit = profile.units.find(
            (row) => row.type === role && row.level === level,
          );
          expect(unit.quantity).toBeGreaterThan(0);
          expect(
            UnitTypes.find((row) => row.type === role && row.level === level)
              .fortLevel,
          ).toBeLessThanOrEqual(fort.level);
        }
      }
      for (const item of profile.items) {
        const catalog = ItemTypes.find(
          (row) =>
            row.type === item.type &&
            row.usage === item.usage &&
            row.level === item.level,
        );
        expect(catalog.armoryLevel).toBeLessThanOrEqual(armory.level);
        const eligibleTroops = profile.units
          .filter((row) => row.type === item.usage && row.level >= item.level)
          .reduce((total, row) => total + row.quantity, 0);
        expect(item.quantity).toBeLessThanOrEqual(eligibleTroops);
        expect(item.quantity).toBeGreaterThan(0);
      }
    }
  });
});
