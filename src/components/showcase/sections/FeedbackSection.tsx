import { faScroll, faUserGroup } from '@fortawesome/free-solid-svg-icons';
import {
  Alert,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Progress,
  RingProgress,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import { type ReactNode, useState } from 'react';

import { EmptyState } from '@/components/game/EmptyState';
import { GameCard } from '@/components/game/GameCard';
import { PageLoading } from '@/components/game/PageLoading';
import LoadingDots from '@/components/loading-dots';
import MainAreaSkeleton from '@/components/MainAreaSkeleton';
import NavSkeleton from '@/components/NavSkeleton';
import SidebarSkeleton from '@/components/SidebarSkeleton';
import { alertService } from '@/services/Alert.service';

import { mockAction, ShowcaseSection, Specimen } from '../Showcase';

const ALERT_SAMPLES = [
  {
    color: 'green',
    title: 'Training complete',
    body: '120 offense soldiers joined your army.',
  },
  {
    color: 'red',
    title: 'Attack failed',
    body: 'Your forces were repelled at the gates.',
  },
  {
    color: 'yellow',
    title: 'Era reset scheduled',
    body: 'All kingdoms reset when the era closes.',
  },
  {
    color: 'blue',
    title: 'Advisor note',
    body: 'Deposit gold in the bank to keep it safe.',
  },
] as const;

/** Bounded frame so full-page skeletons stay inside their specimen. */
function SkeletonFrame({
  label,
  height,
  children,
}: {
  label: string;
  height: number;
  children: ReactNode;
}) {
  return (
    <Stack gap={4}>
      <Text size="xs" c="var(--ot-muted)">
        {label}
      </Text>
      <Box
        h={height}
        style={{
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid var(--ot-line)',
          borderRadius: 'var(--mantine-radius-sm)',
          background: 'var(--ot-inset)',
        }}
      >
        {children}
      </Box>
    </Stack>
  );
}

/** Notifications, alerts, loaders, skeletons and empty states. */
export default function FeedbackSection() {
  const [progress, setProgress] = useState(65);

  return (
    <ShowcaseSection
      id="feedback"
      title="Loading & feedback"
      description="How the game tells players something happened, is happening, or has nothing to show."
    >
      <Specimen
        name="Toasts"
        usedOn={['global', '/home/admin', '/report']}
        note="The one toast path: every alertService call renders here, bottom right, with token colours and a Mantine close button. Loading stays until resolved or cleared. Motion is off under reduced motion."
      >
        <Group gap="xs">
          <Button
            size="xs"
            color="green"
            variant="light"
            onClick={() => alertService.success('Upgrade purchased.')}
          >
            Success
          </Button>
          <Button
            size="xs"
            color="red"
            variant="light"
            onClick={() => alertService.error('Not enough gold.')}
          >
            Error
          </Button>
          <Button
            size="xs"
            color="blue"
            variant="light"
            onClick={() => alertService.info('A new era begins tomorrow.')}
          >
            Info
          </Button>
          <Button
            size="xs"
            color="yellow"
            variant="light"
            onClick={() => alertService.warn('Your protection ends soon.')}
          >
            Warn
          </Button>
          <Button
            size="xs"
            variant="light"
            onClick={() =>
              alertService.notify('success', 'Announcement saved.', {
                title: 'Created',
              })
            }
          >
            With title
          </Button>
          <Button
            size="xs"
            variant="default"
            onClick={() => alertService.loading('Marching to battle...')}
          >
            Loading
          </Button>
          <Button
            size="xs"
            variant="subtle"
            onClick={() =>
              alertService.updateLoading('success', 'The battle is won.')
            }
          >
            Resolve loading
          </Button>
          <Button
            size="xs"
            variant="subtle"
            onClick={() => alertService.clear()}
          >
            Clear
          </Button>
        </Group>
      </Specimen>

      <Specimen name="Alerts" usedOn={['/battle/results', 'header']}>
        <Stack gap="sm">
          {ALERT_SAMPLES.map((sample) => (
            <Alert key={sample.color} color={sample.color} title={sample.title}>
              <Text size="sm">{sample.body}</Text>
            </Alert>
          ))}
          <Alert
            title="Defense advisory"
            styles={{
              root: {
                background: 'var(--ot-panel)',
                border: '1px solid var(--ot-accent)',
              },
              title: { color: 'var(--ot-heading)' },
              message: { color: 'var(--ot-body)' },
            }}
          >
            <Text size="sm">Your fortification is damaged.</Text>
            <Button
              size="xs"
              mt="sm"
              onClick={mockAction('Repair fortification')}
            >
              Repair
            </Button>
          </Alert>
        </Stack>
      </Specimen>

      <Specimen name="Loaders and progress" usedOn={['sidebar', 'forms']}>
        <Stack gap="md">
          <Group gap="lg" align="center">
            <LoadingDots color="var(--ot-accent)" />
            <Loader size="sm" />
            <Loader size="sm" type="dots" />
            <Loader size="sm" type="bars" />
          </Group>
          <Stack gap={4}>
            <Text size="xs" c="var(--ot-muted)">
              Protection progress (sidebar)
            </Text>
            <Progress
              size="sm"
              color={progress >= 80 ? 'orange' : 'teal'}
              value={progress}
              aria-label={`Protection ${progress}%`}
            />
          </Stack>
          <Group gap="md" align="center">
            <RingProgress
              size={110}
              thickness={8}
              roundCaps
              sections={[{ value: progress, color: 'var(--ot-accent)' }]}
              rootColor="var(--ot-line)"
              label={
                <Center>
                  <Stack gap={0} align="center">
                    <Text size="xs" fw={700} tt="uppercase" c="var(--ot-muted)">
                      Turns
                    </Text>
                    <Text
                      size="lg"
                      fw={900}
                      c="var(--ot-text)"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {progress * 20}
                    </Text>
                  </Stack>
                </Center>
              }
            />
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                setProgress((value) => (value >= 100 ? 5 : value + 15))
              }
            >
              Advance
            </Button>
          </Group>
          <Stack gap={6}>
            <Skeleton height={12} radius="xl" />
            <Skeleton height={12} radius="xl" width="80%" />
            <Skeleton height={12} radius="xl" width="55%" />
          </Stack>
        </Stack>
      </Specimen>

      <Specimen
        framed={false}
        name="Page skeletons"
        usedOn={['_app', 'Layout']}
        note="Shown while the session and layout load. Rendered inside bounded frames here."
        wide
      >
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
          <SkeletonFrame label="NavSkeleton" height={140}>
            <NavSkeleton />
          </SkeletonFrame>
          <SkeletonFrame label="SidebarSkeleton" height={320}>
            <SidebarSkeleton />
          </SkeletonFrame>
          <SkeletonFrame label="MainAreaSkeleton" height={320}>
            <MainAreaSkeleton />
          </SkeletonFrame>
        </SimpleGrid>
      </Specimen>

      <Specimen
        framed={false}
        name="PageLoading"
        usedOn={[
          '/structures/armory',
          '/structures/bank',
          '/home/overview',
          '/social/friends',
          '/alliances',
        ]}
        note="Skeleton-first placeholder with a screen-reader label (role=status). Optional stat row and GameCard frame. Shimmer stops under reduced motion."
        wide
      >
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <SkeletonFrame label="Page (stats={4})" height={300}>
            <Box p="sm">
              <PageLoading stats={4} />
            </Box>
          </SkeletonFrame>
          <SkeletonFrame label="Card (cardTitle, block={false})" height={300}>
            <Box p="sm">
              <PageLoading cardTitle="Friends List" block={false} />
            </Box>
          </SkeletonFrame>
        </SimpleGrid>
      </Specimen>

      <Specimen
        framed={false}
        name="Empty states"
        usedOn={[
          '/structures/bank',
          '/social/friends',
          '/social/requests',
          '/userprofile',
        ]}
        note="EmptyState replaces empty tables and bare text. Use compact inside cards and table panels."
        wide
      >
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
          <GameCard title="Friends List">
            <EmptyState icon={faUserGroup} title="You have no friends yet." />
          </GameCard>
          <GameCard title="Recent Transactions">
            <EmptyState compact title="No Records Found" />
          </GameCard>
          <GameCard title="Shared reports">
            <EmptyState
              icon={faScroll}
              title="No reports have been shared yet."
              description="Share a battle or spy report so your alliance can plan."
              action={
                <Button
                  size="xs"
                  variant="outline"
                  onClick={mockAction('Share report')}
                >
                  Share a report
                </Button>
              }
            />
          </GameCard>
        </SimpleGrid>
      </Specimen>
    </ShowcaseSection>
  );
}
