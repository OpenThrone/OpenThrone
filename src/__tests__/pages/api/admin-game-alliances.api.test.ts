import { describe, expect, it } from 'bun:test';

import { AllianceQuerySchema } from '@/pages/api/admin/game/alliances';

describe('alliance administration query validation', () => {
  it('preserves and validates allianceId for DELETE requests', () => {
    expect(AllianceQuerySchema.parse({ allianceId: '412' }).allianceId).toBe(
      412,
    );
    expect(
      AllianceQuerySchema.safeParse({ allianceId: 'invalid' }).success,
    ).toBe(false);
    expect(AllianceQuerySchema.safeParse({ allianceId: '0' }).success).toBe(
      false,
    );
  });
});
