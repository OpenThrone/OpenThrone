import { Group, Select, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import { useArtworkPreview } from '@/hooks/useArtworkPreview';
import {
  isArtworkPreviewHost,
  setArtworkPreviewMode,
} from '@/utils/artworkPreview';

/** Local comparison control; never displayed on alpha or production. */
export default function ArtworkPreviewSelector() {
  const { t } = useTranslation('common');
  const mode = useArtworkPreview();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(isArtworkPreviewHost(window.location.hostname));
  }, []);
  if (!visible) return null;
  return (
    <Group justify="flex-end" gap="sm" py="xs" px="sm">
      <Text size="xs" c="var(--ot-muted)">
        {t('artworkPreview.localOnly')}
      </Text>
      <Select
        size="xs"
        label={t('artworkPreview.label')}
        value={mode}
        allowDeselect={false}
        data={[
          { value: 'default', label: t('artworkPreview.default') },
          { value: 'r2', label: t('artworkPreview.r2') },
          { value: 'pure', label: t('artworkPreview.pure') },
        ]}
        onChange={(value) => {
          if (value === 'default' || value === 'r2' || value === 'pure')
            setArtworkPreviewMode(value);
        }}
      />
    </Group>
  );
}
