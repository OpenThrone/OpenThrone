import {
  Avatar,
  Badge,
  Box,
  Button,
  Group,
  Image,
  Stack,
  Text,
} from '@mantine/core';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import panelClasses from '@/components/game/Panels.module.css';
import { useUser } from '@/context/users';
import { avatarFramingStyle, splitAvatarFraming } from '@/utils/avatarFraming';
import { toLocale } from '@/utils/numberFormatting';

type AllianceCardProps = {
  id: number;
  name: string;
  members: number;
  description?: string | null;
  gold?: string | number | null;
  joinText?: string;
  imgsrc?: string | null;
  bannerimgsrc?: string | null;
  joinMode?: string;
  onJoin?: (id: number) => Promise<void>;
  userMembership?: unknown;
  isLeader?: boolean;
  roleName?: string;
};

/** Shared alliance identity, membership and actions for both directories. */
export const AllianceCard = ({
  id,
  name,
  members,
  description,
  gold,
  joinText,
  imgsrc,
  bannerimgsrc,
  joinMode,
  onJoin,
  userMembership, // Permissions or role if member
  isLeader,
  roleName = undefined,
}: AllianceCardProps) => {
  const { t } = useTranslation('alliances');
  const { user } = useUser();
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const handleJoinClick = async () => {
    setLoading(true);
    try {
      await onJoin?.(id);
    } finally {
      setLoading(false);
    }
  };

  const handleManageClick = () => {
    router.push(`/alliances/${id}`);
  };

  const isInviteOnly = joinMode === 'INVITE_ONLY';
  return (
    <GameCard title={name}>
      <Stack gap="md">
        <Box
          style={{
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid var(--ot-line)',
            height: 140,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background:
              'linear-gradient(180deg, var(--ot-surface-2) 0%, var(--ot-inset) 100%)',
          }}
        >
          {bannerimgsrc ? (
            <Box style={{ width: '100%', height: 140, overflow: 'hidden' }}>
              <Image
                src={splitAvatarFraming(bannerimgsrc).src}
                alt={name}
                fit="cover"
                h={140}
                style={avatarFramingStyle(
                  splitAvatarFraming(bannerimgsrc).framing ?? {
                    x: 50,
                    y: 50,
                    zoom: 1,
                  },
                )}
              />
            </Box>
          ) : (
            <Text size="xl" fw={700} c="dimmed" ta="center">
              {name}
            </Text>
          )}
        </Box>
        <Group justify="center" mt={-40}>
          <Avatar
            src={splitAvatarFraming(imgsrc).src}
            styles={{
              image: avatarFramingStyle(
                splitAvatarFraming(imgsrc).framing ?? { x: 50, y: 50, zoom: 1 },
              ),
            }}
            size={96}
            radius={96}
            style={{
              border: '2px solid var(--ot-line)',
              boxShadow: '0 6px 16px rgba(0,0,0,0.6)',
            }}
          />
        </Group>
        {(isLeader || roleName) && (
          <Group justify="center">
            <Badge
              color={isLeader ? 'yellow' : undefined}
              variant={isLeader ? 'filled' : 'light'}
            >
              {isLeader ? t('mine.leader') : t('mine.role', { role: roleName })}
            </Badge>
          </Group>
        )}
        <Text ta="center" fz="sm" c="dimmed">
          {description}
        </Text>
        <Group justify="space-between" className={panelClasses.insetRow}>
          {/* Treasury is only sent for the viewer's own alliances (ALL-08). */}
          {gold != null && (
            <div>
              <Text size="xs" c="dimmed" tt="uppercase">
                {t('browse.gold')}
              </Text>
              <Text fw={700}>{toLocale(gold, user?.locale)}</Text>
            </div>
          )}
          <div>
            <Text size="xs" c="dimmed" tt="uppercase">
              {t('browse.members')}
            </Text>
            <Text fw={700}>{toLocale(members, user?.locale)}</Text>
          </div>
        </Group>
        <Group gap="xs">
          {userMembership || isLeader ? (
            <Button
              fullWidth
              radius="sm"
              size="sm"
              variant="default"
              onClick={handleManageClick}
            >
              {t('browse.manage', 'View Dashboard')}
            </Button>
          ) : (
            <Button
              fullWidth
              radius="sm"
              size="sm"
              disabled={isInviteOnly}
              loading={loading}
              onClick={handleJoinClick}
            >
              {isInviteOnly
                ? t('browse.inviteOnly')
                : joinMode === 'REQUEST_TO_JOIN'
                  ? t('browse.requestToJoin')
                  : joinText || t('browse.join')}
            </Button>
          )}
        </Group>
      </Stack>
    </GameCard>
  );
};
