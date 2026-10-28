import { describe, expect, it } from 'bun:test';

import {
  applyTutorialAction,
  FIRST_STRUCTURE_UPGRADE_LEVEL,
  getTutorialPhase,
  parseTutorialState,
  TUTORIAL_CHAPTERS,
  TUTORIAL_SNOOZE_MS,
} from './tutorialState';

const NOW = Date.parse('2026-10-25T12:00:00Z');

describe('tutorial state', () => {
  it('first unlock level matches the Village fortification', () => {
    expect(FIRST_STRUCTURE_UPGRADE_LEVEL).toBe(5);
  });

  it('offers new players the tutorial but not veterans', () => {
    expect(getTutorialPhase(null, { level: 1 })).toBe('offer');
    expect(getTutorialPhase(null, { level: 12 })).toBe('off');
  });

  it('keeps a decision across sessions', () => {
    const started = applyTutorialAction(null, { type: 'start' });
    expect(getTutorialPhase(started, { level: 1 })).toBe('run');
    const dismissed = applyTutorialAction(started, { type: 'dismiss' });
    expect(getTutorialPhase(dismissed, { level: 1 })).toBe('off');
    // Survives the JSON round trip through the database.
    const stored = parseTutorialState(JSON.parse(JSON.stringify(dismissed)));
    expect(getTutorialPhase(stored, { level: 1 })).toBe('off');
  });

  it('snooze hides it until the day passes, then offers again', () => {
    const snoozed = applyTutorialAction(null, { type: 'snooze' }, NOW);
    expect(getTutorialPhase(snoozed, { level: 1, now: NOW + 1000 })).toBe(
      'off',
    );
    expect(
      getTutorialPhase(snoozed, {
        level: 1,
        now: NOW + TUTORIAL_SNOOZE_MS + 1,
      }),
    ).toBe('offer');
  });

  it('records chapters once and completes after the last one', () => {
    let state = applyTutorialAction(null, { type: 'start' });
    for (const chapter of TUTORIAL_CHAPTERS.slice(0, -1)) {
      state = applyTutorialAction(state, { type: 'complete-chapter', chapter });
      state = applyTutorialAction(state, { type: 'complete-chapter', chapter });
    }
    expect(state.status).toBe('active');
    expect(state.chapters).toHaveLength(TUTORIAL_CHAPTERS.length - 1);
    state = applyTutorialAction(state, {
      type: 'complete-chapter',
      chapter: TUTORIAL_CHAPTERS[TUTORIAL_CHAPTERS.length - 1],
    });
    expect(state.status).toBe('completed');
  });

  it('does not reopen a dismissed tutorial by finishing chapters', () => {
    let state = applyTutorialAction(null, { type: 'dismiss' });
    for (const chapter of TUTORIAL_CHAPTERS) {
      state = applyTutorialAction(state, { type: 'complete-chapter', chapter });
    }
    expect(state.status).toBe('dismissed');
  });

  it('replaying a lesson reopens just that chapter, even after dismissal', () => {
    let state = applyTutorialAction(null, { type: 'start' });
    for (const chapter of ['overview', 'training'] as const) {
      state = applyTutorialAction(state, { type: 'complete-chapter', chapter });
    }
    state = applyTutorialAction(state, { type: 'dismiss' });
    state = applyTutorialAction(state, {
      type: 'replay-chapter',
      chapter: 'training',
    });
    expect(state.status).toBe('active');
    expect(state.chapters).toEqual(['overview']);
  });

  it('restart clears progress', () => {
    const done = applyTutorialAction(null, { type: 'finish' });
    const restarted = applyTutorialAction(done, { type: 'restart' });
    expect(restarted).toMatchObject({ status: 'active', chapters: [] });
  });

  it('treats malformed stored values as never asked', () => {
    expect(parseTutorialState(undefined)).toBeNull();
    expect(parseTutorialState('nope')).toBeNull();
    expect(parseTutorialState({ status: 'bogus' })).toBeNull();
    expect(
      parseTutorialState({ status: 'active', chapters: ['overview', 'x'] })
        ?.chapters,
    ).toEqual(['overview']);
  });
});
