import {
  Alert,
  Avatar,
  Box,
  Button,
  FileInput,
  Group,
  Image,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import {
  AllianceImageFramingEditor,
  CENTERED_ARTWORK,
} from '@/components/alliance/AllianceImageFramingEditor';
import { GameCard } from '@/components/game/GameCard';
import type { AvatarFraming } from '@/utils/avatarFraming';
import { avatarFramingStyle, splitAvatarFraming } from '@/utils/avatarFraming';

export interface AllianceArtworkChange {
  avatar: File | null;
  bannerimg: File | null;
  removeAvatar: boolean;
  removeBanner: boolean;
  avatarFraming?: AvatarFraming;
  bannerFraming?: AvatarFraming;
}
function useImagePreview(
  file: File | null,
  current: string | undefined,
  removed: boolean,
) {
  const [preview, setPreview] = useState<string | undefined>();
  useEffect(() => {
    if (!file) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return removed ? undefined : (preview ?? current);
}

/** Uploads are submitted together; the guide supplies a mock save action. */
export function AllianceArtworkEditor({
  avatar,
  bannerimg,
  onSave,
}: {
  avatar?: string;
  bannerimg?: string;
  onSave: (changes: AllianceArtworkChange) => Promise<void>;
}) {
  const { t } = useTranslation('alliances');
  const [photo, setPhoto] = useState<File | null>(null);
  const [banner, setBanner] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<'avatar' | 'bannerimg' | null>(null);
  const [photoFrame, setPhotoFrame] = useState<AvatarFraming | null>(null);
  const [bannerFrame, setBannerFrame] = useState<AvatarFraming | null>(null);
  const currentPhotoFrame =
    photoFrame ?? splitAvatarFraming(avatar).framing ?? CENTERED_ARTWORK;
  const currentBannerFrame =
    bannerFrame ?? splitAvatarFraming(bannerimg).framing ?? CENTERED_ARTWORK;
  const photoPreview = useImagePreview(photo, avatar, removeAvatar);
  const bannerPreview = useImagePreview(banner, bannerimg, removeBanner);
  const dirty =
    !!photo ||
    !!banner ||
    removeAvatar ||
    removeBanner ||
    !!photoFrame ||
    !!bannerFrame;
  const chooseFile = (file: File | null, kind: 'avatar' | 'bannerimg') => {
    setSaved(false);
    setError('');
    if (file && file.size > 4 * 1024 * 1024) {
      setError(t('artwork.tooLarge'));
      return;
    }
    if (kind === 'avatar') {
      setPhoto(file);
      setPhotoFrame(file ? CENTERED_ARTWORK : null);
      setRemoveAvatar(false);
    } else {
      setBanner(file);
      setBannerFrame(file ? CENTERED_ARTWORK : null);
      setRemoveBanner(false);
    }
  };
  return (
    <GameCard title={t('artwork.title')}>
      {editing && (
        <AllianceImageFramingEditor
          source={
            splitAvatarFraming(
              editing === 'avatar' ? photoPreview : bannerPreview,
            ).src
          }
          kind={editing}
          initial={
            editing === 'avatar' ? currentPhotoFrame : currentBannerFrame
          }
          onClose={() => setEditing(null)}
          onApply={(frame) => {
            if (editing === 'avatar') setPhotoFrame(frame);
            else setBannerFrame(frame);
            setSaved(false);
            setEditing(null);
          }}
        />
      )}
      <Stack gap="md">
        <Text size="sm" c="var(--ot-muted)">
          {t('artwork.help')}
        </Text>
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
          <Stack gap="sm">
            <Avatar
              src={splitAvatarFraming(photoPreview).src}
              styles={{ image: avatarFramingStyle(currentPhotoFrame) }}
              size={120}
              radius="xl"
              alt={t('artwork.photoAlt')}
            />
            <Button
              variant="light"
              disabled={busy || !photoPreview}
              onClick={() => setEditing('avatar')}
            >
              {t('artwork.framePhoto')}
            </Button>
            <FileInput
              label={t('artwork.photo')}
              placeholder={t('artwork.chooseFile')}
              description={t('artwork.photoHelp')}
              value={photo}
              onChange={(file) => chooseFile(file, 'avatar')}
              accept="image/png,image/jpeg,image/gif,image/webp"
              clearable
              disabled={busy}
            />
            <Button
              variant="subtle"
              size="compact-sm"
              disabled={busy || (!photoPreview && !removeAvatar)}
              onClick={() => {
                setPhoto(null);
                setPhotoFrame(null);
                setRemoveAvatar(!removeAvatar);
                setSaved(false);
              }}
            >
              {t(removeAvatar ? 'artwork.undo' : 'artwork.removePhoto')}
            </Button>
          </Stack>
          <Stack gap="sm">
            {bannerPreview ? (
              <Box
                style={{
                  aspectRatio: '5',
                  overflow: 'hidden',
                  borderRadius: 'var(--mantine-radius-sm)',
                }}
              >
                <Image
                  src={splitAvatarFraming(bannerPreview).src}
                  style={avatarFramingStyle(currentBannerFrame)}
                  h="100%"
                  fit="cover"
                  radius="sm"
                  alt={t('artwork.bannerAlt')}
                />
              </Box>
            ) : (
              <Text h={120} p="md" bg="var(--ot-inset)" c="var(--ot-muted)">
                {t('artwork.noBanner')}
              </Text>
            )}
            <Button
              variant="light"
              disabled={busy || !bannerPreview}
              onClick={() => setEditing('bannerimg')}
            >
              {t('artwork.frameBanner')}
            </Button>
            <FileInput
              label={t('artwork.banner')}
              placeholder={t('artwork.chooseFile')}
              description={t('artwork.bannerHelp')}
              value={banner}
              onChange={(file) => chooseFile(file, 'bannerimg')}
              accept="image/png,image/jpeg,image/gif,image/webp"
              clearable
              disabled={busy}
            />
            <Button
              variant="subtle"
              size="compact-sm"
              disabled={busy || (!bannerPreview && !removeBanner)}
              onClick={() => {
                setBanner(null);
                setBannerFrame(null);
                setRemoveBanner(!removeBanner);
                setSaved(false);
              }}
            >
              {t(removeBanner ? 'artwork.undo' : 'artwork.removeBanner')}
            </Button>
          </Stack>
        </SimpleGrid>
        <Group justify="space-between">
          <Text role="status" size="sm">
            {saved ? t('artwork.saved') : ''}
          </Text>
          <Button
            loading={busy}
            disabled={!dirty}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              setError('');
              setSaved(false);
              try {
                await onSave({
                  avatar: photo,
                  bannerimg: banner,
                  removeAvatar,
                  removeBanner,
                  avatarFraming: removeAvatar
                    ? undefined
                    : (photoFrame ?? undefined),
                  bannerFraming: removeBanner
                    ? undefined
                    : (bannerFrame ?? undefined),
                });
                setPhoto(null);
                setBanner(null);
                setRemoveAvatar(false);
                setRemoveBanner(false);
                setPhotoFrame(null);
                setBannerFrame(null);
                setSaved(true);
              } catch {
                setError(t('artwork.saveError'));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('artwork.save')}
          </Button>
        </Group>
      </Stack>
    </GameCard>
  );
}
