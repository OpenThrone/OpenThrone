// Pages mirrored into the FigCraft design file (design/openthrone.figcraft).
// Add or remove a route here when a player-facing page is added or removed.

export type DesignPage = { name: string; url: string };

export const VIEWPORT = { width: 1440, height: 900 };

export const PUBLIC_PAGES: DesignPage[] = [
  { name: 'home', url: '/' },
  { name: 'about', url: '/about' },
  { name: 'how-to-play', url: '/how-to-play' },
  { name: 'faq', url: '/faq' },
  { name: 'news', url: '/community/news' },
  { name: 'stats', url: '/community/stats' },
  { name: 'login', url: '/account/login' },
  { name: 'register', url: '/account/register' },
];

export const GAME_PAGES: DesignPage[] = [
  { name: 'overview', url: '/home/overview' },
  { name: 'levels', url: '/home/levels' },
  { name: 'profile', url: '/home/profile' },
  { name: 'settings', url: '/home/settings' },
  { name: 'learn', url: '/home/learn' },
  { name: 'attack', url: '/battle/users' },
  { name: 'training', url: '/battle/training' },
  { name: 'battle-upgrades', url: '/battle/upgrades' },
  { name: 'war-history', url: '/battle/history' },
  { name: 'armory', url: '/structures/armory/offense' },
  { name: 'bank', url: '/structures/bank/deposit' },
  { name: 'housing', url: '/structures/housing' },
  { name: 'repair', url: '/structures/repair' },
  { name: 'structure-upgrades', url: '/structures/upgrades/fortifications' },
  { name: 'alliances', url: '/alliances' },
  { name: 'messaging', url: '/messaging' },
  { name: 'friends', url: '/social/friends' },
  { name: 'auto-recruit', url: '/auto-recruit' },
];

// FigCraft pages, in order. `cols` is how many screens sit in each row.
export const DESIGN_PAGES = [
  {
    title: '01 — Public Site (Logged Out)',
    key: 'public',
    pages: PUBLIC_PAGES,
    cols: 4,
  },
  {
    title: '02 — Logged-In Game (Commander Shell)',
    key: 'game',
    pages: GAME_PAGES,
    cols: 6,
  },
] as const;

export const REFERENCE_PAGE_TITLE = '03 — Reference Screenshots';
