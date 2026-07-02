import { Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import ContentCard from './ContentCard';

const STORAGE_KEY = 'news-bulletin-dismissed-v1';

const NewsBulletin: React.FC = () => {
  const { t } = useTranslation('common');
  const envMessage = process.env.NEXT_PUBLIC_ADMIN_MAINTENANCE_MESSAGE ?? '';
  const [visible, setVisible] = useState(Boolean(envMessage));
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'true') {
        setVisible(false);
        setDismissed(true);
      }
    } catch {
      // ignore storage errors (e.g., privacy mode, quota exceeded)
    }
  }, []);

  useEffect(() => {
    setVisible(Boolean(envMessage) && !dismissed);
  }, [envMessage, dismissed]);

  if (!envMessage || !visible) return null;

  const onClose = () => {
    try {
      if (typeof window !== 'undefined')
        localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // ignore storage errors (e.g., privacy mode, quota exceeded)
    }
    setVisible(false);
    setDismissed(true);
  };

  return (
    <div
      className="container mx-auto px-4"
      role="region"
      aria-live="polite"
      aria-label={t('ariaLabels.siteAnnouncement')}
    >
      <div className="my-3">
        <ContentCard
          title="Important Announcement"
          titlePosition="left"
          titleSize="md"
          variant="highlight"
        >
          <div className="flex items-start gap-3">
            <div className="mt-1 shrink-0" aria-hidden>
              <svg
                className="size-6 text-yellow-600"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
                  fill="currentColor"
                  opacity="0.08"
                />
                <path d="M11 7h2v6h-2V7zm0 8h2v2h-2v-2z" fill="currentColor" />
              </svg>
            </div>

            <div className="flex-1">
              <Text
                size="md"
                className="break-words font-semibold text-yellow-800"
              >
                {envMessage}
              </Text>
            </div>

            <div className="ml-3">
              <button
                onClick={onClose}
                aria-label={t('ariaLabels.dismissAnnouncement')}
                className="rounded text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2"
              >
                <svg
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden
                >
                  <path
                    d="M6 6l12 12M6 18L18 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </ContentCard>
      </div>
    </div>
  );
};

export default NewsBulletin;
