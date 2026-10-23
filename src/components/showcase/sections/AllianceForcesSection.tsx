import { Text } from '@mantine/core';

import { AllianceDues } from '@/components/alliance/AllianceDues';
import type { AllianceForcesData } from '@/components/alliance/AllianceForces';
import { AllianceForces } from '@/components/alliance/AllianceForces';
import {
  mockAction,
  ShowcaseSection,
  Specimen,
} from '@/components/showcase/Showcase';
import { ItemTypes } from '@/constants';

const equipment = [
  ...new Set(
    ItemTypes.filter((item) => item.usage === 'OFFENSE').map(
      (item) => item.type,
    ),
  ),
].map((type) => ({ type, level: 1 }));
const data: AllianceForcesData = {
  allianceId: 7,
  allianceName: 'Silver Court',
  userId: 101,
  isLeader: true,
  reserves: [
    {
      id: 1,
      type: 'OFFENSE',
      level: 1,
      available: 40,
      woundedQuantity: 3,
      equipment,
    },
  ],
  contracts: [
    {
      id: 1,
      userId: 101,
      type: 'OFFENSE',
      level: 1,
      status: 'ACTIVE',
      survivingQuantity: 12,
      expiresAt: '2026-12-20T12:00:00.000Z',
      requestedExtensionDays: 3,
      pillageRateBps: 500,
      user: { display_name: 'Lady Morwen' },
    },
    {
      id: 2,
      userId: 102,
      type: 'OFFENSE',
      level: 1,
      status: 'REQUESTED',
      survivingQuantity: 20,
      expiresAt: null,
      requestedExtensionDays: null,
      pillageRateBps: 500,
      user: { display_name: 'Brannoc' },
    },
  ],
  units: [{ id: 1, type: 'OFFENSE', level: 1, quantity: 50 }],
  items: equipment.map((item) => ({ ...item, usage: 'OFFENSE', quantity: 50 })),
  catalog: ItemTypes.map(({ usage, type, level, name }) => ({
    usage,
    type,
    level,
    name,
  })),
  members: [
    { user_id: 101, user: { display_name: 'Lady Morwen' } },
    { user_id: 102, user: { display_name: 'Brannoc' } },
  ],
  roles: [{ id: 1, name: 'Member' }],
  policy: {
    lendingMode: 'MANUAL',
    roleAllowances: [
      {
        roleId: 1,
        maxBorrowed: 100,
        maxTermDays: 7,
        pillageRateBps: 200,
        loanRateBps: 500,
      },
    ],
    enforcement: {
      suspendOverdue: true,
      autoCollectAfterDays: 3,
      fineGold: '1000',
      expelAfterDays: 10,
    },
  },
};
const onOrder = async () => {
  mockAction('Alliance troop or dues order')();
};
export default function AllianceForcesSection() {
  return (
    <ShowcaseSection
      id="allianceForces"
      title="Alliance troops & dues"
      description="An alliance-owned equipped reserve, temporary loans and explicit member obligations."
    >
      <Specimen
        name="Troop reserve, contributions, loans and policy"
        usedOn={['/alliances/[id]/forces']}
        framed={false}
      >
        <AllianceForces data={data} onOrder={onOrder} />
      </Specimen>
      <Specimen
        name="Dues and war levies"
        usedOn={['/alliances/[id]/forces']}
        framed={false}
      >
        <AllianceDues
          data={data}
          dues={{
            obligations: [
              {
                id: 1,
                userId: 101,
                title: 'War preparation',
                type: null,
                level: null,
                amountGold: '10000',
                paidGold: '4000',
                quantity: 0,
                paidQuantity: 0,
                fineGold: '1000',
                paidFineGold: '0',
                dueAt: '2026-10-20T12:00:00.000Z',
                cancelledAt: null,
                collectionUnitId: null,
                enforcement: data.policy.enforcement,
              },
            ],
            rules: [
              {
                id: 1,
                roleId: 1,
                minLevel: 1,
                amountGold: '1000',
                quantity: 0,
                type: null,
                level: null,
                intervalDays: 7,
                dueDays: 3,
                enabled: true,
              },
            ],
          }}
          onOrder={onOrder}
        />
      </Specimen>
      <Text size="sm" c="var(--ot-muted)">
        Live only: ForceDuesNotice reads the signed-in member’s due-soon and
        overdue obligations in MainArea.
      </Text>
    </ShowcaseSection>
  );
}
