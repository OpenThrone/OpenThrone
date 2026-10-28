import { Button, Group, Stack, Text } from '@mantine/core';
import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';

import ArmyInputForm from '@/components/ArmyInputForm';
import QuantityInput, {
  QuantityAction,
} from '@/components/battle/QuantityInput';
import QuantitySlider from '@/components/battle/QuantitySlider';
import { ArmoryLoadoutPlanner } from '@/components/game/ArmoryLoadoutPlanner';
import { OrderSummaryBar } from '@/components/game/OrderSummaryBar';
import type { NewsDraft } from '@/components/news/NewsComposer';
import NewsComposer from '@/components/news/NewsComposer';
import { ItemTypes } from '@/constants/Items';
import type { ArmoryItem, ArmoryQuantities } from '@/utils/armoryOrder';
import { armoryOrderCost } from '@/utils/armoryOrder';
import MockUserGenerator from '@/utils/MockUserGenerator';

import { mockAction, ShowcaseSection, Specimen } from '../Showcase';

type SimulatorUser = ComponentProps<typeof ArmyInputForm>['armyData'];

/* ------------------------------------------------------------------ */
/* QuantitySlider                                                      */
/* ------------------------------------------------------------------ */

function QuantitySliders() {
  const [spies, setSpies] = useState(3);
  const [assassins, setAssassins] = useState(25);
  const [infiltrators, setInfiltrators] = useState(1);
  return (
    <Stack gap="lg">
      <QuantitySlider
        label="Spies to send"
        description="Each spy raises the chance of a full report."
        min={1}
        max={10}
        value={spies}
        onChange={setSpies}
      />
      <QuantitySlider
        label="Assassins to send"
        description="Assassinations need at least 5 assassins; you have 120."
        min={5}
        max={120}
        value={assassins}
        onChange={setAssassins}
      />
      <QuantitySlider
        label="Infiltrators to send"
        description="You need at least 2 infiltrators and have 1, so the control is unavailable."
        min={2}
        max={1}
        value={infiltrators}
        onChange={setInfiltrators}
      />
    </Stack>
  );
}

/* ------------------------------------------------------------------ */
/* QuantityInput (training, armory, battle upgrades, bank, repair)     */
/* ------------------------------------------------------------------ */

const BANK_GOLD_CAP = 12_500_000_000n;

function QuantityInputs() {
  const [units, setUnits] = useState(0);
  const [items, setItems] = useState(0);
  const [deposit, setDeposit] = useState(15_000_000_000n);
  const [repair, setRepair] = useState(0);
  return (
    <Stack gap="md">
      <QuantityInput
        label="Quantity for Footman"
        hideLabel
        value={units}
        onChange={setUnits}
        onMax={() => setUnits(240)}
        maxAriaLabel="Set maximum for Footman"
      />
      <QuantityInput
        label="Quantity for Iron Sword"
        hideLabel
        grow
        value={items}
        onChange={setItems}
        onMax={() => setItems(0)}
        maxAriaLabel="Set maximum purchase for Iron Sword"
        maxTooltip="Buy up to 0: limited by unequipped units and remaining gold."
        maxDisabled
        actions={
          <QuantityAction
            variant="subtle"
            ariaLabel="Select all owned Iron Sword"
            tooltip="Select your owned items, then Sell in the order summary."
            onClick={() => setItems(900)}
          >
            All owned
          </QuantityAction>
        }
      />
      <QuantityInput
        label="Amount"
        description="Deposit up to 80% of the gold in hand."
        value={deposit}
        onChange={setDeposit}
        grow
        onMax={() => setDeposit(BANK_GOLD_CAP)}
        maxAriaLabel="Deposit maximum amount"
        error={
          deposit > BANK_GOLD_CAP
            ? 'Deposits are capped at 80% of gold in hand.'
            : undefined
        }
      />
      <QuantityInput
        label="Amount to Repair"
        value={repair}
        onChange={setRepair}
        max={4_800}
        grow
        onMax={() => setRepair(4_800)}
        maxAriaLabel="Set repair amount to maximum"
      />
      <QuantityInput
        label="Quantity for Locked Knight"
        hideLabel
        value={0}
        onChange={() => undefined}
        disabled
        onMax={() => undefined}
        maxAriaLabel="Set maximum for Locked Knight"
      />
    </Stack>
  );
}

/* ------------------------------------------------------------------ */
/* Armory loadout planner + order summary (/structures/armory/[tab])  */
/* ------------------------------------------------------------------ */

const ARMORY_LEVEL = 3;
const ARMORY_UNITS = 1_500;
const ARMORY_GOLD = 85_000_000n;
const ARMORY_SLOTS = ['WEAPON', 'HELM', 'BRACERS', 'SHIELD', 'BOOTS', 'ARMOR'];
/** Owned stock per slot at tier 1, as the page derives from user.items. */
const OWNED_TIER_ONE: Record<string, number> = {
  WEAPON: 900,
  HELM: 400,
  BOOTS: 250,
};

/** Offense tab items, mapped the way the armory page's itemMapFunction does. */
const ARMORY_CATEGORIES: Record<string, ArmoryItem[]> = Object.fromEntries(
  ARMORY_SLOTS.map((slot) => [
    slot,
    ItemTypes.filter(
      (item) =>
        item.usage === 'OFFENSE' &&
        item.type === slot &&
        (item.race === 'ALL' || item.race === 'HUMAN'),
    )
      .map(
        (item): ArmoryItem => ({
          ...item,
          ownedItems: item.level === 1 ? (OWNED_TIER_ONE[slot] ?? 0) : 0,
          refundBaseCost: item.cost,
          conversionValue: item.cost,
          enabled: item.armoryLevel <= ARMORY_LEVEL,
        }),
      )
      .sort((a, b) => a.level - b.level),
  ]),
);
const ARMORY_ITEMS = Object.values(ARMORY_CATEGORIES).flat();

function ArmoryOrderDemo() {
  const [quantities, setQuantities] = useState<ArmoryQuantities>({});
  const totalCost = useMemo(
    () => armoryOrderCost(ARMORY_ITEMS, quantities),
    [quantities],
  );
  const hasOrder = Object.values(quantities).some((quantity) => quantity > 0);
  return (
    <Stack gap="md">
      <ArmoryLoadoutPlanner
        categories={ARMORY_CATEGORIES}
        allItems={ARMORY_ITEMS}
        quantities={quantities}
        setQuantities={setQuantities}
        onUpgrade={async (conversions) =>
          mockAction(`upgrade ${conversions.length} item stacks`)()
        }
        units={ARMORY_UNITS}
        unitTiers={{ 1: ARMORY_UNITS }}
        gold={ARMORY_GOLD}
        locale="en-US"
      />
      <Text size="xs" c="var(--ot-muted)">
        {hasOrder
          ? 'The order summary below reflects the planned loadout.'
          : 'Open the planner and apply a loadout to queue an order.'}
      </Text>
      <OrderSummaryBar
        visible={hasOrder}
        title="Armory order"
        totalCostLabel="Total cost"
        totalCost={totalCost}
        refundLabel="Refund"
        refund={0}
        primaryAction={{
          label: 'Buy',
          onClick: mockAction('buy armory order'),
        }}
        secondaryAction={{
          label: 'Sell',
          onClick: mockAction('sell armory order'),
        }}
        clearAction={{ label: 'Clear all', onClick: () => setQuantities({}) }}
        hint="Gold is spent from your hand, not your bank."
        locale="en-US"
      />
    </Stack>
  );
}

function OrderSummaryDemo() {
  const [visible, setVisible] = useState(false);
  return (
    <Stack gap="sm">
      <Button
        variant="default"
        size="xs"
        w="fit-content"
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? 'Hide order bar' : 'Show order bar'}
      </Button>
      <OrderSummaryBar
        visible={visible}
        title="Training order"
        totalCostLabel="Total cost"
        totalCost={3_750_000}
        refundLabel="Refund"
        refund={1_125_000}
        primaryAction={{ label: 'Train', onClick: mockAction('train units') }}
        secondaryAction={{
          label: 'Untrain',
          onClick: mockAction('untrain units'),
        }}
        clearAction={{ label: 'Clear all', onClick: () => setVisible(false) }}
        hint="Untraining refunds 75% of the unit cost."
        locale="en-US"
      />
    </Stack>
  );
}

/* ------------------------------------------------------------------ */
/* Battle simulator army form (/battle/battleSimulator)                */
/* ------------------------------------------------------------------ */

const MOCK_ATTACKER: SimulatorUser = new MockUserGenerator()
  .setBasicInfo({ display_name: 'Attacker', race: 'GOBLIN', class: 'FIGHTER' })
  .setExperience(48_000)
  .setFortLevel(4)
  .setStructureUpgrade('OFFENSE', 3)
  .setStructureUpgrade('ARMORY', 3)
  .getUser();

/* ------------------------------------------------------------------ */
/* News composer (/community/news)                                     */
/* ------------------------------------------------------------------ */

const STARTER_DRAFT: NewsDraft = {
  title: 'The Ashen Court marches at dawn',
  content: `## Orders of the day

Scouts report **three** warbands gathering by the river.

- Raise the fort walls
- Train sentries before nightfall

> Hold the line, and the line holds you.`,
};

function NewsComposerDemo() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NewsDraft>(STARTER_DRAFT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = () => {
    setIsSubmitting(true);
    setError('');
    window.setTimeout(() => {
      setIsSubmitting(false);
      if (draft.title.toLowerCase().includes('error')) {
        setError('Mock error: the dispatch could not be published.');
        return;
      }
      mockAction(`publish "${draft.title}"`)();
      setOpen(false);
    }, 700);
  };

  // The real page keeps the composer closed until "Write a post" is pressed;
  // it also autofocuses its title field, so opening on demand avoids
  // scrolling the showcase on load.
  if (!open) {
    return (
      <Group>
        <Button onClick={() => setOpen(true)}>Write a post</Button>
        <Text size="xs" c="var(--ot-muted)">
          Include &quot;error&quot; in the title to preview the failure state.
        </Text>
      </Group>
    );
  }
  return (
    <NewsComposer
      draft={draft}
      onDraftChange={setDraft}
      isSubmitting={isSubmitting}
      error={error}
      onSubmit={submit}
      onClose={() => setOpen(false)}
    />
  );
}

/* ------------------------------------------------------------------ */

export default function FormsSection() {
  return (
    <ShowcaseSection
      id="forms"
      title="Forms & orders"
      description="Quantity controls, order bars and planners with local state. Submitting only raises a mock notice."
    >
      <Specimen
        name="QuantitySlider"
        usedOn={['/battle/users', '/userprofile/[id]']}
        note="Inside the attack and spy mission modals. Normal range, a minimum above one, and an unavailable range (max below min)."
      >
        <QuantitySliders />
      </Specimen>

      <Specimen
        name="QuantityInput"
        usedOn={[
          '/battle/training',
          '/battle/upgrades',
          '/structures/armory/[tab]',
          '/structures/bank/[tab]',
          '/structures/repair',
        ]}
        note="One quantity field with one Max shortcut. Row form (hidden label), armory form with a Max tooltip on a disabled button and an All owned shortcut, labelled bank form with a BigInt over-cap error, a bounded repair form (type above 4,800 and blur to clamp), and a disabled locked row."
      >
        <QuantityInputs />
      </Specimen>

      <Specimen
        name="OrderSummaryBar"
        usedOn={['/battle/training', '/structures/armory/[tab]']}
        note="Hidden until shown: while visible it docks to the viewport bottom whenever its slot is off screen, as on the real pages. Clear all hides it."
      >
        <OrderSummaryDemo />
      </Specimen>

      <Specimen
        framed={false}
        name="ArmoryLoadoutPlanner + OrderSummaryBar"
        usedOn={['/structures/armory/[tab]']}
        note="Offense tab from the real item constants; armory level 3, 1,500 units, 85M gold, some tier-one stock owned."
        wide
      >
        <ArmoryOrderDemo />
      </Specimen>

      <Specimen
        name="ArmyInputForm"
        usedOn={['/battle/battleSimulator']}
        note="Fed by MockUserGenerator, as the simulator page is. Edits stay local."
        wide
      >
        <ArmyInputForm title="Attacker" armyData={MOCK_ATTACKER} attacker />
      </Specimen>

      <Specimen
        framed={false}
        name="NewsComposer"
        usedOn={['/community/news']}
        note="Draft held locally; submit simulates a short publish delay."
        wide
      >
        <NewsComposerDemo />
      </Specimen>

      <Specimen
        name="Training unit rows (NewUnitSection)"
        usedOn={['/battle/training']}
        note="Skipped: NewUnitSection calls useActiveGameEvents, which fetches /api/events/active on render."
      >
        <Text size="sm" c="var(--ot-muted)">
          Not rendered here; see the OrderSummaryBar specimen for the training
          order bar.
        </Text>
      </Specimen>
    </ShowcaseSection>
  );
}
