/** Keeps the outline clear of the window edges. */
export const VIEWPORT_MARGIN = 16;

/** Gap between the highlighted section and its outline. */
export const SPOTLIGHT_PADDING = 8;

export type HighlightRect = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

type Viewport = {
  readonly width: number;
  readonly height: number;
};

const currentViewport = (): Viewport => ({
  width: window.innerWidth,
  height: window.innerHeight,
});
export const isInsideViewport = (
  rect: DOMRect,
  viewport: Viewport = currentViewport(),
) =>
  rect.top >= VIEWPORT_MARGIN &&
  rect.bottom <= viewport.height - VIEWPORT_MARGIN &&
  rect.left >= VIEWPORT_MARGIN &&
  rect.right <= viewport.width - VIEWPORT_MARGIN;

/**
 * Outlines `rect` with a small gap, always fully on screen. Targets below the
 * fold or taller than the window are clamped so the outline can never end up
 * cut off, which previously hid the section the step was pointing at.
 */
export const toHighlightRect = (
  rect: DOMRect,
  viewport: Viewport = currentViewport(),
): HighlightRect => {
  const top = Math.min(
    Math.max(SPOTLIGHT_PADDING, rect.top - SPOTLIGHT_PADDING),
    Math.max(SPOTLIGHT_PADDING, viewport.height - SPOTLIGHT_PADDING),
  );
  const left = Math.min(
    Math.max(SPOTLIGHT_PADDING, rect.left - SPOTLIGHT_PADDING),
    Math.max(SPOTLIGHT_PADDING, viewport.width - SPOTLIGHT_PADDING),
  );
  return {
    top,
    left,
    width: Math.min(
      rect.width + SPOTLIGHT_PADDING * 2,
      viewport.width - left - SPOTLIGHT_PADDING,
    ),
    height: Math.min(
      rect.height + SPOTLIGHT_PADDING * 2,
      viewport.height - top - SPOTLIGHT_PADDING,
    ),
  };
};
