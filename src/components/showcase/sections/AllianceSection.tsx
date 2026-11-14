import { Button, Stack, Table, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { MouseEvent, ReactNode } from 'react';

import { AllianceArtworkEditor } from '@/components/alliance/AllianceArtworkEditor';
import { AllianceCard } from '@/components/alliance/AllianceCard';
import { transactionTypeLabel } from '@/components/alliance/allianceLabels';
import { AllianceMembers } from '@/components/alliance/AllianceMembers';
import {
  AllianceDuesCard,
  AllianceDuesSettingsCard,
  type AllianceDuesStatusView,
  duesTermsOf,
} from '@/components/alliance/AllianceMembershipDues';
import { AllianceOverview } from '@/components/alliance/AllianceOverview';
import { AllianceRanks } from '@/components/alliance/AllianceRanks';
import {
  type AllianceUpgradeStatusView,
  AllianceUpgradesView,
} from '@/components/alliance/AllianceUpgrades';
import {
  type ReactivationProgressView,
  ReservedAllianceNotice,
} from '@/components/alliance/ReservedAllianceNotice';
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

const REQUIREMENTS = { minLevel: 10, costGold: 10_000_000 };
const SHORT_OF_GOLD: ReactivationProgressView = {
  requirements: REQUIREMENTS,
  leader: {
    level: 12,
    gold: '3400000',
    inCurrentEra: true,
    meetsLevel: true,
    meetsGold: false,
  },
  canReactivate: false,
};
const READY: ReactivationProgressView = {
  requirements: REQUIREMENTS,
  leader: {
    level: 12,
    gold: '14200000',
    inCurrentEra: true,
    meetsLevel: true,
    meetsGold: true,
  },
  canReactivate: true,
};
const MEMBER_VIEW: ReactivationProgressView = {
  requirements: REQUIREMENTS,
  leader: null,
  canReactivate: false,
};

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
      upgrade_alliance: true,
      set_dues: true,
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
  [LEADER_ID, 'Lady Morwen', 'ELF', 'FIGHTER', 'Leader', 0, 0],
  [303, 'Thalia Dawnspear', 'HUMAN', 'CLERIC', 'Officer', 2, 0],
  [404, 'Brannoc Ironhand', 'HUMAN', 'FIGHTER', 'Veteran', 26, 0],
  [405, 'Ysolde of the Mire', 'UNDEAD', 'ASSASSIN', 'Member', 72, 180_000],
  [406, 'Skrit', 'GOBLIN', 'THIEF', 'Member', null, 500_000],
].map(
  ([userId, name, race, playerClass, roleName, hoursAgo, arrears], index) => {
    const role = roleNamed(roleName as string);
    return {
      id: 500 + index,
      alliance_id: ALLIANCE_ID,
      user_id: userId as number,
      role_id: role.id,
      created_at: FOUNDED,
      updated_at: FOUNDED,
      dues_arrears: `${arrears}n`,
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
  },
);

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
  hall_level: 1,
  join_fee: '250000n',
  dues_amount: '100000n',
  dues_period: 'WEEKLY',
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

/** Alliance Hall status as `/api/alliances/upgrades` returns it. */
const HALL_READY: AllianceUpgradeStatusView = {
  allianceId: ALLIANCE_ID,
  status: 'ACTIVE',
  hallLevel: 1,
  memberCount: 12,
  treasury: '18450000n',
  canUpgrade: true,
  deposits: { used: 1, limit: 3, nextSlotAt: null },
};
const HALL_BLOCKED: AllianceUpgradeStatusView = {
  ...HALL_READY,
  hallLevel: 0,
  memberCount: 3,
  treasury: '760000n',
  canUpgrade: false,
  deposits: { used: 2, limit: 2, nextSlotAt: NOW.toISOString() },
};

/** Membership dues as `/api/alliances/dues/status` returns them. */
const DUES_OWING: AllianceDuesStatusView = {
  allianceId: ALLIANCE_ID,
  status: 'ACTIVE',
  joinFee: '250000n',
  duesAmount: '100000n',
  duesPeriod: 'WEEKLY',
  nextCollectionAt: '2026-10-26T04:00:00.000Z',
  member: { isLeader: false, arrears: '180000n', paidThrough: null },
  canSetDues: false,
};
const DUES_LEADER: AllianceDuesStatusView = {
  ...DUES_OWING,
  member: { isLeader: true, arrears: '0n', paidThrough: null },
  canSetDues: true,
};

const LIVE_ONLY_PANELS = [
  'AllianceAnnouncements and the latest-announcement card on Overview',
  'AllianceBank',
  'AllianceWar',
  'AllianceLists',
  'AllianceDiplomacy',
  'AllianceIntel (call form with PlayerNameAutocomplete, which searches live players)',
  'AllianceInternalBattles',
  'AllianceSettings and AllianceInvites (member count against the hall cap)',
  'DepositForm (deposit slots and treasury room from the Alliance Hall)',
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
        name="Alliance directory card: reserved"
        usedOn={['/alliances', '/alliances/browse']}
        note="A reserved alliance (#13) keeps its identity but wears the badge and takes no new members: Join is disabled."
      >
        <AllianceCard
          id={ALLIANCE_ID}
          name="The Silver Court"
          members={5}
          description="Strength through unity"
          imgsrc={getPureCrest('ELF')}
          bannerimgsrc={resolveArtworkSource(
            '/assets/images/ui/public/war-table.webp',
          )}
          status="RESERVED"
          joinMode="OPEN"
          onJoin={async () => {}}
        />
      </Specimen>
      <Specimen
        framed={false}
        name="Alliance directory card: join fee and dues"
        usedOn={['/alliances/browse']}
        note="A player outside the alliance sees the join fee and dues before joining; Join opens a confirmation on the real page."
      >
        <AllianceCard
          id={ALLIANCE_ID}
          name="The Silver Court"
          members={5}
          description="Strength through unity"
          imgsrc={getPureCrest('ELF')}
          bannerimgsrc={resolveArtworkSource(
            '/assets/images/ui/public/war-table.webp',
          )}
          joinMode="OPEN"
          joinTerms={duesTermsOf(ALLIANCE)}
          onJoin={async () => mockAction('Join alliance')()}
        />
      </Specimen>
      <Specimen
        framed={false}
        name="Alliance directory card: full"
        usedOn={['/alliances/browse']}
        note="Members are shown against the Alliance Hall cap; a full alliance says nobody can join until the hall is upgraded."
      >
        <AllianceCard
          id={ALLIANCE_ID}
          name="The Silver Court"
          members={10}
          memberCap={10}
          description="Strength through unity"
          imgsrc={getPureCrest('ELF')}
          bannerimgsrc={resolveArtworkSource(
            '/assets/images/ui/public/war-table.webp',
          )}
          joinMode="OPEN"
          onJoin={async () => mockAction('Join alliance')()}
        />
      </Specimen>
      <Specimen
        framed={false}
        name="Reserved alliance: leader, short of gold"
        usedOn={[PAGE]}
        wide
        note="Why the alliance is on hold, what stays open, and the leader's progress. Reactivate stays disabled until both requirements are met."
      >
        <ReservedAllianceNotice
          allianceName="The Silver Court"
          leaderName="Lady Morwen"
          viewer="leader"
          progress={SHORT_OF_GOLD}
          onReactivate={mockAction('Reactivate alliance')}
        />
      </Specimen>
      <Specimen
        framed={false}
        name="Reserved alliance: leader, ready"
        usedOn={[PAGE]}
        wide
        note="Both requirements met: the button opens the pay-and-reactivate confirmation (mocked here)."
      >
        <ReservedAllianceNotice
          allianceName="The Silver Court"
          leaderName="Lady Morwen"
          viewer="leader"
          progress={READY}
          onReactivate={mockAction('Reactivate alliance')}
        />
      </Specimen>
      <Specimen
        framed={false}
        name="Reserved alliance: member"
        usedOn={[PAGE]}
        wide
        note="Members see the same facts and can leave at any time without the leader."
      >
        <ReservedAllianceNotice
          allianceName="The Silver Court"
          leaderName="Lady Morwen"
          viewer="member"
          progress={MEMBER_VIEW}
          onLeave={mockAction('Leave alliance')}
        />
      </Specimen>
      <Specimen
        framed={false}
        name="Reserved alliance: visitor"
        usedOn={[PAGE]}
        note="Public view: the status and the requirements, no actions."
      >
        <ReservedAllianceNotice
          allianceName="The Silver Court"
          viewer="visitor"
          progress={MEMBER_VIEW}
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
        name="AllianceDuesCard: member in arrears"
        usedOn={[
          `${PAGE} (Overview tab)`,
          `${PAGE} (Bank tab)`,
          `${PAGE} (Settings tab)`,
        ]}
        note="Join fee, dues and period, next collection, what the member owes and Pay dues (mocked), with the link to where the leader changes it."
      >
        <AllianceDuesCard
          allianceId={ALLIANCE_ID}
          mockStatus={DUES_OWING}
          mockPay={mockAction('Pay dues')}
        />
      </Specimen>

      <Specimen
        framed={false}
        name="AllianceDuesCard: leader"
        usedOn={[`${PAGE} (Overview tab)`, `${PAGE} (Settings tab)`]}
        note="The leader pays no dues."
      >
        <AllianceDuesCard allianceId={ALLIANCE_ID} mockStatus={DUES_LEADER} />
      </Specimen>

      <Specimen
        framed={false}
        name="AllianceDuesSettingsCard"
        usedOn={[`${PAGE} (Settings tab)`]}
        note="Leader and Set join fee and dues ranks. Lists the maximum per period; saving is mocked."
        wide
      >
        <AllianceDuesSettingsCard
          allianceId={ALLIANCE_ID}
          terms={duesTermsOf(ALLIANCE)}
          mockAction={mockAction('Save fee and dues')}
        />
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
        name="AllianceUpgradesView: next level buyable"
        usedOn={[`${PAGE} (Upgrades tab)`, 'AllianceUpgrades']}
        note="A leader at Hall (level 1) with enough members and treasury gold for Great Hall. Buy opens the real confirmation; confirming is mocked."
        wide
      >
        <AllianceUpgradesView
          status={HALL_READY}
          onBuy={async () => mockAction('Buy alliance upgrade')()}
        />
      </Specimen>

      <Specimen
        framed={false}
        name="AllianceUpgradesView: blocked"
        usedOn={[`${PAGE} (Upgrades tab)`, 'AllianceUpgrades']}
        note="A member without the Buy upgrades rank permission at Camp: the Buy button is disabled with its reason. The deposit form and invite panel read the same status live."
        wide
      >
        <AllianceUpgradesView
          status={HALL_BLOCKED}
          onBuy={async () => mockAction('Buy alliance upgrade')()}
        />
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
