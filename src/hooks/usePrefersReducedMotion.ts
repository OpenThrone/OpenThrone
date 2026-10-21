import { useReducedMotion } from '@mantine/hooks';
import { useSyncExternalStore } from 'react';

const BODY_CLASS = 'reduced-motion';

function subscribeBodyClass(onChange: () => void) {
  if (typeof document === 'undefined' || !document.body) return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observer.disconnect();
}

const readBodyClass = () =>
  typeof document !== 'undefined' &&
  Boolean(document.body?.classList.contains(BODY_CLASS));

/**
 * True when the OS asks for reduced motion or the app sets
 * `body.reduced-motion`, so JS-driven transitions match the CSS guards.
 */
export function usePrefersReducedMotion(): boolean {
  const systemPrefers = useReducedMotion();
  const bodyPrefers = useSyncExternalStore(
    subscribeBodyClass,
    readBodyClass,
    () => false,
  );
  return Boolean(systemPrefers) || bodyPrefers;
}
