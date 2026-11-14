import { useRouter } from 'next/router';
import Script from 'next/script';
import { useCallback, useEffect, useRef } from 'react';

import { GA_MEASUREMENT_ID, useConsent } from '@/context/ConsentContext';
import { sanitizePageView, sanitizeReferrer } from '@/utils/analyticsPage';
import { shouldLoadAnalytics } from '@/utils/consent';

/**
 * Loads Google Analytics 4 only after the visitor granted analytics consent.
 *
 * Renders nothing and makes no request to any Google host before the grant:
 * the only thing set up front is the local `dataLayer` queue with Consent
 * Mode v2 defaults (all denied), which never leaves the browser.
 */
export default function GoogleAnalytics() {
  const { analytics, measurementConfigured } = useConsent();
  const router = useRouter();
  // Also false while the ENABLE_SITE_ANALYTICS admin setting is off.
  const measurementId = measurementConfigured ? GA_MEASUREMENT_ID : null;
  const active =
    !!measurementId &&
    analytics === 'granted' &&
    shouldLoadAnalytics(router.pathname);
  const initializedRef = useRef(false);

  // Consent Mode v2 defaults, set before any Google script can load so no
  // cookie is written and no hit is sent before a choice exists.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') {
      // gtag.js only processes the `arguments` object itself; an array
      // (rest parameters) pushed to the dataLayer is silently ignored.
      window.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        window.dataLayer?.push(arguments);
      };
    }
    window.gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      wait_for_update: 500,
    });
  }, []);

  // Google's documented kill switch: while set, gtag.js sends nothing at all.
  // It covers what unmounting the script cannot: automatic events (scroll,
  // engagement, history changes) after consent is withdrawn or on staff pages.
  // Keyed on the build-time id, not `measurementId`: when the admin setting
  // is turned off mid-visit, gtag.js may already be loaded and must stop.
  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    (window as unknown as Record<string, boolean>)[
      `ga-disable-${GA_MEASUREMENT_ID}`
    ] = !active;
  }, [active]);

  const sendPageView = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') {
      return;
    }
    // Only the sanitized location ever reaches Google: route patterns instead
    // of dynamic segments, no query string, no hash, generic title.
    const { pageLocation, pageTitle } = sanitizePageView({
      origin: window.location.origin,
      routePattern: router.pathname,
      actualPathname: window.location.pathname,
      localePrefix:
        router.locale && router.locale !== router.defaultLocale
          ? `/${router.locale}`
          : '',
    });
    const pageReferrer = sanitizeReferrer(document.referrer);
    // Also the default for every later automatic event on this page, which
    // would otherwise report the real URL with its ids and query string.
    window.gtag('set', {
      page_location: pageLocation,
      page_title: pageTitle,
      page_referrer: pageReferrer,
    });
    window.gtag('event', 'page_view', {
      page_location: pageLocation,
      page_title: pageTitle,
      page_referrer: pageReferrer,
      send_to: measurementId,
    });
  }, [measurementId, router.pathname, router.locale, router.defaultLocale]);

  useEffect(() => {
    if (!active || typeof window.gtag !== 'function') return;
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    if (!initializedRef.current) {
      initializedRef.current = true;
      window.gtag('js', new Date());
      window.gtag('config', measurementId as string, {
        send_page_view: false,
        anonymize_ip: true,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
      sendPageView();
    }
  }, [active, measurementId, sendPageView]);

  useEffect(() => {
    if (!active) return undefined;
    const handleRouteChange = () => sendPageView();
    router.events.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [active, router.events, sendPageView]);

  if (!active || !measurementId) return null;

  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      strategy="afterInteractive"
    />
  );
}
