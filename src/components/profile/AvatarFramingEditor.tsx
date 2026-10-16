import { Button, Group, Modal, Slider, Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import type { AvatarFraming } from '@/utils/avatarFraming';
import {
  AVATAR_ZOOM_MAX,
  AVATAR_ZOOM_MIN,
  DEFAULT_AVATAR_FRAMING,
  sanitizeAvatarFraming,
} from '@/utils/avatarFraming';

import classes from './Profile.module.css';
import { ProfilePortrait } from './ProfilePortrait';

type AvatarFramingEditorProps = {
  opened: boolean;
  onClose: () => void;
  /** Image to frame: the stored avatar or a pending upload's object URL. */
  avatar: string;
  race?: string;
  initialFraming: AvatarFraming | null;
  saving?: boolean;
  onSave: (framing: AvatarFraming) => void;
};

const KEY_STEP = 2; // percent per arrow press
const ZOOM_STEP = 0.1;

/** Drag to pan and zoom a portrait inside the race frame it will be shown in. */
export function AvatarFramingEditor({
  opened,
  onClose,
  avatar,
  race,
  initialFraming,
  saving = false,
  onSave,
}: AvatarFramingEditorProps) {
  const { t } = useTranslation('home');
  const [framing, setFraming] = useState<AvatarFraming>(
    initialFraming ?? DEFAULT_AVATAR_FRAMING,
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (opened) setFraming(initialFraming ?? DEFAULT_AVATAR_FRAMING);
  }, [opened, initialFraming]);

  const update = (next: Partial<AvatarFraming>) =>
    setFraming(
      (current) => sanitizeAvatarFraming({ ...current, ...next }) ?? current,
    );

  // Wheel zoom needs a non-passive listener so the page does not scroll.
  useEffect(() => {
    const stage = stageRef.current;
    if (!opened || !stage) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setFraming(
        (current) =>
          sanitizeAvatarFraming({
            ...current,
            zoom: current.zoom - Math.sign(event.deltaY) * ZOOM_STEP,
          }) ?? current,
      );
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [opened]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const last = dragRef.current;
    const stage = stageRef.current;
    if (!last || !stage) return;
    dragRef.current = { x: event.clientX, y: event.clientY };
    const { width, height } = stage.getBoundingClientRect();
    // Moving the pointer right drags the picture right, i.e. reveals its left side.
    setFraming(
      (current) =>
        sanitizeAvatarFraming({
          ...current,
          x:
            current.x -
            ((event.clientX - last.x) / width) * (100 / current.zoom),
          y:
            current.y -
            ((event.clientY - last.y) / height) * (100 / current.zoom),
        }) ?? current,
    );
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, Partial<AvatarFraming>> = {
      ArrowLeft: { x: framing.x + KEY_STEP },
      ArrowRight: { x: framing.x - KEY_STEP },
      ArrowUp: { y: framing.y + KEY_STEP },
      ArrowDown: { y: framing.y - KEY_STEP },
      '+': { zoom: framing.zoom + ZOOM_STEP },
      '=': { zoom: framing.zoom + ZOOM_STEP },
      '-': { zoom: framing.zoom - ZOOM_STEP },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    update(move);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('profile.framingTitle')}
      centered
      size="auto"
    >
      <Stack gap="md" align="center">
        <Text size="sm" c="dimmed" maw={360} ta="center">
          {t('profile.framingHelp')}
        </Text>
        <ProfilePortrait
          ref={stageRef}
          race={race}
          avatar={avatar}
          framing={framing}
          className={classes.framingStage}
          role="group"
          tabIndex={0}
          aria-label={t('profile.framingStageLabel')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
        />
        <Stack gap={4} w="100%">
          <Text size="sm" id="avatar-zoom-label">
            {t('profile.zoom')}
          </Text>
          <Slider
            aria-labelledby="avatar-zoom-label"
            min={AVATAR_ZOOM_MIN}
            max={AVATAR_ZOOM_MAX}
            step={0.05}
            value={framing.zoom}
            onChange={(zoom) => update({ zoom })}
            label={(value) => `${value.toFixed(2)}×`}
          />
        </Stack>
        <Group justify="space-between" w="100%">
          <Button
            variant="default"
            onClick={() => setFraming(DEFAULT_AVATAR_FRAMING)}
          >
            {t('profile.resetFraming')}
          </Button>
          <Group gap="sm">
            <Button variant="default" onClick={onClose}>
              {t('profile.cancel')}
            </Button>
            <Button loading={saving} onClick={() => onSave(framing)}>
              {t('profile.saveFraming')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
