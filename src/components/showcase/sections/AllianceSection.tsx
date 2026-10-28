import { Button, Stack, Table, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { MouseEvent, ReactNode } from 'react';

import { AllianceArtworkEditor } from '@/components/alliance/AllianceArtworkEditor';
import { AllianceCard } from '@/components/alliance/AllianceCard';
import { transactionTypeLabel } from '@/components/alliance/allianceLabels';
import { AllianceMembers } from '@/components/alliance/AllianceMembers';
import { AllianceOverview } from '@/components/alliance/AllianceOverview';
import { AllianceRanks } from '@/components/alliance/AllianceRanks';
import { GameCard } from '@/components/game/GameCard';
import { StyledTable } from '@/components/game/StyledTable';
import {
  mockAction,
  ShowcaseSection,
  Specimen,
} from '@/components/showcase/Showcase';
import { ALLIANCE_PERMISSION_KEYS } from '@/constants/alliancePermissions';
import type {
  AllianceInfo,
  AllianceMember,
  AllianceRole,
} from '@/services/Alliance.service';
import { getPureCrest, resolveArtworkSource } from '@/utils/artwork';

const ALLIANCE_ID = 7;
const LEADER_ID = 101;
const PAGE = '/alliances/[id]';
const FOUNDED = new Date('2026-08-02T12:00:00.000Z');
const NOW = new Date('2026-10-20T12:00:00.000Z');

const allPermissions = Object.fromEntries(
  ALLIANCE_PERMISSION_KEYS.map((key) => [key, true]),
);

const ROLES: AllianceRole[] = [
  { name: 'Leader', rank_order: 0, permissions: allPermissions },
  {
    name: 'Officer',
    rank_order: 1,
    permissions: {
      invite_member: true,
      grant_access: true,
      kick_member: true,
      declare_war: true,
      manage_bank: true,
      post_announcements: true,
      share_reports: true,
      call_targets: true,
      view_list: true,
    },
  },
  {
    name: 'Veteran',
    rank_order: 2,
    permissions: { request_gold: true, share_reports: true, view_list: true },
  },
  { name: 'Member', rank_order: 3, permissions: { view_list: true } },
].map((role, index) => ({
  ...role,
  id: 70 + index,
  alliance_id: ALLIANCE_ID,
  created_at: FOUNDED,
  updated_at: FOUNDED,
}));

const roleNamed = (name: string) => {
  const role = ROLES.find((r) => r.name === name) ?? ROLES[ROLES.length - 1];
  return {
    id: role.id,
    name: role.name,
    permissions: role.permissions,
    rank_order: role.rank_order,
  };
};

const MEMBERS: AllianceMember[] = [
  [LEADER_ID, 'Lady Morwen', 'ELF', 'FIGHTER', 'Leader', 0],
  [303, 'Thalia Dawnspear', 'HUMAN', 'CLERIC', 'Officer', 2],
  [404, 'Brannoc Ironhand', 'HUMAN', 'FIGHTER', 'Veteran', 26],
  [405, 'Ysolde of the Mire', 'UNDEAD', 'ASSASSIN', 'Member', 72],
  [406, 'Skrit', 'GOBLIN', 'THIEF', 'Member', null],
].map(([userId, name, race, playerClass, roleName, hoursAgo], index) => {
  const role = roleNamed(roleName as string);
  return {
    id: 500 + index,
    alliance_id: ALLIANCE_ID,
    user_id: userId as number,
    role_id: role.id,
    created_at: FOUNDED,
    updated_at: FOUNDED,
    user: {
      id: userId as number,
      display_name: name as string,
      race: race as string,
      class: playerClass as string,
      avatar: 'SHIELD',
      last_active:
        hoursAgo === null
          ? null
          : new Date(NOW.getTime() - (hoursAgo as number) * 3_600_000),
    },
    role,
  };
});

/** The alliance as a member (here the leader) receives it from the API. */
const ALLIANCE: AllianceInfo = {
  id: ALLIANCE_ID,
  name: 'Silver Court',
  leader_id: LEADER_ID,
  motto: 'By leaf and blade',
  comments:
    'An elven court sworn to hold the river road.\nWe raid at turn change and share every intel report.\nApply with your level and class.',
  is_public: true,
  require_auth: true,
  closed_enrollment: false,
  roster_visibility: 'PUBLIC',
  gold_in_bank: '18450000',
  created_at: FOUNDED,
  updated_at: NOW,
  slug: 'silver-court',
  leader: { display_name: 'Lady Morwen' },
  _count: { members: MEMBERS.length },
  members: MEMBERS,
  alliance_roles: ROLES,
};

/** Treasury ledger rows as `/api/alliances/bank/history` returns them. */
const LEDGER = [
  [9001, 2, 'Thalia Dawnspear', 'DEPOSIT', 2_500_000],
  [9002, 9, 'Lady Morwen', 'TRANSFER', 1_200_000],
  [9003, 30, 'Brannoc Ironhand', 'LOAN_REPAYMENT', 640_000],
  [9004, 51, 'Lady Morwen', 'WITHDRAWAL', 300_000],
].map(([id, hoursAgo, name, type, amount]) => ({
  id: id as number,
  created_at: new Date(NOW.getTime() - (hoursAgo as number) * 3_600_000),
  performed_by_user: { display_name: name as string },
  transaction_type: type as string,
  amount: amount as number,
}));

/** Active conflicts as `/api/alliances/wars` returns them. */
const WARS = [
  {
    id: 41,
    attacker: 'Silver Court',
    defender: 'Ashen Pact',
    status: 'ACTIVE',
  },
  {
    id: 42,
    attacker: 'Mire Lords',
    defender: 'Silver Court',
    status: 'WARMUP',
  },
];

/** What a non-member receives when the roster is members-only (ALL-08). */
const HIDDEN_ROSTER: AllianceInfo = {
  ...ALLIANCE,
  roster_visibility: 'MEMBERS_ONLY',
  gold_in_bank: undefined,
  members: undefined,
  alliance_roles: undefined,
};

/**
 * The panels POST to alliance routes from their confirm, save and rank-select
 * controls; swap exactly those clicks for mock actions.
 */
function MockRequests({
  labels,
  options = false,
  children,
}: {
  labels: string[];
  /** Also mock picking a dropdown option (the rank select in its dialog). */
  options?: boolean;
  children: ReactNode;
}) {
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const option = options ? target.closest('[role="option"]') : null;
    const label = option
      ? `Change rank to ${option.textContent?.trim()}`
      : target.closest('button')?.textContent?.trim();
    if (!label || (!option && !labels.includes(label))) return;
    event.preventDefault();
    event.stopPropagation();
    mockAction(label)();
  };
  return <div onClickCapture={onClickCapture}>{children}</div>;
}

const LIVE_ONLY_PANELS = [
  'AllianceAnnouncements and the latest-announcement card on Overview',
  'AllianceBank',
  'AllianceWar',
  'AllianceLists',
  'AllianceDiplomacy',
  'AllianceIntel',
  'AllianceInternalBattles',
  'AllianceSettings and AllianceInvites',
];

export default function AllianceSection() {
  const { t } = useTranslation('alliances');
  const memberLabels = [
    t('index.kickMember', 'Kick Member'),
    t('manage.makeLeader', 'Make leader'),
  ];
  const rankLabels = [
    t('ranks.add', 'Add rank'),
    t('settings.save', 'Save Changes'),
    t('ranks.delete', 'Delete rank'),
  ];
  const onUpdate = mockAction('Refresh alliance');
  const declareWar = t('war.declareWar', 'Declare War');
  const endWar = t('war.end', 'End war');

  return (
    <ShowcaseSection
      id="alliance"
      title="Alliances"
      description="The alliance page panels that render from the AllianceInfo the page already holds, fed with a mock alliance viewed by its leader."
    >
      <Specimen
        framed={false}
        name="Alliance directory card"
        usedOn={['/alliances', '/alliances/browse']}
        note="Shared artwork, stats and membership treatment across both directories."
      >
        <AllianceCard
          id={ALLIANCE_ID}
          name="The Silver Court"
          members={5}
          description="Strength through unity"
          gold="125000"
          imgsrc={getPureCrest('ELF')}
          bannerimgsrc={resolveArtworkSource(
            '/assets/images/ui/public/war-table.webp',
          )}
          isLeader
          userMembership
          onJoin={async () => {}}
        />
      </Specimen>
      <Specimen
        framed={false}
        name="Alliance artwork"
        usedOn={[PAGE]}
        wide
        note="Photo and banner crop, drag positioning, zoom, replacement and removal. Crop edits remain local until Save; the guide uses mock saves."
      >
        <AllianceArtworkEditor
          avatar={getPureCrest('ELF')}
          bannerimg={
            resolveArtworkSource('/assets/images/ui/public/war-table.webp') ??
            undefined
          }
          onSave={async () => {
            mockAction('Save alliance artwork')();
          }}
        />
      </Specimen>
      <Specimen
        framed={false}
        name="AllianceOverview"
        usedOn={[PAGE]}
        note="Rendered without onViewAnnouncements: the latest-announcement card above About Us fetches and is live-only. The treasury row is member-only data."
        wide
      >
        <AllianceOverview alliance={ALLIANCE} />
      </Specimen>

      <Specimen
        framed={false}
        name="AllianceMembers: leader view"
        usedOn={[PAGE]}
        note="Row menus open the real rank, leadership and kick dialogs; confirming is mocked."
        wide
      >
        <MockRequests labels={memberLabels} options>
          <AllianceMembers
            alliance={ALLIANCE}
            viewerId={LEADER_ID}
            onUpdate={onUpdate}
          />
        </MockRequests>
      </Specimen>

      <Specimen
        framed={false}
        name="AllianceMembers: hidden roster"
        usedOn={[PAGE]}
        note="A non-member viewing a members-only roster."
      >
        <AllianceMembers alliance={HIDDEN_ROSTER} viewerId={null} />
      </Specimen>

      <Specimen
        name="Live-only panels"
        usedOn={[PAGE]}
        note="These fetch their own data on mount, so they are shown only on the real page."
      >
        <Stack gap={4}>
          {LIVE_ONLY_PANELS.map((panel) => (
            <Text key={panel} size="sm" c="var(--ot-muted)">
              {panel}
            </Text>
          ))}
        </Stack>
      </Specimen>

      <Specimen
        framed={false}
        name="Alliance tab panel: treasury ledger"
        usedOn={[`${PAGE} (Bank tab)`, 'AllianceBank', 'LoanSection']}
        note="The shape every alliance tab panel takes: one GameCard with its h2 title, a StyledTable ledger that scrolls inside its own labelled region on narrow screens. Mock rows; the real panel fetches its history."
        wide
      >
        <GameCard title={t('bank.historyTitle', 'Transaction History')}>
          <StyledTable
            ariaLabel={t('bank.historyTitle', 'Transaction History')}
            headers={[
              t('bank.date', 'Date'),
              t('bank.user', 'User'),
              t('bank.type', 'Type'),
              t('bank.amount', 'Amount'),
            ]}
          >
            {LEDGER.map((entry) => (
              <Table.Tr key={entry.id}>
                <Table.Td>{entry.created_at.toLocaleString()}</Table.Td>
                <Table.Td>{entry.performed_by_user.display_name}</Table.Td>
                <Table.Td>
                  <Text
                    c={
                      ['DEPOSIT', 'LOAN_REPAYMENT'].includes(
                        entry.transaction_type,
                      )
                        ? 'green'
                        : 'red'
                    }
                    fw={500}
                  >
                    {transactionTypeLabel(t, entry.transaction_type)}
                  </Text>
                </Table.Td>
                <Table.Td>{entry.amount.toLocaleString()}</Table.Td>
              </Table.Tr>
            ))}
          </StyledTable>
        </GameCard>
      </Specimen>

      <Specimen
        framed={false}
        name="Alliance tab panel: header action"
        usedOn={[`${PAGE} (War Room tab)`, 'AllianceWar']}
        note="Panel buttons sit in the GameCard action slot, beside the title. Declaring and ending wars are mocked."
        wide
      >
        <GameCard
          title={t('war.activeWars', 'Active Conflicts')}
          action={
            <Button color="red" onClick={mockAction(declareWar)}>
              {declareWar}
            </Button>
          }
        >
          <StyledTable
            ariaLabel={t('war.activeWars', 'Active Conflicts')}
            tableProps={{ striped: true, highlightOnHover: true }}
            headers={[
              t('war.attacker', 'Attacker'),
              t('war.defender', 'Defender'),
              t('war.status', 'Status'),
              <Table.Th key="actions" />,
            ]}
          >
            {WARS.map((war) => (
              <Table.Tr key={war.id}>
                <Table.Td>{war.attacker}</Table.Td>
                <Table.Td>{war.defender}</Table.Td>
                <Table.Td>
                  <Text c={war.status === 'ACTIVE' ? 'red' : 'orange'} fw={700}>
                    {t(`war.statuses.${war.status}`, {
                      defaultValue: war.status,
                    })}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Button
                    size="compact-xs"
                    variant="default"
                    onClick={mockAction(`${endWar} #${war.id}`)}
                  >
                    {endWar}
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </StyledTable>
        </GameCard>
      </Specimen>

      <Specimen
        framed={false}
        name="AllianceRanks"
        usedOn={[PAGE]}
        note="Reorder, rename and toggle permissions locally; add, save and delete are mocked."
        wide
      >
        <MockRequests labels={rankLabels}>
          <AllianceRanks
            alliance={ALLIANCE}
            viewerId={LEADER_ID}
            onUpdate={onUpdate}
          />
        </MockRequests>
      </Specimen>
    </ShowcaseSection>
  );
}
