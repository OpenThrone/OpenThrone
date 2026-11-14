import { describe, expect, it } from 'bun:test';

import { buildUserPatch } from '@/components/UserAdminEditor';

const loaded = {
  profile: { id: '1', username: 'target', email: 't@x.io', status: 'ACTIVE' },
  stats: { gold: '100', goldInBank: '5', experience: 10, level: 1 },
  gameplay: {
    fortLevel: 1,
    fortHitpoints: 50,
    stamina: 10,
    maxStamina: 100,
    attackTurns: 3,
    houseLevel: 0,
    economyLevel: 0,
    race: 'ELF',
    class: 'FIGHTER',
    locale: 'en',
    bio: '',
  },
  derived: { offense: 0, defense: 0, spy: 0, sentry: 0 },
  record: {
    rank: 1,
    lastActive: null,
    createdAt: null,
    currentEraId: 2,
    eraJoinedAt: null,
    protectionForfeitedEraId: null,
    alliances: [],
    statusHistory: [],
  },
  army: {
    units: [
      {
        id: 'OFFENSE:1:false',
        type: 'OFFENSE',
        name: 'OFFENSE',
        level: 1,
        isMercenary: false,
        quantity: 4,
      },
    ],
  },
  items: { items: [] },
  permissions: { permissions: [] },
  staffRoles: { roles: [] },
} as any;

describe('buildUserPatch', () => {
  it('sends changed dues arrears with the loaded value as the expectation', () => {
    const base = structuredClone(loaded);
    base.record.alliances = [
      {
        allianceId: 4,
        name: 'Tollkeepers',
        role: 'Member',
        duesArrears: '300',
      },
      { allianceId: 5, name: 'Other', role: 'Member', duesArrears: '0' },
    ];
    const edited = structuredClone(base);
    edited.record.alliances[0].duesArrears = '0';
    const patch = buildUserPatch(base, edited);
    expect(patch?.alliances).toEqual({
      memberships: [{ allianceId: 4, duesArrears: '0' }],
    });
    expect(patch?.expected.duesArrears).toEqual({ '4': '300' });
    expect(buildUserPatch(base, structuredClone(base))).toBeNull();
  });

  it('sends the loaded permission and role sets when they change', () => {
    const edited = structuredClone(loaded);
    edited.permissions.permissions = ['MANAGE_USERS'];
    edited.staffRoles.roles = ['MODERATOR'];
    const patch = buildUserPatch(loaded, edited);
    expect(patch?.permissions).toEqual({ permissions: ['MANAGE_USERS'] });
    expect(patch?.staffRoles).toEqual({ roles: ['MODERATOR'] });
    expect(patch?.expected.permissions).toEqual([]);
    expect(patch?.expected.staffRoles).toEqual([]);
  });

  it('returns null when nothing changed', () => {
    expect(buildUserPatch(loaded, structuredClone(loaded))).toBeNull();
  });

  it('sends only changed fields with their loaded values as expected', () => {
    const edited = structuredClone(loaded);
    edited.stats.gold = '900';
    edited.gameplay.stamina = 40;
    edited.army.units[0].quantity = 9;
    expect(buildUserPatch(loaded, edited)).toEqual({
      profile: {},
      stats: { gold: '900' },
      gameplay: { stamina: 40 },
      army: { units: [edited.army.units[0]] },
      items: { items: [] },
      expected: {
        eraId: 2,
        fields: { gold: '100', stamina: 10 },
        units: { 'OFFENSE:1:false': 4 },
        items: {},
      },
    });
  });
});
