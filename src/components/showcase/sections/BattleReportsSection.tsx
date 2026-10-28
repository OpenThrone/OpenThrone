import { Button } from '@mantine/core';
import type { MouseEvent, ReactNode } from 'react';
import { useState } from 'react';

import AssassinateResult from '@/components/AssassinateResult';
import AttackResults from '@/components/attackResult';
import { BattleGameEventContext } from '@/components/battle/BattleGameEventContext';
import { GarrisonFatigueNotice } from '@/components/battle/GarrisonFatigueNotice';
import { ReportHeader } from '@/components/battle/ReportHeader';
import { ReportSharingControls } from '@/components/battle/ReportSharingControls';
import BattleTestResults from '@/components/BattleTestResults';
import InfiltrationResult from '@/components/InfiltrationResult';
import IntelResult from '@/components/IntelResult';
import { OrnatePanel } from '@/components/OrnatePanel';
import {
  mockAction,
  ShowcaseSection,
  Specimen,
} from '@/components/showcase/Showcase';
import type { RedactedAttackLog } from '@/services/AttackLogAccess.service';
import type { ReportSharingState } from '@/services/ReportSharing.service';

const ATTACKER_ID = 101;
const DEFENDER_ID = 202;
const LAST_GENERATED = '2026-10-20T18:42:00.000Z';
const REPORT_PAGE = '/battle/results/[id]';

const ATTACKER = {
  id: ATTACKER_ID,
  display_name: 'Lady Morwen',
  avatar: 'SHIELD',
  race: 'ELF',
  experience: 48210,
};

const DEFENDER = {
  id: DEFENDER_ID,
  display_name: 'Grukk the Vile',
  avatar: 'SHIELD',
  race: 'GOBLIN',
  experience: 39950,
};

/** Shared fields of every attack_log row, as redactAttackLogForViewer returns them. */
const LOG_BASE = {
  timestamp: '2026-10-20T18:40:00.000Z',
  attacker_id: ATTACKER_ID,
  defender_id: DEFENDER_ID,
  attackerPlayer: ATTACKER,
  defenderPlayer: DEFENDER,
};

/** Attack won by the viewer, redacted for the attacker role. */
const ATTACK_VICTORY: RedactedAttackLog = {
  ...LOG_BASE,
  id: 48213,
  type: 'attack',
  winner: ATTACKER_ID,
  stats: {
    startOfAttack: {
      Attacker: {
        experience: 48210,
        units: [
          { type: 'OFFENSE', level: 1, quantity: 1200 },
          { type: 'OFFENSE', level: 2, quantity: 450 },
        ],
      },
      Defender: { experience: 39950 },
    },
    attackerDamageDealt: 18450,
    defenderDamageDealt: 9120,
    xpEarned: JSON.stringify({ attacker: 1840, defender: 620 }),
    pillagedGold: '2450000',
    forcePillageContribution: '122500',
    goldLoanRepayment: '0',
    netPillageGold: '2327500',
    fortDamage: 38,
    attacker_losses: {
      total: 87,
      units: [
        { type: 'OFFENSE', level: 1, quantity: 71 },
        { type: 'OFFENSE', level: 2, quantity: 16 },
      ],
    },
    defender_losses: { total: 214 },
    defender_fatigue_percent: 12,
    combat_summary: {
      attackerDamageHp: 18450,
      defenderDamageHp: 9120,
      attackerWounded: {
        total: 42,
        units: [{ type: 'OFFENSE', level: 1, quantity: 42 }],
      },
      defenderWounded: { total: 96 },
      defenderProtected: false,
      fortAbsorbedDamage: true,
    },
    recommendation_facts: {
      army: 1650,
      deaths: 87,
      wounded: 42,
      enemyDeaths: 214,
      damageDealt: 18450,
      damageReceived: 9120,
      turns: 7,
    },
    turns: 7,
  },
};

/** Attack lost by the viewer, redacted for the attacker role. */
const ATTACK_DEFEAT: RedactedAttackLog = {
  ...LOG_BASE,
  id: 48219,
  type: 'attack',
  winner: DEFENDER_ID,
  stats: {
    startOfAttack: {
      Attacker: {
        experience: 48210,
        units: [{ type: 'OFFENSE', level: 1, quantity: 600 }],
      },
      Defender: { experience: 39950 },
    },
    attackerDamageDealt: 4200,
    defenderDamageDealt: 11800,
    xpEarned: JSON.stringify({ attacker: 310, defender: 980 }),
    pillagedGold: '180000',
    fortDamage: 6,
    attacker_losses: {
      total: 233,
      units: [{ type: 'OFFENSE', level: 1, quantity: 233 }],
    },
    defender_losses: { total: 41 },
    combat_summary: {
      attackerDamageHp: 4200,
      defenderDamageHp: 11800,
      attackerWounded: {
        total: 118,
        units: [{ type: 'OFFENSE', level: 1, quantity: 118 }],
      },
      defenderWounded: { total: 19 },
      defenderProtected: false,
      fortAbsorbedDamage: true,
    },
    recommendation_facts: {
      army: 600,
      deaths: 233,
      wounded: 118,
      enemyDeaths: 41,
      damageDealt: 4200,
      damageReceived: 11800,
      turns: 3,
    },
    turns: 3,
  },
};

/** Successful full-intel mission, redacted for the spymaster. */
const INTEL_REPORT: RedactedAttackLog = {
  ...LOG_BASE,
  id: 48230,
  type: 'INTEL',
  winner: ATTACKER_ID,
  stats: {
    spyResults: {
      spiesSent: 40,
      spiesLost: 3,
      success: true,
      turns: 3,
      attackerLevel: 22,
      defenderLevel: 19,
      intelPercentage: 100,
      intelligenceGathered: {
        offense: 184000,
        defense: 221500,
        spyOffense: 12400,
        spyDefense: 15800,
        units: [
          { type: 'CITIZEN', level: 1, quantity: 640 },
          { type: 'WORKER', level: 1, quantity: 1850 },
          { type: 'OFFENSE', level: 1, quantity: 1320 },
          { type: 'DEFENSE', level: 1, quantity: 1480 },
          { type: 'SPY', level: 1, quantity: 210 },
          { type: 'SENTRY', level: 1, quantity: 260 },
        ],
        mercenaries: [{ type: 'DEFENSE', level: 1, quantity: 300 }],
        items: [
          { usage: 'OFFENSE', type: 'WEAPON', level: 1, quantity: 1320 },
          { usage: 'OFFENSE', type: 'HELM', level: 1, quantity: 900 },
          { usage: 'OFFENSE', type: 'ARMOR', level: 1, quantity: 640 },
          { usage: 'DEFENSE', type: 'WEAPON', level: 1, quantity: 1480 },
          { usage: 'DEFENSE', type: 'SHIELD', level: 1, quantity: 1100 },
          { usage: 'DEFENSE', type: 'BOOTS', level: 1, quantity: 520 },
          { usage: 'SPY', type: 'WEAPON', level: 1, quantity: 210 },
          { usage: 'SENTRY', type: 'BRACERS', level: 1, quantity: 130 },
        ],
        fortLevel: 4,
        fortHitpoints: 780,
        defenseBonus: 15,
        spyLevel: 3,
        sentryLevel: 4,
        gold: '1840000',
        goldInBank: '9200000',
      },
      spyLosses: [{ type: 'SPY', level: 1, quantity: 3 }],
      successProbability: 0.82,
      experienceGained: 140,
    },
  },
};

/** Failed infiltration, redacted for the spymaster. */
const INFILTRATION_REPORT: RedactedAttackLog = {
  ...LOG_BASE,
  id: 48241,
  type: 'INFILTRATE',
  winner: DEFENDER_ID,
  stats: {
    spyResults: {
      spiesSent: 12,
      spiesLost: 7,
      success: false,
      turns: 4,
      attackerLevel: 22,
      defenderLevel: 19,
      fortDmg: 0,
      spyLosses: [{ type: 'SPY', level: 1, quantity: 7 }],
    },
  },
};

/** Successful assassination, redacted for the target (defender role). */
const ASSASSINATION_REPORT: RedactedAttackLog = {
  ...LOG_BASE,
  id: 48252,
  type: 'ASSASSINATE',
  winner: ATTACKER_ID,
  stats: {
    spyResults: {
      spiesSent: 25,
      spiesLost: 4,
      success: true,
      turns: 5,
      attackerLevel: 22,
      defenderLevel: 19,
      unitsKilled: 318,
      unit: 'OFFENSE',
      targetUnit: 'OFFENSE',
      targetLosses: [{ type: 'OFFENSE', level: 1, quantity: 318 }],
    },
  },
};

/** The /api/battle/simulate response pieces the simulator passes down. */
const SIMULATION = {
  results: {
    result: 'WIN',
    Losses: {
      Attacker: {
        total: 142,
        units: [
          { type: 'OFFENSE', level: 1, quantity: 118 },
          { type: 'OFFENSE', level: 2, quantity: 24 },
        ],
      },
      Defender: {
        total: 305,
        units: [
          { type: 'DEFENSE', level: 1, quantity: 251 },
          { type: 'CITIZEN', level: 1, quantity: 54 },
        ],
      },
    },
    defender: { fortLevel: 3 },
    finalFortHP: 164,
    turnsTaken: 7,
    log: 'Turn 1: attacker deals 2,640 damage, defender deals 1,310.\nTurn 2: fort absorbs 18% of incoming damage.\nTurn 7: defender line breaks.',
  },
  attackerStats: {
    attackPower: 184000,
    defensePower: 62000,
    unitTotals: { OFFENSE: 1650, DEFENSE: 400, SPY: 120 },
  },
  defenderStats: {
    attackPower: 71000,
    defensePower: 221500,
    unitTotals: { OFFENSE: 600, DEFENSE: 1480, CITIZEN: 640 },
  },
};

/**
 * Report follow-up buttons open the live attack and spy dialogs, which post
 * missions and fetch recommendations; swap every button click for a mock.
 */
function MockButtons({ children }: { children: ReactNode }) {
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest('button');
    if (!button || button.hasAttribute('data-report-event-details')) return;
    event.preventDefault();
    event.stopPropagation();
    mockAction(button.textContent?.trim() || 'report action')();
  };
  return <div onClickCapture={onClickCapture}>{children}</div>;
}

/** The report frame exactly as /battle/results/[id] renders it. */
function ReportFrame({ children }: { children: ReactNode }) {
  return (
    <MockButtons>
      <OrnatePanel minHeight={300}>{children}</OrnatePanel>
    </MockButtons>
  );
}

const FOLLOW_UP_NOTE =
  'Follow-up buttons (attack again, send more spies) are mocked; the real dialogs post missions.';

function ReportSharingDemo() {
  const [search, setSearch] = useState('');
  const [state, setState] = useState<ReportSharingState>({
    isPublic: false,
    canReportThreat: false,
    alliances: [{ id: 7, name: 'Silver Vigil', alreadyShared: true }],
    grants: [
      { id: 1, kind: 'alliance', name: 'Silver Vigil' },
      { id: 2, kind: 'player', name: 'Thalia Dawnspear' },
    ],
  });
  return (
    <ReportSharingControls
      state={state}
      search={search}
      onSearch={setSearch}
      players={
        search.length >= 2 &&
        'Thalia Dawnspear'.toLowerCase().includes(search.toLowerCase())
          ? [{ id: 303, display_name: 'Thalia Dawnspear' }]
          : []
      }
      onAction={async (action) => {
        if (action.action === 'public')
          setState((value) => ({ ...value, isPublic: action.enabled }));
        if (action.action === 'revoke')
          setState((value) => ({
            ...value,
            grants: value.grants.filter((g) => g.id !== action.grantId),
          }));
        mockAction('Update report access')();
      }}
    />
  );
}

export default function BattleReportsSection() {
  return (
    <ShowcaseSection
      id="battle"
      title="Battle & spy reports"
      description="The redacted attack and spy reports a player reads after a mission, fed with mock attack_log rows in the shape redactAttackLogForViewer returns."
    >
      <Specimen
        name="Historical game events"
        usedOn={[REPORT_PAGE]}
        wide
        note="Compact reward annotations open saved event details. The full victory report below shows their position beside Spoils of War."
      >
        <BattleGameEventContext
          value={{
            version: 1,
            capturedAt: '2026-10-24T12:00:00.000Z',
            appliedXpMultiplier: 2,
            events: [
              {
                id: 1,
                name: 'Double XP Weekend',
                startsAt: '2026-10-23T00:00:00.000Z',
                endsAt: '2026-10-26T00:00:00.000Z',
                effects: { xpMultiplier: 2 },
              },
            ],
          }}
        />
        <BattleGameEventContext value={undefined} />
      </Specimen>
      <Specimen
        name="Report sharing"
        usedOn={[REPORT_PAGE, '/battle/history']}
        wide
        note="Participant-only controls with a single searchable player picker; type Thalia to try keyboard selection. Sample grants and mock actions make no API calls."
      >
        <ReportSharingDemo />
      </Specimen>
      <Specimen
        framed={false}
        name="Assassination: shared viewer"
        usedOn={[REPORT_PAGE]}
        wide
        note="A recipient is neither combatant. Wording stays neutral and follow-up actions are hidden."
      >
        <ReportFrame>
          <AssassinateResult
            battle={ASSASSINATION_REPORT}
            lastGenerated={LAST_GENERATED}
            viewerID={999}
          />
        </ReportFrame>
      </Specimen>
      <Specimen
        framed={false}
        name="Infiltration: shared viewer"
        usedOn={[REPORT_PAGE]}
        wide
      >
        <ReportFrame>
          <InfiltrationResult
            battle={INFILTRATION_REPORT}
            lastGenerated={LAST_GENERATED}
            viewerID={999}
          />
        </ReportFrame>
      </Specimen>
      <Specimen
        framed={false}
        name="ReportHeader (outcome band + participants)"
        usedOn={[REPORT_PAGE, 'attackResult.tsx', 'SpyReportShell.tsx']}
        note="battle/ReportHeader: the outcome banner, ParticipantHeader for each side and the ReportBand with the report id and follow-up actions, shared by every battle and spy report. Actions are plain theme Buttons; levelTo shows a level-up."
        wide
      >
        <OrnatePanel minHeight={300}>
          <ReportHeader
            banner={{
              tone: 'green',
              title: 'Victory',
              subtitle: 'Lady Morwen is victorious',
            }}
            attacker={{
              player: ATTACKER,
              side: 'attacker',
              role: 'Attacker',
              levelLabel: 'Level 22',
              levelTo: 23,
              avatarAlt: 'Attacker avatar',
            }}
            defender={{
              player: DEFENDER,
              side: 'defender',
              role: 'Defender',
              levelLabel: 'Level 19',
              avatarAlt: 'Defender avatar',
              profileLabel: 'View Grukk the Vile profile',
            }}
            band={{
              label: 'Battle ID',
              reportId: ATTACK_VICTORY.id,
              actions: (
                <Button
                  size="md"
                  fullWidth
                  px="xs"
                  onClick={mockAction('Attack again')}
                >
                  Attack again
                </Button>
              ),
            }}
          />
        </OrnatePanel>
      </Specimen>

      <Specimen
        name="Garrison fatigue line"
        usedOn={[REPORT_PAGE]}
        note="battle/GarrisonFatigueNotice: the defender's garrison was worn down by earlier defences today. Both sides read it from the same report; the percentage comes from the log's defender_fatigue_percent."
      >
        <GarrisonFatigueNotice percent={12} />
      </Specimen>

      <Specimen
        framed={false}
        name="AttackResults: victory (viewer is attacker)"
        usedOn={[REPORT_PAGE]}
        note={`${FOLLOW_UP_NOTE} The attack recommendation footer inside the attack dialog fetches its own data and is live-only.`}
        wide
      >
        <ReportFrame>
          <AttackResults
            battle={{
              ...ATTACK_VICTORY,
              stats: {
                ...ATTACK_VICTORY.stats,
                gameEvents: {
                  version: 1,
                  capturedAt: '2026-10-22T22:40:12.565Z',
                  appliedXpMultiplier: 10,
                  events: [
                    {
                      id: 25,
                      name: 'Testing XP Multiplier',
                      startsAt: '2026-10-22T22:36:00.000Z',
                      endsAt: '2026-10-24T22:36:00.000Z',
                      effects: { xpMultiplier: 10 },
                    },
                  ],
                },
              },
            }}
            viewerID={ATTACKER_ID}
          />
        </ReportFrame>
      </Specimen>

      <Specimen
        framed={false}
        name="AttackResults: defeat (viewer is attacker)"
        usedOn={[REPORT_PAGE]}
        note="Loot from the turns the attacker won still shows in the timeline."
        wide
      >
        <ReportFrame>
          <AttackResults battle={ATTACK_DEFEAT} viewerID={ATTACKER_ID} />
        </ReportFrame>
      </Specimen>

      <Specimen
        framed={false}
        name="IntelResult: full intel (viewer is spymaster)"
        usedOn={[REPORT_PAGE]}
        note={`intelPercentage 100: population ring, mercenaries and the armory rings per role. ${FOLLOW_UP_NOTE}`}
        wide
      >
        <ReportFrame>
          <IntelResult
            battle={INTEL_REPORT}
            lastGenerated={LAST_GENERATED}
            viewerID={ATTACKER_ID}
          />
        </ReportFrame>
      </Specimen>

      <Specimen
        framed={false}
        name="InfiltrationResult: caught (viewer is spymaster)"
        usedOn={[REPORT_PAGE]}
        wide
      >
        <ReportFrame>
          <InfiltrationResult
            battle={INFILTRATION_REPORT}
            lastGenerated={LAST_GENERATED}
            viewerID={ATTACKER_ID}
          />
        </ReportFrame>
      </Specimen>

      <Specimen
        framed={false}
        name="AssassinateResult: struck (viewer is target)"
        usedOn={[REPORT_PAGE]}
        note="Written from the target's side, with the attack-back follow-up."
        wide
      >
        <ReportFrame>
          <AssassinateResult
            battle={ASSASSINATION_REPORT}
            lastGenerated={LAST_GENERATED}
            viewerID={DEFENDER_ID}
          />
        </ReportFrame>
      </Specimen>

      <Specimen
        framed={false}
        name="BattleTestResults (simulator)"
        usedOn={['/battle/battleSimulator']}
        wide
      >
        <BattleTestResults
          results={SIMULATION.results}
          attackerStats={SIMULATION.attackerStats}
          defenderStats={SIMULATION.defenderStats}
        />
      </Specimen>
    </ShowcaseSection>
  );
}
