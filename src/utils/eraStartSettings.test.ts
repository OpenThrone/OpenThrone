import { describe, expect, it } from 'bun:test';

import {
  DEFAULT_ERA_START_SETTINGS,
  eraStartSettingsSchema,
  parseStartEraBody,
  resolveEraStartSettings,
} from './eraStartSettings';

describe('eraStartSettings', () => {
  describe('resolveEraStartSettings', () => {
    it('returns defaults for null, undefined, and garbage stored JSON', () => {
      expect(resolveEraStartSettings(null)).toEqual(DEFAULT_ERA_START_SETTINGS);
      expect(resolveEraStartSettings(undefined)).toEqual(
        DEFAULT_ERA_START_SETTINGS,
      );
      expect(resolveEraStartSettings('garbage')).toEqual(
        DEFAULT_ERA_START_SETTINGS,
      );
      expect(resolveEraStartSettings('{not-valid-json')).toEqual(
        DEFAULT_ERA_START_SETTINGS,
      );
      expect(resolveEraStartSettings(12345)).toEqual(
        DEFAULT_ERA_START_SETTINGS,
      );
      expect(resolveEraStartSettings(['array'])).toEqual(
        DEFAULT_ERA_START_SETTINGS,
      );
      expect(resolveEraStartSettings({})).toEqual(DEFAULT_ERA_START_SETTINGS);
    });

    it('falls back field-by-field for partial or invalid stored JSON without throwing', () => {
      expect(resolveEraStartSettings({ gold: '50000' })).toEqual({
        gold: '50000',
        citizens: 50,
        attackTurns: 50,
      });

      expect(
        resolveEraStartSettings({
          gold: 'invalid-gold',
          citizens: 120,
          attackTurns: 75,
        }),
      ).toEqual({
        gold: '25000',
        citizens: 120,
        attackTurns: 75,
      });

      expect(
        resolveEraStartSettings({
          gold: '30000',
          citizens: -5,
          attackTurns: 9999999,
        }),
      ).toEqual({
        gold: '30000',
        citizens: 50,
        attackTurns: 50,
      });

      expect(
        resolveEraStartSettings(
          JSON.stringify({ gold: '45000', citizens: 80, attackTurns: 60 }),
        ),
      ).toEqual({
        gold: '45000',
        citizens: 80,
        attackTurns: 60,
      });
    });
  });

  describe('valid custom values round-trip', () => {
    it('round-trips custom valid settings through schema, resolver, and body parser', () => {
      const valid = {
        gold: '1000000',
        citizens: 250,
        attackTurns: 100,
      };

      expect(eraStartSettingsSchema.parse(valid)).toEqual(valid);
      expect(resolveEraStartSettings(valid)).toEqual(valid);

      const parsedBody = parseStartEraBody({ startSettings: valid });
      expect(parsedBody).toEqual({ ok: true, settings: valid });
    });

    it('accepts valid boundary values', () => {
      const minBounds = {
        gold: '0',
        citizens: 0,
        attackTurns: 0,
      };
      expect(eraStartSettingsSchema.parse(minBounds)).toEqual(minBounds);
      expect(resolveEraStartSettings(minBounds)).toEqual(minBounds);

      const maxBounds = {
        gold: '1000000000000',
        citizens: 10_000_000,
        attackTurns: 10_000,
      };
      expect(eraStartSettingsSchema.parse(maxBounds)).toEqual(maxBounds);
      expect(resolveEraStartSettings(maxBounds)).toEqual(maxBounds);
    });
  });

  describe('schema rejections', () => {
    it('rejects negative values', () => {
      expect(
        eraStartSettingsSchema.safeParse({
          gold: '-1',
          citizens: 50,
          attackTurns: 50,
        }).success,
      ).toBe(false);

      expect(
        eraStartSettingsSchema.safeParse({
          gold: '25000',
          citizens: -1,
          attackTurns: 50,
        }).success,
      ).toBe(false);

      expect(
        eraStartSettingsSchema.safeParse({
          gold: '25000',
          citizens: 50,
          attackTurns: -1,
        }).success,
      ).toBe(false);
    });

    it('rejects non-integer values', () => {
      expect(
        eraStartSettingsSchema.safeParse({
          gold: '25000.5',
          citizens: 50,
          attackTurns: 50,
        }).success,
      ).toBe(false);

      expect(
        eraStartSettingsSchema.safeParse({
          gold: '25000',
          citizens: 50.5,
          attackTurns: 50,
        }).success,
      ).toBe(false);

      expect(
        eraStartSettingsSchema.safeParse({
          gold: '25000',
          citizens: 50,
          attackTurns: 50.2,
        }).success,
      ).toBe(false);
    });

    it('rejects over-bound values', () => {
      expect(
        eraStartSettingsSchema.safeParse({
          gold: '1000000000001',
          citizens: 50,
          attackTurns: 50,
        }).success,
      ).toBe(false);

      expect(
        eraStartSettingsSchema.safeParse({
          gold: '25000',
          citizens: 10_000_001,
          attackTurns: 50,
        }).success,
      ).toBe(false);

      expect(
        eraStartSettingsSchema.safeParse({
          gold: '25000',
          citizens: 50,
          attackTurns: 10_001,
        }).success,
      ).toBe(false);
    });

    it('rejects non-numeric gold strings', () => {
      const nonNumericGolds = [
        'abc',
        '',
        ' 25000',
        '25000 ',
        '10e5',
        '0x10',
        '25_000',
      ];
      for (const gold of nonNumericGolds) {
        expect(
          eraStartSettingsSchema.safeParse({
            gold,
            citizens: 50,
            attackTurns: 50,
          }).success,
        ).toBe(false);
      }
    });
  });

  describe('parseStartEraBody', () => {
    it('returns settings undefined for absent or empty body', () => {
      expect(parseStartEraBody(undefined)).toEqual({
        ok: true,
        settings: undefined,
      });
      expect(parseStartEraBody(null)).toEqual({
        ok: true,
        settings: undefined,
      });
      expect(parseStartEraBody('')).toEqual({ ok: true, settings: undefined });
      expect(parseStartEraBody('   ')).toEqual({
        ok: true,
        settings: undefined,
      });
      expect(parseStartEraBody({})).toEqual({ ok: true, settings: undefined });
      expect(parseStartEraBody('{}')).toEqual({
        ok: true,
        settings: undefined,
      });
      expect(parseStartEraBody({ startSettings: undefined })).toEqual({
        ok: true,
        settings: undefined,
      });
    });

    it('returns ok:false for invalid bodies or settings', () => {
      expect(parseStartEraBody(12345)).toEqual({
        ok: false,
        error: 'Request body must be an object',
      });

      expect(parseStartEraBody('invalid-json')).toEqual({
        ok: false,
        error: 'Invalid request body',
      });

      expect(parseStartEraBody([1, 2, 3])).toEqual({
        ok: false,
        error: 'Request body must be an object',
      });

      const invalidGoldResult = parseStartEraBody({
        startSettings: { gold: '-10', citizens: 50, attackTurns: 50 },
      });
      expect(invalidGoldResult.ok).toBe(false);
      if (invalidGoldResult.ok === false) {
        expect(typeof invalidGoldResult.error).toBe('string');
      }

      const invalidCitizensResult = parseStartEraBody({
        startSettings: { gold: '25000', citizens: -1, attackTurns: 50 },
      });
      expect(invalidCitizensResult.ok).toBe(false);

      const invalidAttackTurnsResult = parseStartEraBody({
        startSettings: { gold: '25000', citizens: 50, attackTurns: 10001 },
      });
      expect(invalidAttackTurnsResult.ok).toBe(false);

      const invalidTypeResult = parseStartEraBody({
        startSettings: 'invalid-settings-type',
      });
      expect(invalidTypeResult.ok).toBe(false);

      const partialSettingsResult = parseStartEraBody({
        startSettings: { gold: '25000' },
      });
      expect(partialSettingsResult.ok).toBe(false);
    });
  });
});
