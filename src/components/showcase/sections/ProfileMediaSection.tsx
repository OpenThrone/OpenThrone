import {
  Avatar,
  Box,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import type { ComponentProps } from 'react';
import { useMemo } from 'react';

import ArtworkImage from '@/components/ArtworkImage';
import { FramedAvatar } from '@/components/FramedAvatar';
import FriendCard from '@/components/friendCard';
import OnlineIndicator from '@/components/player/OnlineIndicator';
import PlayerIdentityLine from '@/components/player/PlayerIdentityLine';
import YouBadge from '@/components/player/YouBadge';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { ProfilePortrait } from '@/components/profile/ProfilePortrait';
import PublicHero from '@/components/public/PublicHero';
import {
  mockAction,
  ShowcaseSection,
  Specimen,
} from '@/components/showcase/Showcase';
import UserModel from '@/models/Users';
import type { PlayerRace } from '@/types/typings';
import { getAssetPath, getAvatarSrc } from '@/utils/utilities';

type ProfileHeroProps = ComponentProps<typeof ProfileHero>;

const RACES: PlayerRace[] = ['ELF', 'HUMAN', 'GOBLIN', 'UNDEAD'];
const CLASSES = ['FIGHTER', 'CLERIC', 'THIEF', 'ASSASSIN'];

/**
 * Stand-in for a player-uploaded portrait (players without one get SHIELD).
 * Inline so the specimen needs no upload or network request.
 */
const SAMPLE_PORTRAIT =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMDAgMzAwIj48ZGVmcz48cmFkaWFsR3JhZGllbnQgaWQ9ImciIGN4PSI1MCUiIGN5PSIzNSUiIHI9IjcwJSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjM2EzZjRhIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMGIxMDE2Ii8+PC9yYWRpYWxHcmFkaWVudD48bGluZWFyR3JhZGllbnQgaWQ9ImgiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNlYWFlMmIiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM3YTUyMTIiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0idXJsKCNnKSIvPjxwYXRoIGQ9Ik0xNTAgNTJjLTQ2IDAtNzQgNDAtNzQgODYgMCAyMiA2IDQwIDE2IDU0bC0zNiAxMDhoMTg4bC0zNi0xMDhjMTAtMTQgMTYtMzIgMTYtNTQgMC00Ni0yOC04Ni03NC04NnoiIGZpbGw9InVybCgjaCkiIG9wYWNpdHk9Ii45Ii8+PGVsbGlwc2UgY3g9IjE1MCIgY3k9IjE1MCIgcng9IjM0IiByeT0iNDIiIGZpbGw9IiMwYjEwMTYiLz48Y2lyY2xlIGN4PSIxMzciIGN5PSIxNDYiIHI9IjQiIGZpbGw9IiNmZmU4N2EiLz48Y2lyY2xlIGN4PSIxNjMiIGN5PSIxNDYiIHI9IjQiIGZpbGw9IiNmZmU4N2EiLz48L3N2Zz4=';

const ONLINE_HERO: ProfileHeroProps = {
  name: 'Lady Morwen',
  race: 'ELF',
  playerClass: 'FIGHTER',
  avatar: SAMPLE_PORTRAIT,
  level: 34,
  rank: 12,
  isOnline: true,
  statusLabel: 'Online',
  lastActive: 'Now',
};

const OFFLINE_HERO: ProfileHeroProps = {
  name: 'Grukk the Vile',
  race: 'GOBLIN',
  playerClass: 'THIEF',
  avatar: 'SHIELD',
  level: 21,
  rank: 87,
  isOnline: false,
  statusLabel: 'Offline',
  lastActive: '3 days ago',
};

const ARTWORK: { label: string; src: string; width: number; height: number }[] =
  [
    { label: 'Crest', src: '/assets/shields/ELF.webp', width: 96, height: 96 },
    {
      label: 'Nav icon',
      src: '/assets/header/nav/battle.webp',
      width: 64,
      height: 64,
    },
    {
      label: 'Missing crest',
      src: '/assets/shields/missing/UNDEAD.webp',
      width: 96,
      height: 96,
    },
    {
      label: 'Missing nav icon',
      src: '/assets/header/nav/missing/battle.webp',
      width: 64,
      height: 64,
    },
  ];

const SCENES: { label: string; src: string }[] = [
  { label: 'Scene', src: '/assets/images/ui/public/throne-room.webp' },
  {
    label: 'Missing scene',
    src: '/assets/images/ui/public/missing-scene.webp',
  },
];

/** Client-only mock players for FriendCard; the card only links to profiles. */
function buildFriend(
  id: number,
  displayName: string,
  race: PlayerRace,
  isOnline: boolean,
  isPlayer = false,
): UserModel {
  const friend = new UserModel();
  friend.id = id;
  friend.displayName = displayName;
  friend.race = race;
  friend.class = 'FIGHTER';
  friend.colorScheme = race;
  friend.is_online = isOnline;
  friend.is_player = isPlayer;
  friend.avatar = getAvatarSrc('SHIELD', race, '150x150');
  return friend;
}

/** Player identity, portraits and artwork with fallbacks. */
export default function ProfileMediaSection() {
  const friends = useMemo(
    () => [
      buildFriend(1, 'Lady Morwen', 'ELF', true, true),
      buildFriend(2, 'Grukk the Vile', 'GOBLIN', false),
      buildFriend(3, 'Ser Aldric', 'HUMAN', true),
      buildFriend(4, 'The Pale Duke', 'UNDEAD', false),
    ],
    [],
  );

  return (
    <ShowcaseSection
      id="profile"
      title="Profile & artwork"
      description="Player identity banners, race-framed portraits and artwork with its local fallbacks."
    >
      <Specimen
        framed={false}
        name="ProfileHero (online)"
        usedOn={['/userprofile/[id]']}
        wide
      >
        <ProfileHero {...ONLINE_HERO} />
      </Specimen>

      <Specimen
        framed={false}
        name="ProfileHero (offline, crest)"
        usedOn={['/userprofile/[id]']}
        wide
      >
        <ProfileHero {...OFFLINE_HERO} />
      </Specimen>

      <Specimen
        name="ProfilePortrait"
        usedOn={['/home/profile', '/userprofile/[id]']}
        note="Top row: race crest (no avatar). Bottom row: stored portrait in each race frame."
        wide
      >
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
          {RACES.map((race) => (
            <Stack key={`crest-${race}`} gap={4} align="center">
              <ProfilePortrait
                race={race}
                avatar="SHIELD"
                style={{ width: 'min(200px, 100%)' }}
              />
              <Text size="xs" c="var(--ot-muted)">
                {race}
              </Text>
            </Stack>
          ))}
          {RACES.map((race) => (
            <ProfilePortrait
              key={`portrait-${race}`}
              race={race}
              avatar={SAMPLE_PORTRAIT}
              style={{ width: 'min(200px, 100%)' }}
            />
          ))}
        </SimpleGrid>
      </Specimen>

      <Specimen
        name="FramedAvatar"
        usedOn={['/battle/results/[id]', 'spy reports']}
      >
        <Group justify="center" gap="md">
          <FramedAvatar
            frameSrc={getAssetPath('avatarFrame', undefined, 'HUMAN')}
            src={getAvatarSrc('SHIELD', 'HUMAN', '150x150')}
            alt="Attacker avatar"
            size={180}
            insetX={30}
            insetY={44}
            objectFit="cover"
          />
          <FramedAvatar
            frameSrc={getAssetPath('avatarFrame', undefined, 'UNDEAD')}
            src={getAvatarSrc(SAMPLE_PORTRAIT, 'UNDEAD', '150x150')}
            alt="Defender avatar"
            size={180}
            insetX={30}
            insetY={44}
            objectFit="cover"
          />
        </Group>
      </Specimen>

      <Specimen
        name="ArtworkImage"
        usedOn={['all pages']}
        note="Missing paths fall back to a race or nav icon; with artwork disabled every item shows its fallback."
      >
        <Group gap="lg" align="flex-end">
          {ARTWORK.map(({ label, src, width, height }) => (
            <Stack key={label} gap={4} align="center">
              <ArtworkImage
                src={src}
                alt={label}
                width={width}
                height={height}
              />
              <Text size="xs" c="var(--ot-muted)">
                {label}
              </Text>
            </Stack>
          ))}
        </Group>
        <SimpleGrid cols={2} spacing="sm" mt="md">
          {SCENES.map(({ label, src }) => (
            <Stack key={label} gap={4}>
              <Box
                pos="relative"
                h={120}
                style={{ overflow: 'hidden', borderRadius: 4 }}
              >
                <ArtworkImage
                  src={src}
                  alt=""
                  fill
                  sizes="320px"
                  style={{ objectFit: 'cover' }}
                />
              </Box>
              <Text size="xs" c="var(--ot-muted)">
                {label}
              </Text>
            </Stack>
          ))}
        </SimpleGrid>
      </Specimen>

      <Specimen
        framed={false}
        name="PublicHero"
        usedOn={['/how-to-play', '/about', '/faq', '/']}
        wide
      >
        <PublicHero
          title="How to play"
          description="Build your kingdom, train your armies and claim the throne."
          imageSrc="/assets/images/ui/public/war-table.webp"
        >
          <Group gap="sm" mt="md">
            <Button onClick={mockAction('Start playing')}>Start playing</Button>
            <Button variant="outline" onClick={mockAction('Read the guide')}>
              Read the guide
            </Button>
          </Group>
        </PublicHero>
      </Specimen>

      <Specimen
        name="FriendCard"
        usedOn={['/userprofile/[id]']}
        note="Names link to the mock player's profile route."
      >
        <SimpleGrid cols={2} spacing="sm">
          {friends.map((friend) => (
            <FriendCard key={friend.id} player={friend} />
          ))}
        </SimpleGrid>
      </Specimen>

      <Specimen
        name="PlayerIdentityLine"
        usedOn={[
          '/social/friends',
          '/social/requests',
          '/social/enemies',
          '/userprofile/[id]',
        ]}
        note="Localised race and class; the race name takes that race's own colour whatever the viewer's theme."
      >
        <Stack gap={6}>
          {RACES.map((race, index) => (
            <PlayerIdentityLine
              key={race}
              race={race}
              playerClass={CLASSES[index % CLASSES.length]}
              size="sm"
            />
          ))}
        </Stack>
      </Specimen>

      <Specimen
        name="YouBadge"
        usedOn={['/social/friends', '/social/requests', '/userprofile/[id]']}
        note="Marks the signed-in player; tinted with the active race accent, so switch races to compare."
      >
        <Group gap="sm">
          <Group gap={5}>
            <Text fw={700} c="var(--ot-accent)">
              Lady Morwen
            </Text>
            <YouBadge />
          </Group>
          <Text fw={700} c="var(--ot-accent)">
            Ser Aldric
          </Text>
        </Group>
      </Specimen>

      <Specimen
        name="OnlineIndicator"
        usedOn={[
          '/social/friends',
          '/social/requests',
          '/social/enemies',
          '/userprofile/[id]',
        ]}
        note="Avatar dot with tooltip and screen-reader text, or a standalone dot with its label. Offline is muted, never red."
      >
        <Group gap="lg" align="center">
          {friends.slice(0, 2).map((friend) => (
            <OnlineIndicator key={friend.id} online={!!friend.is_online}>
              <Avatar src={friend.avatar} size={40} radius={40} />
            </OnlineIndicator>
          ))}
          <OnlineIndicator online withLabel />
          <OnlineIndicator online={false} withLabel />
        </Group>
      </Specimen>
    </ShowcaseSection>
  );
}
