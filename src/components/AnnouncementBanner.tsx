import { Alert, CloseButton, Group } from '@mantine/core';
import { useEffect, useState } from 'react';

import { logError } from '@/utils/logger';

const AnnouncementBanner = () => {
  const [banners, setBanners] = useState<any[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const res = await fetch('/api/announcements');
        if (res.ok) {
          const data = await res.json();
          setBanners(data);
        }
      } catch (err) {
        logError('Failed to load announcements:', err);
      }
    };
    fetchBanners();
    const interval = setInterval(fetchBanners, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!banners.length) return null;

  const visible = banners.filter((b) => !dismissed.has(b.id));
  if (!visible.length) return null;

  return (
    <div style={{ position: 'relative', zIndex: 100 }}>
      {visible.map((b) => {
        const colorMap: Record<string, string> = {
          CRITICAL: 'red',
          WARNING: 'yellow',
          SUCCESS: 'green',
          INFO: 'blue',
        };
        return (
          <Alert
            key={b.id}
            color={colorMap[b.severity] || 'blue'}
            title={b.title}
            withCloseButton={b.dismissible}
            onClose={() => {
              if (b.dismissible) {
                setDismissed((prev) => new Set(prev).add(b.id));
              }
            }}
            style={{ marginBottom: 8 }}
          >
            {b.body}
          </Alert>
        );
      })}
    </div>
  );
};

export default AnnouncementBanner;
