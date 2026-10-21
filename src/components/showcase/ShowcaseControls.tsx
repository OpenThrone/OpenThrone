import { Group, SegmentedControl, Select, Slider, Text } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { useEffect, useState } from 'react';

import { useArtworkPreview } from '@/hooks/useArtworkPreview';
import {
  isArtworkPreviewHost,
  setArtworkPreviewMode,
} from '@/utils/artworkPreview';

import {
  SHOWCASE_BACKDROP_KEY,
  SHOWCASE_BACKDROPS,
  SHOWCASE_DEFAULT_VEIL,
  SHOWCASE_VEIL_KEY,
} from './backdrops';
import classes from './Showcase.module.css';

interface ShowcaseControlsProps {
  sections: { id: string; title: string }[];
}

/** Sticky preview controls: race theme, page backdrop and artwork source. */
export default function ShowcaseControls({ sections }: ShowcaseControlsProps) {
  const [scheme, setScheme] = useLocalStorage<string>({
    key: 'colorSchemePreview',
    defaultValue: '',
  });
  const [backdrop, setBackdrop] = useLocalStorage<string>({
    key: SHOWCASE_BACKDROP_KEY,
    defaultValue: 'default',
  });
  const [veil, setVeil] = useLocalStorage<number>({
    key: SHOWCASE_VEIL_KEY,
    defaultValue: SHOWCASE_DEFAULT_VEIL,
  });
  const artworkMode = useArtworkPreview();
  const [previewHost, setPreviewHost] = useState(false);
  useEffect(() => {
    setPreviewHost(isArtworkPreviewHost(window.location.hostname));
  }, []);

  return (
    <div className={classes.controls}>
      <Group gap="md" align="flex-end" wrap="wrap">
        <div>
          <Text size="xs" c="var(--ot-muted)" mb={4} id="showcase-race-label">
            Race theme
          </Text>
          <SegmentedControl
            size="xs"
            aria-labelledby="showcase-race-label"
            value={scheme || 'ACCOUNT'}
            onChange={(value) => setScheme(value === 'ACCOUNT' ? '' : value)}
            data={[
              { label: 'Account', value: 'ACCOUNT' },
              { label: 'Elf', value: 'ELF' },
              { label: 'Human', value: 'HUMAN' },
              { label: 'Goblin', value: 'GOBLIN' },
              { label: 'Undead', value: 'UNDEAD' },
            ]}
          />
        </div>
        <Select
          size="xs"
          w={230}
          label="Page backdrop"
          allowDeselect={false}
          value={backdrop}
          onChange={(value) => value && setBackdrop(value)}
          data={SHOWCASE_BACKDROPS.map(({ value, label }) => ({
            value,
            label,
          }))}
        />
        <div style={{ width: 160 }}>
          <Text size="xs" c="var(--ot-muted)" mb={10} id="showcase-veil-label">
            Backdrop veil: {veil}%
          </Text>
          <Slider
            size="sm"
            min={0}
            max={80}
            step={5}
            value={veil}
            onChange={setVeil}
            label={null}
            thumbLabel="Backdrop veil"
            aria-labelledby="showcase-veil-label"
          />
        </div>
        <Select
          size="xs"
          w={200}
          label="Artwork source"
          allowDeselect={false}
          disabled={!previewHost}
          description={
            previewHost ? undefined : 'Only on the local preview host'
          }
          value={artworkMode}
          onChange={(value) => {
            if (value === 'default' || value === 'r2' || value === 'pure')
              setArtworkPreviewMode(value);
          }}
          data={[
            { value: 'default', label: 'Configured' },
            { value: 'r2', label: 'R2 artwork' },
            { value: 'pure', label: 'No artwork (pure)' },
          ]}
        />
      </Group>
      <nav aria-label="Showcase sections" className={classes.contents}>
        {sections.map((section) => (
          <a key={section.id} href={`#${section.id}`}>
            {section.title}
          </a>
        ))}
      </nav>
    </div>
  );
}
