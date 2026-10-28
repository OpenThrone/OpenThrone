import { Fortifications } from '@/constants/Fortifications';

/** Pages the guided tutorial explains, in the order it suggests them. */
export const TUTORIAL_CHAPTERS = [
  'overview',
  'attack',
  'training',
  'armory',
  'bank',
] as const;

export type TutorialChapterId = (typeof TUTORIAL_CHAPTERS)[number];

/**
 * - `active`: the player accepted; each unfinished chapter plays on arrival.
 * - `snoozed`: closed for now; the offer returns once `snoozedUntil` passes.
 * - `dismissed`: closed for good.
 * - `completed`: finished by the player or by seeing every chapter.
 */
export type TutorialStatus = 'active' | 'snoozed' | 'dismissed' | 'completed';

export type TutorialState = {
  readonly version: 1;
  readonly status: TutorialStatus;
  /** Chapters already seen or skipped. */
  readonly chapters: readonly TutorialChapterId[];
  /** ISO time the offer may return; only set while snoozed. */
  readonly snoozedUntil: string | null;
};

export type TutorialAction =
  | { readonly type: 'start' }
  | { readonly type: 'complete-chapter'; readonly chapter: TutorialChapterId }
  | { readonly type: 'replay-chapter'; readonly chapter: TutorialChapterId }
  | { readonly type: 'snooze' }
  | { readonly type: 'dismiss' }
  | { readonly type: 'finish' }
  | { readonly type: 'restart' };

/** "Remind me later" hides the tutorial for a day. */
export const TUTORIAL_SNOOZE_MS = 24 * 60 * 60 * 1000;

/**
 * Level of the first fortification that costs anything (Village). Until a
 * player reaches it, Structure Upgrades has nothing to buy, so the first-run
 * menu and tutorial treat the player as new.
 */
export const FIRST_STRUCTURE_UPGRADE_LEVEL =
  Fortifications.find((fort) => fort.levelRequirement > 0)?.levelRequirement ??
  5;

const STATUSES: readonly TutorialStatus[] = [
  'active',
  'snoozed',
  'dismissed',
  'completed',
];

const isChapter = (value: unknown): value is TutorialChapterId =>
  typeof value === 'string' &&
  (TUTORIAL_CHAPTERS as readonly string[]).includes(value);

/** Reads stored JSON defensively; anything unrecognised means "never asked". */
export const parseTutorialState = (raw: unknown): TutorialState | null => {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!STATUSES.includes(record.status as TutorialStatus)) return null;
  const stored: unknown[] = Array.isArray(record.chapters)
    ? record.chapters
    : [];
  const chapters = TUTORIAL_CHAPTERS.filter((chapter) =>
    stored.includes(chapter),
  );
  const snoozedUntil =
    typeof record.snoozedUntil === 'string' &&
    Number.isFinite(Date.parse(record.snoozedUntil))
      ? record.snoozedUntil
      : null;
  return {
    version: 1,
    status: record.status as TutorialStatus,
    chapters,
    snoozedUntil: record.status === 'snoozed' ? snoozedUntil : null,
  };
};

const EMPTY_STATE: TutorialState = {
  version: 1,
  status: 'active',
  chapters: [],
  snoozedUntil: null,
};

/** Pure transition shared by the client (optimistic) and the API (authoritative). */
export const applyTutorialAction = (
  state: TutorialState | null,
  action: TutorialAction,
  now: number = Date.now(),
): TutorialState => {
  const current = state ?? EMPTY_STATE;
  switch (action.type) {
    case 'start':
      return { ...current, status: 'active', snoozedUntil: null };
    case 'restart':
      return EMPTY_STATE;
    case 'replay-chapter': {
      // An explicit request to see a lesson again overrides an earlier "don't
      // show again" and plays the chapter the next time that page opens.
      if (!isChapter(action.chapter)) return current;
      return {
        ...current,
        status: 'active',
        snoozedUntil: null,
        chapters: current.chapters.filter(
          (chapter) => chapter !== action.chapter,
        ),
      };
    }
    case 'snooze':
      return {
        ...current,
        status: 'snoozed',
        snoozedUntil: new Date(now + TUTORIAL_SNOOZE_MS).toISOString(),
      };
    case 'dismiss':
      return { ...current, status: 'dismissed', snoozedUntil: null };
    case 'finish':
      return { ...current, status: 'completed', snoozedUntil: null };
    case 'complete-chapter': {
      if (!isChapter(action.chapter)) return current;
      const chapters = TUTORIAL_CHAPTERS.filter(
        (chapter) =>
          chapter === action.chapter || current.chapters.includes(chapter),
      );
      // Seeing every page is the same as finishing; an explicit dismissal
      // still wins.
      const done =
        current.status === 'active' &&
        chapters.length === TUTORIAL_CHAPTERS.length;
      return {
        ...current,
        chapters,
        status: done ? 'completed' : current.status,
      };
    }
    default:
      return current;
  }
};

/**
 * What the tutorial should do right now.
 * - `offer`: ask whether to start (first visit, or a snooze that has lapsed).
 * - `run`: play the chapter for the page the player is on.
 * - `off`: stay out of the way.
 */
export type TutorialPhase = 'offer' | 'run' | 'off';

export const getTutorialPhase = (
  state: TutorialState | null,
  options: { level: number; now?: number },
): TutorialPhase => {
  const now = options.now ?? Date.now();
  if (!state) {
    // Veterans who never saw it (e.g. cleared browser data) are not nagged;
    // they can start it from Settings.
    return options.level < FIRST_STRUCTURE_UPGRADE_LEVEL ? 'offer' : 'off';
  }
  switch (state.status) {
    case 'active':
      return 'run';
    case 'snoozed':
      return state.snoozedUntil && Date.parse(state.snoozedUntil) > now
        ? 'off'
        : 'offer';
    default:
      return 'off';
  }
};
