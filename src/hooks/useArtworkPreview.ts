import { useEffect, useSyncExternalStore } from 'react';

import {
  ARTWORK_PREVIEW_KEY,
  getArtworkPreviewMode,
  setArtworkPreviewMode,
  subscribeArtworkPreview,
} from '@/utils/artworkPreview';

export function useArtworkPreview() {
  const mode = useSyncExternalStore(
    subscribeArtworkPreview,
    getArtworkPreviewMode,
    () => 'default' as const,
  );
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ARTWORK_PREVIEW_KEY);
      if (saved === 'r2' || saved === 'pure') setArtworkPreviewMode(saved);
    } catch {
      /* Storage is optional. */
    }
  }, []);
  return mode;
}
