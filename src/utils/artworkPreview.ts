export type ArtworkPreviewMode = 'default' | 'r2' | 'pure';
export const ARTWORK_PREVIEW_KEY = 'ot-artwork-preview';
let mode: ArtworkPreviewMode = 'default';
const listeners = new Set<() => void>();

/** The override is deliberately scoped to the workstation's preview hostname. */
export function isArtworkPreviewHost(hostname: string): boolean {
  return hostname === 'ot.aioxhost.com';
}
export function getArtworkPreviewMode(): ArtworkPreviewMode {
  return typeof window !== 'undefined' &&
    isArtworkPreviewHost(window.location.hostname)
    ? mode
    : 'default';
}
export function setArtworkPreviewMode(value: ArtworkPreviewMode) {
  if (
    typeof window === 'undefined' ||
    !isArtworkPreviewHost(window.location.hostname)
  )
    return;
  mode = value === 'r2' || value === 'pure' ? value : 'default';
  try {
    window.localStorage.setItem(ARTWORK_PREVIEW_KEY, mode);
  } catch {
    /* In-memory comparison still works when storage is unavailable. */
  }
  listeners.forEach((listener) => listener());
}
export function subscribeArtworkPreview(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
