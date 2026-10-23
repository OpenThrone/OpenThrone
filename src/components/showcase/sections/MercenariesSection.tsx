import { MercenaryBarracks } from '@/components/game/MercenaryBarracks';
import {
  mockAction,
  ShowcaseSection,
  Specimen,
} from '@/components/showcase/Showcase';

export default function MercenariesSection() {
  return (
    <ShowcaseSection
      id="mercenaries"
      title="Mercenaries"
      description="Ready-equipped temporary troops and contract management."
    >
      <Specimen
        name="Mercenary barracks"
        usedOn={['/battle/mercenaries']}
        framed={false}
      >
        <MercenaryBarracks
          fortLevel={10}
          gold="9000000"
          offers={[
            {
              type: 'OFFENSE',
              level: 1,
              name: 'Soldier',
              fortLevel: 1,
              mobilization: '1875',
              dailyPrice: '1325',
            },
            {
              type: 'DEFENSE',
              level: 1,
              name: 'Guard',
              fortLevel: 1,
              mobilization: '1875',
              dailyPrice: '1325',
            },
          ]}
          contracts={[
            {
              id: 1,
              type: 'OFFENSE',
              level: 1,
              initialQuantity: 25,
              survivingQuantity: 23,
              expiresAt: '2026-12-20T12:00:00.000Z',
              unitPriceGold: '1325',
            },
          ]}
          onOrder={async () => {
            mockAction('Mercenary order')();
          }}
        />
      </Specimen>
    </ShowcaseSection>
  );
}
