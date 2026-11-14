'use client';

import { useRouter } from 'next/router';
import React, {
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { ConsentBannerView } from '@/components/analytics/ConsentBannerView';
import { CookieSettingsModal } from '@/components/analytics/CookieSettingsModal';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';
import {
  buildConsentCookieString,
  CONSENT_COOKIE_NAME,
  type ConsentChoice,
  type EffectiveConsent,
  gaCookieClearTargets,
  isMeasurementIdConfigured,
  parseConsentCookie,
  resolveConsentVisibility,
} from '@/utils/consent';

/** The measurement ID is inlined at build time; unconfigured means inert. */
export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export interface ConsentContextValue {
  /** The consent state the app acts on (`unset` until a choice exists). */
  analytics: EffectiveConsent;
  /** Stores an explicit choice (banner or settings) and reports the tally. */
  setAnalytics: (choice: ConsentChoice) => void;
  /** Opens the cookie-settings dialog from anywhere (e.g. the footer link). */
  openSettings: () => void;
  /**
   * False while the feature is inert: no valid measurement ID is configured,
   * or the ENABLE_SITE_ANALYTICS admin setting is off (or not loaded yet).
   */
  measurementConfigured: boolean;
}

const ConsentContext = React.createContext<ConsentContextValue | null>(null);

/**
 * Owns the consent cookie: it is read once after mount (so server and client
 * markup never mismatch), resolved against GPC, and shared with the banner,
 * the footer settings dialog and the Google Analytics loader.
 */
export function ConsentProvider({ children }: { children: ReactNode }) {
  // `undefined` = not read yet; `null` = read, no choice stored.
  const [storedChoice, setStoredChoice] = useState<
    ConsentChoice | null | undefined
  >(undefined);
  const [globalPrivacyControl, setGlobalPrivacyControl] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { pathname } = useRouter();

  useEffect(() => {
    setStoredChoice(
      parseConsentCookie(readConsentCookieValue(document.cookie)),
    );
    // The GPC signal is read-only; visitors can still opt in via settings.
    setGlobalPrivacyControl(
      typeof navigator !== 'undefined' &&
        (navigator as { globalPrivacyControl?: boolean })
          .globalPrivacyControl === true,
    );
  }, []);

  // The admin switch and the privacy policy wording move together: Google
  // Analytics stays off until the setting is on, and off again the moment it
  // is turned off (the runtime config is polled).
  const { config } = useRuntimeConfig();
  const siteAnalyticsEnabled = config?.enableSiteAnalytics === true;
  const measurementConfigured = useMemo(
    () => siteAnalyticsEnabled && isMeasurementIdConfigured(GA_MEASUREMENT_ID),
    [siteAnalyticsEnabled],
  );

  // The banner must not flash on reload before the cookie has been read.
  const ready = storedChoice !== undefined;

  const { showBanner, effectiveAnalytics } = useMemo(
    () =>
      ready
        ? resolveConsentVisibility({
            measurementConfigured,
            storedChoice,
            globalPrivacyControl,
            // The route pattern carries no locale prefix (`/de/home/admin`)
            // and follows client-side navigation.
            pathname,
          })
        : { showBanner: false, effectiveAnalytics: 'unset' as const },
    [
      ready,
      measurementConfigured,
      storedChoice,
      globalPrivacyControl,
      pathname,
    ],
  );

  const setAnalytics = useCallback((choice: ConsentChoice) => {
    setStoredChoice(choice);
    if (typeof document !== 'undefined') {
      document.cookie = buildConsentCookieString(choice, {
        secure: window.location.protocol === 'https:',
      });
    }
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: choice,
      });
    }
    if (choice === 'denied') {
      deleteGoogleAnalyticsCookies();
    }
    // Aggregate opt-in tally: one call per explicit choice, fire-and-forget.
    // The GPC default never reports, and failures are ignored by design.
    fetch('/api/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice }),
    }).catch(() => undefined);
  }, []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      analytics: effectiveAnalytics,
      setAnalytics,
      openSettings: () => setSettingsOpen(true),
      measurementConfigured,
    }),
    [effectiveAnalytics, setAnalytics, measurementConfigured],
  );

  return (
    <ConsentContext.Provider value={value}>
      {showBanner && (
        <ConsentBannerView
          onAccept={() => setAnalytics('granted')}
          onDecline={() => setAnalytics('denied')}
        />
      )}
      {children}
      {measurementConfigured && (
        <CookieSettingsModal
          opened={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          analytics={effectiveAnalytics}
          onChange={setAnalytics}
          globalPrivacyControl={globalPrivacyControl}
        />
      )}
    </ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextValue {
  const context = useContext(ConsentContext);
  if (!context) {
    throw new Error('useConsent must be used within ConsentProvider');
  }
  return context;
}

/** Expires every `_ga*` cookie for this host and the registrable parent. */
export function deleteGoogleAnalyticsCookies(): void {
  if (typeof document === 'undefined') return;
  const expires = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT';
  for (const target of gaCookieClearTargets(
    document.cookie,
    window.location.hostname,
  )) {
    document.cookie = `${target.name}=; ${expires}; Path=/${
      target.domain ? `; Domain=${target.domain}` : ''
    }`;
  }
}

/** Extracts one cookie's value from a full `document.cookie` string. */
function readConsentCookieValue(cookieString: string): string | null {
  if (typeof document === 'undefined') return null;
  const entry = cookieString
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CONSENT_COOKIE_NAME}=`));
  if (!entry) return null;
  return entry.slice(CONSENT_COOKIE_NAME.length + 1);
}
