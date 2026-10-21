/**
 * Semantic colours for admin stat tiles (overview, economy). Values are
 * Mantine theme colour variables so they follow the shared palette instead
 * of ad-hoc hex literals. Meaning is always repeated by the tile label.
 */
export const ADMIN_STAT_COLORS = {
  /** Healthy totals: players, overall economy. */
  positive: 'var(--mantine-color-green-5)',
  /** Live activity: active players. */
  info: 'var(--mantine-color-blue-5)',
  /** Gold and newly arrived players. */
  gold: 'var(--ot-accent)',
  /** Items that need staff attention soon. */
  warning: 'var(--mantine-color-orange-5)',
  /** Bans and cheat signals. */
  danger: 'var(--mantine-color-red-6)',
  /** Appeals, alliances and banked gold. */
  special: 'var(--mantine-color-violet-5)',
  /** Combat volume. */
  combat: 'var(--mantine-color-indigo-5)',
} as const;

export type AdminStatColor = keyof typeof ADMIN_STAT_COLORS;

/**
 * Chart palette for the balance simulator. Recharts series need distinct,
 * literal colours (SVG presentation attributes do not resolve CSS variables
 * reliably), so these stay as hex values in one documented constant.
 */
export const ADMIN_CHART_PALETTE = {
  attacker: '#f59e0b',
  defender: '#6366f1',
  gold: '#eab308',
  loot: '#22c55e',
  active: '#3b82f6',
  defeated: '#ef4444',
  lowTurn: '#f97316',
  highTurn: '#8b5cf6',
  grid: '#333333',
  axis: '#888888',
} as const;

/** Tooltip frame for admin charts; HTML, so theme tokens apply. */
export const ADMIN_CHART_TOOLTIP_STYLE = {
  background: 'var(--ot-surface-2)',
  border: '1px solid var(--ot-line)',
} as const;
