import type { TutorialChapterId } from '@/utils/tutorialState';

/** A button that takes the player to the page a step is pointing at. */
export type StepAction = {
  readonly href: string;
  /** Key under `walkthrough.actions`. */
  readonly label: string;
  /** Marks the suggested next page. */
  readonly primary?: boolean;
};

export type TutorialStep = {
  /** Text lives at `walkthrough.chapters.<chapter>.<step>.{title,body}`. */
  readonly id: string;
  /** Selectors tried in order; the first one that is on screen is outlined. */
  readonly targets?: readonly string[];
  /** `strategy` shows the starting-army presets for the Training page. */
  readonly kind?: 'text' | 'strategy';
  readonly actions?: readonly StepAction[];
  /** Only shown to players in this situation. */
  readonly requires?: 'protected';
};

export type TutorialChapter = {
  readonly id: TutorialChapterId;
  /** Route patterns (`router.pathname`) this chapter explains. */
  readonly routes: readonly string[];
  /** Page that opens when the lesson is replayed from the Learn page. */
  readonly href: string;
  readonly steps: readonly TutorialStep[];
};

const MENU_TARGETS = [
  '[data-tour-id="primary-nav"]',
  '[data-testid="mobile-menu-button"]',
] as const;

/**
 * One short chapter per page. Each ends by pointing at the next page worth
 * seeing, so players learn by moving through the game instead of watching one
 * long tour.
 */
export const TUTORIAL_CHAPTER_LIST: readonly TutorialChapter[] = [
  {
    id: 'overview',
    href: '/home/overview',
    routes: ['/home/overview'],
    steps: [
      { id: 'menu', targets: MENU_TARGETS },
      { id: 'sidebar', targets: ['[data-tour-id="sidebar"]'] },
      {
        id: 'protection',
        targets: ['[data-tour-id="protection"]'],
        requires: 'protected',
      },
      { id: 'stats', targets: ['[data-tour-id="overview-stats"]'] },
      {
        id: 'next',
        targets: ['[data-testid="nav-battle-link"]', ...MENU_TARGETS],
        actions: [
          { href: '/battle/training', label: 'openTraining', primary: true },
          { href: '/battle/users', label: 'openAttack' },
        ],
      },
    ],
  },
  {
    id: 'attack',
    href: '/battle/users',
    routes: ['/battle/users'],
    steps: [
      { id: 'targets', targets: ['[data-tour-id="main-area"]'] },
      {
        id: 'needOffense',
        targets: ['[data-tour-id="main-area"]'],
        actions: [
          { href: '/battle/training', label: 'openTraining', primary: true },
        ],
      },
    ],
  },
  {
    id: 'training',
    href: '/battle/training',
    routes: ['/battle/training'],
    steps: [
      { id: 'how', targets: ['[data-tour-id="training-panel"]'] },
      { id: 'balance', targets: ['[data-tour-id="training-panel"]'] },
      {
        id: 'strategy',
        kind: 'strategy',
        targets: ['[data-tour-id="training-panel"]'],
      },
      {
        id: 'next',
        actions: [
          {
            href: '/structures/armory/offense',
            label: 'openArmory',
            primary: true,
          },
        ],
      },
    ],
  },
  {
    id: 'armory',
    href: '/structures/armory/offense',
    routes: ['/structures/armory'],
    steps: [
      { id: 'gear', targets: ['[data-tour-id="armory-panel"]'] },
      {
        id: 'next',
        actions: [
          {
            href: '/structures/bank/deposit',
            label: 'openBank',
            primary: true,
          },
        ],
      },
    ],
  },
  {
    id: 'bank',
    href: '/structures/bank/deposit',
    routes: ['/structures/bank'],
    steps: [{ id: 'protect', targets: ['[data-tour-id="bank-panel"]'] }],
  },
];

/** Chapter for the page the player is on, matched on whole path segments. */
export const findChapterForRoute = (
  pathname: string,
): TutorialChapter | undefined =>
  TUTORIAL_CHAPTER_LIST.find((chapter) =>
    chapter.routes.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    ),
  );
