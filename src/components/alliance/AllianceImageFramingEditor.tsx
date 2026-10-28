import {
  Box,
  Button,
  Group,
  Image,
  Modal,
  Slider,
  Stack,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

import type { AvatarFraming } from '@/utils/avatarFraming';
import {
  avatarFramingStyle,
  sanitizeAvatarFraming,
} from '@/utils/avatarFraming';

export const CENTERED_ARTWORK: AvatarFraming = { x: 50, y: 50, zoom: 1 };

/** The viewport is the crop; only framing metadata changes, preserving the original image. */
export function AllianceImageFramingEditor({
  source,
  kind,
  initial,
  onApply,
  onClose,
}: {
  source: string;
  kind: 'avatar' | 'bannerimg';
  initial: AvatarFraming;
  onApply: (value: AvatarFraming) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('alliances');
  const id = useId();
  const [value, setValue] = useState(initial);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    setValue(initial);
    setLoaded(false);
    setFailed(false);
  }, [source, initial]);
  const update = (change: Partial<AvatarFraming>) =>
    setValue(
      (current) => sanitizeAvatarFraming({ ...current, ...change }) ?? current,
    );
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const changes: Record<string, Partial<AvatarFraming>> = {
      ArrowLeft: { x: value.x + 2 },
      ArrowRight: { x: value.x - 2 },
      ArrowUp: { y: value.y + 2 },
      ArrowDown: { y: value.y - 2 },
      '+': { zoom: value.zoom + 0.1 },
      '=': { zoom: value.zoom + 0.1 },
      '-': { zoom: value.zoom - 0.1 },
    };
    if (changes[event.key]) {
      event.preventDefault();
      update(changes[event.key]);
    }
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const last = drag.current;
    drag.current = { x: event.clientX, y: event.clientY };
    const bounds = event.currentTarget.getBoundingClientRect();
    setValue(
      (current) =>
        sanitizeAvatarFraming({
          ...current,
          x:
            current.x -
            (((event.clientX - last.x) / bounds.width) * 100) / current.zoom,
          y:
            current.y -
            (((event.clientY - last.y) / bounds.height) * 100) / current.zoom,
        }) ?? current,
    );
  };
  return (
    <Modal
      opened
      onClose={onClose}
      title={t(
        kind === 'avatar' ? 'artwork.framePhoto' : 'artwork.frameBanner',
      )}
      size="lg"
      centered
    >
      <Stack>
        <Text size="sm" c="var(--ot-muted)">
          {t('artwork.frameHelp')}
        </Text>
        <Box
          role="group"
          tabIndex={0}
          aria-label={t('artwork.cropViewport')}
          aria-describedby={`${id}-help`}
          onKeyDown={onKeyDown}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={move}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          style={{
            aspectRatio: kind === 'avatar' ? '1' : '5',
            width: kind === 'avatar' ? 'min(100%, 300px)' : '100%',
            marginInline: 'auto',
            overflow: 'hidden',
            borderRadius:
              kind === 'avatar' ? '50%' : 'var(--mantine-radius-sm)',
            background: 'var(--ot-inset)',
            touchAction: 'none',
            cursor: 'grab',
          }}
        >
          <Image
            src={source}
            alt={t('artwork.cropViewport')}
            h="100%"
            w="100%"
            fit="cover"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            style={avatarFramingStyle(value)}
          />
        </Box>
        <Text id={`${id}-help`} size="xs" c="var(--ot-muted)">
          {t('artwork.keyboardHelp')}
        </Text>
        {failed && (
          <Text role="alert" c="red">
            {t('artwork.imageError')}
          </Text>
        )}
        {(['zoom', 'x', 'y'] as const).map((key) => (
          <Stack gap={4} key={key}>
            <Text size="sm" id={`${id}-${key}`}>
              {t(`artwork.${key}`)}
            </Text>
            <Slider
              aria-labelledby={`${id}-${key}`}
              thumbLabel={t(`artwork.${key}`)}
              min={key === 'zoom' ? 1 : 0}
              max={key === 'zoom' ? 3 : 100}
              step={key === 'zoom' ? 0.05 : 1}
              value={value[key]}
              onChange={(next) => update({ [key]: next })}
              label={(n) => (key === 'zoom' ? `${n.toFixed(2)}×` : `${n}%`)}
            />
          </Stack>
        ))}
        <Group justify="space-between">
          <Button variant="default" onClick={() => setValue(CENTERED_ARTWORK)}>
            {t('artwork.resetCrop')}
          </Button>
          <Group>
            <Button variant="default" onClick={onClose}>
              {t('artwork.cancelCrop')}
            </Button>
            <Button disabled={!loaded || failed} onClick={() => onApply(value)}>
              {t('artwork.applyCrop')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
