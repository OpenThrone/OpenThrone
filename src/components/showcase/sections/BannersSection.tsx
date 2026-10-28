import { Button, Group, SegmentedControl, Stack, Text } from '@mantine/core';
import type { ComponentProps } from 'react';
import { useState } from 'react';

import AnnouncementPager from '@/components/AnnouncementPager';
import { BattleResultBanner } from '@/components/BattleResultBanner';
import { DefenseAdvisory } from '@/components/DefenseAdvisory';
import GameHeader from '@/components/GameHeader';
import type { NewsBulletinSeverity } from '@/components/news-bulletin';
import {
  mockAction,
  ShowcaseSection,
  Specimen,
} from '@/components/showcase/Showcase';
import type { DefenseAdvisoryFacts } from '@/utils/defenseAdvisory';
import { FORT_DAMAGE_TIERS, type FortDamageTier } from '@/utils/fortDamage';

type BannerTone = ComponentProps<typeof BattleResultBanner>['tone'];

const BULLETINS: {
  severity: NewsBulletinSeverity;
  title: string;
  body: string;
  linkUrl?: string;
}[] = [
  {
    severity: 'INFO',
    title: 'A new era dawns',
    body: 'Era 7 begins at midnight UTC. Prepare your kingdom.',
    linkUrl: '/news',
  },
  {
    severity: 'SUCCESS',
    title: 'Maintenance complete',
    body: 'The realm is open again. Thank you for your patience.',
  },
  {
    severity: 'WARNING',
    title: 'Turns are delayed',
    body: 'Turn processing is running a few minutes late tonight.',
  },
  {
    severity: 'CRITICAL',
    title: 'Attacks paused',
    body: 'Attacking is disabled while we investigate a battle bug.',
  },
];

const RESULT_BANNERS: { tone: BannerTone; title: string; subtitle: string }[] =
  [
    {
      tone: 'green',
      title: 'Victory',
      subtitle: 'Your forces breached the walls of Thornwall',
    },
    {
      tone: 'red',
      title: 'Defeat',
      subtitle: 'Grukk the Vile repelled your assault',
    },
    {
      tone: 'blue',
      title: 'Intel gathered',
      subtitle: 'Your spies returned with a full report',
    },
    {
      tone: 'gray',
      title: 'Stalemate',
      subtitle: 'Neither army gained ground',
    },
  ];

const DAMAGE_LABELS: Record<FortDamageTier, string> = {
  0: 'Intact (75%+)',
  1: 'Cracked (50–74%)',
  2: 'Breached (25–49%)',
  3: 'Ruined (<25%)',
};

const advisoryStats = (facts: DefenseAdvisoryFacts) => ({
  defense_advisory: facts,
});

const ADVISORIES: { label: string; stats: ReturnType<typeof advisoryStats> }[] =
  [
    {
      label: 'Civilians and offense lost',
      stats: advisoryStats({
        fortBreached: true,
        civilianLosses: 140,
        offensiveLosses: 52,
      }),
    },
    {
      label: 'Civilians lost',
      stats: advisoryStats({
        fortBreached: true,
        civilianLosses: 140,
        offensiveLosses: 0,
      }),
    },
    {
      label: 'Offense lost',
      stats: advisoryStats({
        fortBreached: true,
        civilianLosses: 0,
        offensiveLosses: 52,
      }),
    },
  ];

/** Announcements, battle result banners and defender advice. */
export default function BannersSection() {
  const [dismissed, setDismissed] = useState<NewsBulletinSeverity[]>([]);
  const [damage, setDamage] = useState<FortDamageTier>(0);

  return (
    <ShowcaseSection
      id="banners"
      title="Banners & notices"
      description="Site announcements, battle outcome banners and post-battle advice."
    >
      <Specimen
        framed={false}
        name="GameHeader (fort damage)"
        usedOn={['Layout (all pages)']}
        note="Animated race wall: a frame-1 still, then a seamless 8 s loop (AV1, H.264 fallback) that fades in once playing. The wall shows the signed-in player's fort health in four tiers; tiers 1 to 3 add a CSS fire glow, and 2 to 3 add rising embers. Reduced motion and Save-Data keep the still, and the glow stays static."
        wide
      >
        <Stack gap="sm">
          <SegmentedControl
            size="xs"
            aria-label="Fort damage"
            value={String(damage)}
            onChange={(value) => setDamage(Number(value) as FortDamageTier)}
            data={FORT_DAMAGE_TIERS.map((tier) => ({
              label: DAMAGE_LABELS[tier],
              value: String(tier),
            }))}
          />
          <GameHeader damageTier={damage} />
        </Stack>
      </Specimen>
      <Specimen
        framed={false}
        name="NewsBulletin"
        usedOn={['MainArea (all game pages)']}
        note="Compact announcements with internal navigation, severity tooltips and dismissed notice recovery."
        wide
      >
        <Stack gap="md">
          <AnnouncementPager
            announcements={BULLETINS.map((bulletin) => ({
              ...bulletin,
              id: BULLETINS.indexOf(bulletin),
            }))}
            dismissed={
              new Set(
                dismissed.map((severity) =>
                  BULLETINS.findIndex((b) => b.severity === severity),
                ),
              )
            }
            onRestore={(id) =>
              setDismissed((current) =>
                current.filter(
                  (severity) => severity !== BULLETINS[id].severity,
                ),
              )
            }
            onDismiss={(id) =>
              setDismissed((current) => [...current, BULLETINS[id].severity])
            }
          />
          {dismissed.length > 0 && (
            <Group>
              <Button
                size="xs"
                variant="subtle"
                onClick={() => setDismissed([])}
              >
                Restore dismissed bulletins
              </Button>
            </Group>
          )}
        </Stack>
      </Specimen>

      {RESULT_BANNERS.map(({ tone, title, subtitle }) => (
        <Specimen
          framed={false}
          key={tone}
          name={`BattleResultBanner (${tone})`}
          usedOn={['/battle/results/[id]', 'spy reports']}
          wide
        >
          <BattleResultBanner tone={tone} title={title} subtitle={subtitle}>
            {tone === 'green' && (
              <Button
                mt="sm"
                size="xs"
                variant="light"
                onClick={mockAction('Share report')}
              >
                Share report
              </Button>
            )}
          </BattleResultBanner>
        </Specimen>
      ))}

      {ADVISORIES.map(({ label, stats }) => (
        <Specimen
          key={label}
          name={`DefenseAdvisory (${label})`}
          usedOn={['/battle/results/[id]', '/battle/history']}
          note="Defender view after a breach; buttons are plain links to game pages."
        >
          <DefenseAdvisory stats={stats} isViewerDefender />
        </Specimen>
      ))}

      <Specimen
        name="EraResetNotice"
        usedOn={['Layout (all pages)']}
        note="Skipped: it fetches the era reset schedule on mount, so it cannot render from mock data."
      >
        <Text size="sm" c="var(--ot-muted)">
          Not rendered here.
        </Text>
      </Specimen>
    </ShowcaseSection>
  );
}
