import { describe, expect, it } from 'bun:test';

import { BotDecisionEngine } from '../BotDecisionEngine';
import type { BotActionType, BotPersona } from '../types';

const makeBot = (persona: BotPersona) => ({
  id: 1,
  display_name: 'TestBot',
  botPersona: persona,
});

describe('BotDecisionEngine.decide', () => {
  it('returns IDLE for IDLE slot', () => {
    const result = BotDecisionEngine.decide({
      bot: makeBot('AGGRESSIVE'),
      slot: 'IDLE',
    });
    expect(result.action).toBe('IDLE');
    expect(result.skipReason).toBeUndefined();
  });

  it('returns RECRUIT for RECRUIT slot regardless of persona', () => {
    const personas: BotPersona[] = [
      'FARMER_GREEDY',
      'AGGRESSIVE',
      'DEFENSIVE',
      'BALANCED',
    ];
    for (const persona of personas) {
      const result = BotDecisionEngine.decide({
        bot: makeBot(persona),
        slot: 'RECRUIT',
      });
      expect(result.action).toBe('RECRUIT');
    }
  });

  it('returns the matching training action for each TRAIN_* slot', () => {
    const trainSlots: BotActionType[] = [
      'TRAIN_WORKER',
      'TRAIN_OFFENSE',
      'TRAIN_DEFENSE',
    ];
    for (const slot of trainSlots) {
      const result = BotDecisionEngine.decide({
        bot: makeBot('BALANCED'),
        slot,
      });
      expect(result.action).toBe(slot);
    }
  });

  it('falls back to IDLE for unknown slots', () => {
    const unknown = 'BOGUS' as unknown as BotActionType;
    const result = BotDecisionEngine.decide({
      bot: makeBot('BALANCED'),
      slot: unknown,
    });
    expect(result.action).toBe('IDLE');
    expect(result.skipReason).toContain('Unknown slot');
  });
});

describe('BotDecisionEngine.personaFor', () => {
  it('returns the bot persona when set', () => {
    expect(BotDecisionEngine.personaFor(makeBot('AGGRESSIVE'))).toBe(
      'AGGRESSIVE',
    );
  });

  it('defaults to BALANCED when persona is null', () => {
    const bot = { ...makeBot('AGGRESSIVE'), botPersona: null };
    expect(BotDecisionEngine.personaFor(bot)).toBe('BALANCED');
  });
});
