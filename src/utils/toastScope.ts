/**
 * Toasts raised this soon before a navigation belong to it: the usual
 * "save, toast, router.push" flow, whose message must survive the redirect.
 */
export const REDIRECT_GRACE_MS = 1500;

/**
 * Page toasts to dismiss when the player navigates (#277). Only toasts shown
 * well before the navigation started are dismissed; toasts raised with
 * `showAfterRedirect` are never tracked here.
 */
export const toastsToHideOnNavigation = (
  pageToasts: ReadonlyMap<string, number>,
  navigationStartedAt: number,
  graceMs: number = REDIRECT_GRACE_MS,
): string[] =>
  [...pageToasts]
    .filter(([, shownAt]) => navigationStartedAt - shownAt > graceMs)
    .map(([id]) => id);
