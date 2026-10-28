import { MercenaryBarracks } from '@/components/game/MercenaryBarracks';
import {
  mockAction,
  ShowcaseSection,
  Specimen,
} from '@/components/showcase/Showcase';

const offers = [
  {
    type: 'OFFENSE',
    level: 1,
    name: 'Soldier',
    fortLevel: 1,
    mobilization: '1875',
    dailyPrice: '1325',
  },
  {
    type: 'OFFENSE',
    level: 2,
    name: 'Knight',
    fortLevel: 4,
    mobilization: '7500',
    dailyPrice: '5300',
  },
  {
    type: 'OFFENSE',
    level: 3,
    name: 'Berserker',
    fortLevel: 8,
    mobilization: '30000',
    dailyPrice: '21200',
  },
  {
    type: 'DEFENSE',
    level: 1,
    name: 'Guard',
    fortLevel: 1,
    mobilization: '1875',
    dailyPrice: '1325',
  },
];
const contracts = [
  {
    id: 1,
    type: 'OFFENSE',
    level: 1,
    initialQuantity: 25,
    survivingQuantity: 23,
    expiresAt: '2026-12-20T12:00:00.000Z',
    unitPriceGold: '1325',
  },
];
const order = async () => {
  mockAction('Mercenary order')();
};

export default function MercenariesSection() {
  return (
    <ShowcaseSection
      id="mercenaries"
      title="Mercenaries"
      description="Ready-equipped temporary troops and contract management."
    >
      <Specimen
        name="Mercenary barracks · unlocked"
        usedOn={['/battle/mercenaries']}
        framed={false}
      >
        <MercenaryBarracks
          fortLevel={10}
          economyLevel={4}
          armyShare={{ mercenaries: 23, trainedUnits: 100, allowed: 50 }}
          gold="9000000"
          offers={offers}
          contracts={contracts}
          onOrder={order}
        />
      </Specimen>
      <Specimen
        name="Mercenary barracks · locked hall"
        usedOn={['/battle/mercenaries']}
        framed={false}
      >
        <MercenaryBarracks
          fortLevel={2}
          economyLevel={2}
          armyShare={{ mercenaries: 23, trainedUnits: 100, allowed: 50 }}
          gold="9000000"
          offers={offers}
          contracts={contracts}
          onOrder={order}
        />
      </Specimen>
    </ShowcaseSection>
  );
}
