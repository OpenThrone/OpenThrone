import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

const LOCALES = ['en', 'de', 'es'] as const;
const load = (locale: string, ns: string) =>
  JSON.parse(
    readFileSync(
      join(process.cwd(), 'public/locales', locale, `${ns}.json`),
      'utf8',
    ),
  );

describe('protection copy states the gold shield (#297)', () => {
  it.each(LOCALES)('%s names the shielded allowance everywhere', (locale) => {
    const battle = load(locale, 'battle');
    const common = load(locale, 'common');
    const howToPlay = load(locale, 'how-to-play');
    const texts = [
      battle.users.protectedHint,
      common.walkthrough.chapters.overview.protection.body,
      howToPlay.combat.protection.text,
    ];
    for (const text of texts) expect(text).toContain('{{allowance}}');
    expect(howToPlay.combat.protection.title).toBeTruthy();
  });
});

describe('protection copy says gold shield, not immunity (#284)', () => {
  const shieldWords: Record<string, RegExp> = {
    en: /gold shield/i,
    de: /goldschutz|gold geschützt|goldschild/i,
    es: /oro protegido|escudo de oro/i,
  };

  it.each(LOCALES)('%s badges and meter name the gold shield', (locale) => {
    const battle = load(locale, 'battle');
    const common = load(locale, 'common');
    expect(battle.users.protected).toMatch(shieldWords[locale]);
    expect(common.sidebar.protection.active).toMatch(shieldWords[locale]);
    expect(common.sidebar.protection.daysLeft_one).toMatch(shieldWords[locale]);
    expect(common.sidebar.protection.daysLeft_other).toMatch(
      shieldWords[locale],
    );
  });

  it.each(LOCALES)('%s tooltips quote the live rule numbers', (locale) => {
    const battle = load(locale, 'battle');
    const common = load(locale, 'common');
    for (const text of [
      battle.users.protectedHint,
      common.sidebar.protection.tooltip,
    ]) {
      expect(text).toContain('{{allowance}}');
      expect(text).toContain('{{share}}');
      expect(text).toContain('{{taperLevel}}');
    }
  });

  it.each(LOCALES)('%s says attacks still land outside the gold', (locale) => {
    const battle = load(locale, 'battle');
    const common = load(locale, 'common');
    const howToPlay = load(locale, 'how-to-play');
    const faq = load(locale, 'faq');
    for (const text of [
      battle.users.protectedHint,
      common.sidebar.protection.tooltip,
      howToPlay.combat.protection.text,
      faq.questions.protection.answer,
    ]) {
      expect(text).toContain('{{allowance}}');
      expect(text).toContain('{{share}}');
      expect(text).toContain('{{taperLevel}}');
    }
    expect(faq.questions.protection.title).toBeTruthy();
  });

  it.each(LOCALES)('%s war history XP badge says whose XP it is', (locale) => {
    const battle = load(locale, 'battle');
    const owner = { en: 'Your XP', de: 'Ihre EP', es: 'Tu EXP' }[locale];
    expect(battle.warHistory.xpBadge).toContain(owner);
  });
});

describe('bank deposit limit names the window (#299)', () => {
  it.each(LOCALES)('%s takes the window length as a parameter', (locale) => {
    expect(load(locale, 'structures').bank.rollingDepositLimit).toContain(
      '{{hours}}',
    );
  });
});

describe('armory upgrade hint reads as a shortfall (#300)', () => {
  it('en does not describe missing gear as what gear "fits"', () => {
    const { armory } = load('en', 'structures');
    expect(armory.tierUpgradeHint).not.toMatch(/fits/i);
    expect(armory.fitsUnits).not.toMatch(/fits/i);
    expect(armory.tierUpgradeHint).toContain('{{units}}');
    expect(armory.tierUpgradeHint).toContain('{{tier}}');
  });
});
