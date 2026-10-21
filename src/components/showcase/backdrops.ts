/** Page backdrops the /test showcase can place behind the game shell. */
export const SHOWCASE_BACKDROP_KEY = 'showcaseBackdrop';
/** Readability overlay strength on /test, 0-90 (percent black at the top). */
export const SHOWCASE_VEIL_KEY = 'showcaseVeil';
export const SHOWCASE_DEFAULT_VEIL = 55;

export const SHOWCASE_BACKDROPS = [
  {
    value: 'default',
    label: 'Game shell (default)',
    src: '/assets/header/openthrone-bg.png',
  },
  {
    value: 'throne-room',
    label: 'Throne room (public)',
    src: '/assets/images/ui/public/throne-room.webp',
  },
  {
    value: 'war-table',
    label: 'War table (public)',
    src: '/assets/images/ui/public/war-table.webp',
  },
  {
    value: 'throne-human',
    label: 'Human throne (profile)',
    src: '/assets/images/ui/profile/throne-human.webp',
  },
  {
    value: 'throne-undead',
    label: 'Undead throne (profile)',
    src: '/assets/images/ui/profile/throne-undead.webp',
  },
  {
    value: 'throne-goblin',
    label: 'Goblin throne (profile)',
    src: '/assets/images/ui/profile/throne-goblin.webp',
  },
  {
    value: 'announcement',
    label: 'Announcement scene',
    src: '/assets/images/ui/shell/announcement-scene.webp',
  },
  {
    value: 'ledger',
    label: 'Battle ledger',
    src: '/assets/images/ui/battle-report/backgrounds/bg-ledger-brown.webp',
  },
  {
    value: 'stone-blue',
    label: 'Blue stone',
    src: '/assets/images/ui/battle-report/backgrounds/bg-stone-blue.webp',
  },
  { value: 'none', label: 'No artwork', src: null },
] as const;

export type ShowcaseBackdrop = (typeof SHOWCASE_BACKDROPS)[number]['value'];

/** Artwork path for a stored backdrop choice; unknown values fall back to the default. */
export function showcaseBackdropSource(value: string | null | undefined) {
  const match = SHOWCASE_BACKDROPS.find((backdrop) => backdrop.value === value);
  return match ? match.src : SHOWCASE_BACKDROPS[0].src;
}
