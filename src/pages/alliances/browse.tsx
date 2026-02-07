import {
  Avatar,
  Box,
  Button,
  Group,
  Image,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';
import toLocale from '@/utils/numberFormatting';

export const UserCardImage = ({
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
}) => {
  const { t } = useTranslation('alliances');
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const handleJoinClick = async () => {
    setLoading(true);
    await onJoin(id);
    setLoading(false);
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
            border: '1px solid #2f3e52',
          }}
        >
          <Image src={bannerimgsrc} alt={name} fit="cover" h={140} />
        </Box>
        <Group justify="center" mt={-40}>
          <Avatar
            src={imgsrc}
            size={96}
            radius={96}
            style={{
              border: '2px solid #1f2b3b',
              boxShadow: '0 6px 16px rgba(0,0,0,0.6)',
            }}
          />
        </Group>
        <Text ta="center" fz="sm" c="dimmed">
          {description}
        </Text>
        <Group
          justify="space-between"
          style={{
            backgroundColor: '#0f141a',
            borderRadius: '6px',
            border: '1px solid #1f2b3b',
            boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
            padding: '12px',
          }}
        >
          <div>
            <Text size="xs" c="dimmed" tt="uppercase">
              {t('browse.gold')}
            </Text>
            <Text fw={700}>{toLocale(gold)}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed" tt="uppercase">
              {t('browse.members')}
            </Text>
            <Text fw={700}>{toLocale(members)}</Text>
          </div>
        </Group>
        <Group gap="xs">
          {userMembership || isLeader ? (
            <Button
              fullWidth
              radius="sm"
              size="sm"
              color="blue"
              onClick={handleManageClick}
            >
              {t('browse.manage', 'View Dashboard')}
            </Button>
          ) : (
            <Button
              fullWidth
              radius="sm"
              size="sm"
              color="yellow"
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

const Browse = () => {
  const [alliances, setAlliances] = useState([]);
  const { t } = useTranslation('alliances');
  const { user, forceUpdate } = useUser();

  const handleJoin = async (allianceId: number) => {
    try {
      const response = await fetch('/api/alliances/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allianceId }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to join alliance');
      }

      alertService.success(data.message || t('browse.joinSuccess'));
      forceUpdate(); // Update user context to reflect membership
    } catch (error: any) {
      logError('Error joining alliance:', error);
      alertService.error(error.message);
    }
  };

  useEffect(() => {
    const fetchAlliances = async () => {
      try {
        const response = await fetch('/api/alliances/getAll');
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        setAlliances(data);
      } catch (error) {
        logError(t('browse.errorFetching'), error);
      }
    };

    fetchAlliances();
  }, []);

  return (
    <MainArea title={t('browse.title')}>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 3 }}>
        {alliances.map((alliance) => {
          const userMembership = user?.alliance_memberships?.find(
            (m) => m.alliance_id === alliance.id,
          );
          const isLeader = user?.ledAlliances?.some(
            (a) => a.id === alliance.id,
          );

          console.log('Browse debug:', {
            allianceId: alliance.id,
            userId: user?.id,
            memberships: user?.alliance_memberships,
            ledAlliances: user?.ledAlliances,
            userMembership,
            isLeader,
          });

          return (
            <UserCardImage
              key={alliance.id}
              name={alliance.name}
              description={alliance.motto}
              members={alliance._count.members}
              gold={
                alliance.gold_in_bank
                  ? alliance.gold_in_bank.toString().replace('n', '')
                  : 0
              }
              joinText={t('browse.join')}
              imgsrc={alliance.avatar || '/path/to/default/avatar.png'}
              bannerimgsrc={alliance.bannerimg || '/path/to/default/banner.png'}
              joinMode={alliance.join_mode}
              id={alliance.id}
              onJoin={handleJoin}
              // Check if user is member/leader
              userMembership={userMembership}
              isLeader={isLeader}
            />
          );
        })}
      </SimpleGrid>
    </MainArea>
  );
};

export default Browse;
