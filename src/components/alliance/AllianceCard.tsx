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

import {
  type AllianceDuesTerms,
  AllianceJoinTerms,
  hasDues,
} from '@/components/alliance/AllianceMembershipDues';
import { ReservedBadge } from '@/components/alliance/ReservedAllianceNotice';
import { GameCard } from '@/components/game/GameCard';
import panelClasses from '@/components/game/Panels.module.css';
import { PremiumAllianceMark } from '@/components/player/SupporterBadge';
import type { Locales } from '@/types/typings';
import { avatarFramingStyle, splitAvatarFraming } from '@/utils/avatarFraming';
import { formatWhole } from '@/utils/formatWhole';

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
  isPremium?: boolean;
  premiumUntil?: string | null;
  /** ACTIVE or RESERVED (#13): a reserved alliance takes no new members. */
  status?: string;
  /** Join fee and dues, shown to players outside the alliance. */
  joinTerms?: AllianceDuesTerms;
  /** Most members the alliance's hall level allows, shown as members / cap. */
  memberCap?: number;
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
  isPremium,
  premiumUntil,
  status,
  joinTerms,
  memberCap,
}: AllianceCardProps) => {
  const { t, i18n } = useTranslation('alliances');
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

  const isReserved = status === 'RESERVED';
  const isInviteOnly = joinMode === 'INVITE_ONLY';
  return (
    <GameCard
      title={name}
      action={
        isPremium ||
        (premiumUntil && new Date(premiumUntil).getTime() > Date.now()) ? (
          <PremiumAllianceMark />
        ) : undefined
      }
    >
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
        {(isLeader || roleName || isReserved) && (
          <Group justify="center">
            {isReserved && <ReservedBadge />}
            {(isLeader || roleName) && (
              <Badge
                color={isLeader ? 'yellow' : undefined}
                variant={isLeader ? 'filled' : 'light'}
              >
                {isLeader
                  ? t('mine.leader')
                  : t('mine.role', { role: roleName })}
              </Badge>
            )}
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
              <Text fw={700}>
                {formatWhole(gold, i18n.language as Locales)}
              </Text>
            </div>
          )}
          <div>
            <Text size="xs" c="dimmed" tt="uppercase">
              {t('browse.members')}
            </Text>
            <Text fw={700}>
              {memberCap
                ? t('upgrades.ofCap', {
                    value: formatWhole(members, i18n.language as Locales),
                    cap: formatWhole(memberCap, i18n.language as Locales),
                  })
                : formatWhole(members, i18n.language as Locales)}
            </Text>
          </div>
        </Group>
        {!!memberCap &&
          members >= memberCap &&
          !userMembership &&
          !isLeader && (
            <Text size="xs" c="var(--ot-muted)">
              {t(
                'overview.fullHint',
                'The alliance is full: nobody can join until the Alliance Hall is upgraded.',
              )}
            </Text>
          )}
        {joinTerms &&
          !userMembership &&
          !isLeader &&
          (joinTerms.joinFee > 0n || hasDues(joinTerms)) && (
            <AllianceJoinTerms terms={joinTerms} size="xs" />
          )}
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
              disabled={isInviteOnly || isReserved}
              loading={loading}
              onClick={handleJoinClick}
            >
              {isReserved
                ? t('reserved.notRecruiting')
                : isInviteOnly
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
