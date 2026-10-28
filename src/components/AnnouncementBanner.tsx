import { useEffect, useState } from 'react';

import type { Announcement } from '@/components/AnnouncementPager';
import AnnouncementPager from '@/components/AnnouncementPager';
import { logError } from '@/utils/logger';

const STORAGE_KEY = 'announcements-dismissed-v1';
const REFRESH_MS = 5 * 60 * 1000;

const readDismissed = (): Set<number> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.filter((v) => Number.isInteger(v)) : [],
    );
  } catch {
    return new Set();
  }
};

const writeDismissed = (ids: Set<number>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Dismissal still works for the current session.
  }
};

/** Renders active database announcements as ornate site bulletins. */
const AnnouncementBanner = () => {
  const [banners, setBanners] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  useEffect(() => {
    setDismissed(readDismissed());
    const fetchBanners = async () => {
      try {
        const res = await fetch('/api/announcements');
        if (res.ok) setBanners(await res.json());
      } catch (err) {
        logError('Failed to load announcements:', err);
      }
    };
    fetchBanners();
    const interval = setInterval(fetchBanners, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const dismiss = (id: number) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      writeDismissed(next);
      return next;
    });
  };

  const restore = (id: number) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      writeDismissed(next);
      return next;
    });
  };

  return (
    <AnnouncementPager
      announcements={banners}
      dismissed={dismissed}
      onDismiss={dismiss}
      onRestore={restore}
    />
  );
};

export default AnnouncementBanner;
