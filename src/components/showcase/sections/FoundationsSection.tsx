import { faGear, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Accordion,
  ActionIcon,
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Checkbox,
  Divider,
  Group,
  Indicator,
  Kbd,
  Menu,
  MultiSelect,
  NavLink,
  NumberInput,
  Pagination,
  PasswordInput,
  Popover,
  Radio,
  SegmentedControl,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useState } from 'react';

import panelClasses from '@/components/game/Panels.module.css';
import { SectionHeading } from '@/components/game/SectionHeading';
import { TabBar } from '@/components/game/TabBar';
import RpgAwesomeIcon from '@/components/RpgAwesomeIcon';
import { formatGold } from '@/utils/numberFormatting';

import { mockAction, ShowcaseSection, Specimen } from '../Showcase';
import classes from '../Showcase.module.css';

const OT_TOKENS = [
  '--ot-accent',
  '--ot-heading',
  '--ot-text',
  '--ot-body',
  '--ot-muted',
  '--ot-border',
  '--ot-line',
  '--ot-surface',
  '--ot-surface-2',
  '--ot-inset',
  '--ot-panel',
  '--ot-brand',
  '--ot-brand-text',
];

const RAMP_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const BUTTON_VARIANTS = [
  'filled',
  'outline',
  'light',
  'subtle',
  'default',
] as const;

const ACTION_ICON_VARIANTS = [
  'filled',
  'outline',
  'light',
  'subtle',
  'default',
  'transparent',
] as const;

/** RPG Awesome names the game renders (nav, sidebar, profile, reports). */
const GAME_ICONS = [
  'gold-bar',
  'double-team',
  'player',
  'crossed-swords',
  'tower',
  'hourglass',
  'clockwork',
  'two-hearts',
  'castle-flag',
  'trophy',
  'skull',
  'scroll-unfurled',
  'quill-ink',
  'hood',
  'castle',
  'sword',
  'shield',
  'crown',
  'archery-target',
  'anvil',
  'abacus',
  'banknote',
  'spiked-shield',
  'speech-bubble',
];

const UNIT_OPTIONS = ['Worker', 'Offense', 'Defense', 'Spy', 'Sentry'];

function Swatch({ variable }: { variable: string }) {
  return (
    <Stack gap={4}>
      <div
        className={classes.swatch}
        style={{ background: `var(${variable})` }}
      />
      <Text size="xs" ff="monospace" c="var(--ot-muted)">
        {variable}
      </Text>
    </Stack>
  );
}

/** Tokens, type, controls and icons every other section is built from. */
export default function FoundationsSection() {
  const [name, setName] = useState('Gorbash');
  const [password, setPassword] = useState('');
  const [amount, setAmount] = useState<string | number>(1500);
  const [motto, setMotto] = useState('');
  const [unit, setUnit] = useState<string | null>('Offense');
  const [targets, setTargets] = useState<string[]>(['Offense', 'Spy']);
  const [agree, setAgree] = useState(true);
  const [vacation, setVacation] = useState(false);
  const [race, setRace] = useState('HUMAN');
  const [range, setRange] = useState('day');
  const [turns, setTurns] = useState(5);
  const [page, setPage] = useState(2);
  const [navActive, setNavActive] = useState('overview');
  const [tabBarValue, setTabBarValue] = useState('deposit');

  return (
    <ShowcaseSection
      id="foundations"
      title="Foundations"
      description="Theme tokens, typography and Mantine primitives as styled by the active race theme. Switch the race above to see every swatch and control retint."
    >
      <Specimen
        name="Colour tokens"
        usedOn={['src/styles/themes.tsx']}
        note="Read live from CSS variables, so they follow the race theme switch."
        wide
      >
        <Stack gap="md">
          <SimpleGrid cols={{ base: 2, sm: 4, md: 7 }} spacing="sm">
            {OT_TOKENS.map((variable) => (
              <Swatch key={variable} variable={variable} />
            ))}
          </SimpleGrid>
          <Text size="xs" c="var(--ot-muted)">
            Mantine brand ramp
          </Text>
          <SimpleGrid cols={{ base: 3, sm: 9 }} spacing="xs">
            {RAMP_STEPS.map((step) => (
              <Swatch key={step} variable={`--mantine-color-brand-${step}`} />
            ))}
          </SimpleGrid>
          <Text size="xs" c="var(--ot-muted)">
            Mantine secondary ramp
          </Text>
          <SimpleGrid cols={{ base: 3, sm: 9 }} spacing="xs">
            {RAMP_STEPS.map((step) => (
              <Swatch
                key={step}
                variable={`--mantine-color-secondary-${step}`}
              />
            ))}
          </SimpleGrid>
        </Stack>
      </Specimen>

      <Specimen
        name="Typography"
        usedOn={['global']}
        note="Headings: one page H1 in the MainArea title bar, then one GameCard title level per card; never repeat the page title on a card. Sections inside a card use SectionHeading (MedievalSharp, h3), never Mantine Title, which renders the blackletter page face. Public pages keep the MainArea bar; their PublicHero title is the H2 hero line. Muted text is var(--ot-muted), not c=dimmed. Success text is green.3 (the STAT_TONES good ramp). Gold: formatGold(amount, locale) from utils/numberFormatting, wrapped in common:currency.goldAmount for '{{amount}} gold' text; locale is user?.locale ?? i18n.language."
      >
        <Stack gap="xs">
          <Title order={1}>The Living Chronicle</Title>
          <Title order={2}>Battle Report</Title>
          <Title order={3}>Armory Upgrades</Title>
          <Title order={4}>Kingdom Overview</Title>
          <SectionHeading>
            Incoming requests (SectionHeading, in-card)
          </SectionHeading>
          <Text ff="MedievalSharp, serif" c="var(--ot-text)">
            Advisor&apos;s counsel
          </Text>
          <Text c="var(--ot-body)">
            Inter body copy for ledgers, forms and descriptions. Readable first,
            ornamental second.
          </Text>
          <Text c="var(--ot-muted)" size="sm">
            Muted helper text via --ot-muted, used for hints and timestamps.
          </Text>
          <Text c="green.3" size="sm">
            Success: recruitment complete.
          </Text>
          <Text style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatGold(1204880, 'en-US')} gold · Turns 45 · Level 12
          </Text>
          <Anchor href="#foundations">Anchor link to the chronicle</Anchor>
        </Stack>
      </Specimen>

      <Specimen
        name="Buttons"
        usedOn={['global']}
        note="Filled and outline get the fantasy frame from themes.tsx; others keep Mantine tints. Gradient is not used in game. Filled tones: plain filled (no color) for the main action, variant=default for the secondary action beside it, color=red for destructive (loses gold, units, data or access), color=green for positive. Never restyle a Button inline (background, border, colour); other colours stay gold, so omit them."
        wide
      >
        <Stack gap="md">
          <Group gap="sm">
            <Button onClick={mockAction('Primary')}>Primary</Button>
            <Button color="red" onClick={mockAction('Destructive')}>
              Destructive
            </Button>
            <Button color="green" onClick={mockAction('Positive')}>
              Positive
            </Button>
            <Button variant="default" onClick={mockAction('Cancel')}>
              Cancel
            </Button>
          </Group>
          <Group gap="sm">
            {BUTTON_VARIANTS.map((variant) => (
              <Button
                key={variant}
                variant={variant}
                onClick={mockAction(`${variant} button`)}
              >
                {variant}
              </Button>
            ))}
          </Group>
          <Group gap="sm" align="center">
            {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
              <Button
                key={size}
                size={size}
                onClick={mockAction(`size ${size}`)}
              >
                Size {size}
              </Button>
            ))}
          </Group>
          <Group gap="sm">
            <Button
              leftSection={<RpgAwesomeIcon icon="crossed-swords" fw />}
              onClick={mockAction('Attack')}
            >
              Attack
            </Button>
            <Button
              variant="outline"
              leftSection={<FontAwesomeIcon icon={faMagnifyingGlass} />}
              onClick={mockAction('Search')}
            >
              Search
            </Button>
            <Button loading onClick={mockAction('loading')}>
              Loading
            </Button>
            <Button disabled onClick={mockAction('disabled')}>
              Disabled
            </Button>
          </Group>
          <Group gap="sm">
            {ACTION_ICON_VARIANTS.map((variant) => (
              <Tooltip key={variant} label={`ActionIcon ${variant}`}>
                <ActionIcon
                  variant={variant}
                  size="lg"
                  aria-label={`Settings (${variant})`}
                  onClick={mockAction(`ActionIcon ${variant}`)}
                >
                  <FontAwesomeIcon icon={faGear} />
                </ActionIcon>
              </Tooltip>
            ))}
          </Group>
        </Stack>
      </Specimen>

      <Specimen
        name="Inset row"
        usedOn={[
          '/structures/housing',
          '/home/overview',
          '/home/levels',
          '/battle/training',
          '/battle/upgrades',
          '/alliances/browse',
          '/battle/results/[id]',
        ]}
        note="panelClasses.insetRow (game/Panels.module.css): the one sunken ledger-row surface from --ot-inset and --ot-line. Surface only; lay out the contents with Group or Stack. data-disabled dims a locked row. Rows inside StyledTable take the table's own styling instead."
        wide
      >
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <Group justify="space-between" className={panelClasses.insetRow}>
            <Text size="sm" c="dimmed">
              New citizens per day
            </Text>
            <Text fw={600}>1,250</Text>
          </Group>
          <Group
            justify="space-between"
            wrap="nowrap"
            className={panelClasses.insetRow}
          >
            <Stack gap={0}>
              <Text size="xs" c="dimmed" tt="uppercase">
                Members
              </Text>
              <Text fw={700}>24</Text>
            </Stack>
            <Button size="xs" onClick={mockAction('Inset row action')}>
              Buy
            </Button>
          </Group>
          <Group
            justify="center"
            className={panelClasses.insetRow}
            data-disabled
          >
            <Text size="sm" c="dimmed">
              Unlocked with Siege Workshop II
            </Text>
          </Group>
        </SimpleGrid>
      </Specimen>

      <Specimen name="Inputs" usedOn={['/account', '/structures/bank']} wide>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          <TextInput
            label="Display name"
            description="Shown to other rulers"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <TextInput
            label="Email"
            defaultValue="not-an-email"
            error="Enter a valid email address"
          />
          <PasswordInput
            label="Password"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
          <NumberInput
            label="Gold to deposit"
            thousandSeparator=","
            min={0}
            value={amount}
            onChange={setAmount}
          />
          <Textarea
            label="Kingdom motto"
            placeholder="Strength through stone"
            autosize
            minRows={2}
            value={motto}
            onChange={(event) => setMotto(event.currentTarget.value)}
          />
          <Select
            label="Unit type"
            data={UNIT_OPTIONS}
            value={unit}
            onChange={setUnit}
          />
          <MultiSelect
            label="Units to train"
            data={UNIT_OPTIONS}
            value={targets}
            onChange={setTargets}
          />
          <Stack gap="sm">
            <Checkbox
              label="I accept the rules of war"
              checked={agree}
              onChange={(event) => setAgree(event.currentTarget.checked)}
            />
            <Switch label="Enabled switch" checked readOnly />
            <Switch label="Off switch" checked={false} readOnly />
            <Switch label="Unavailable switch (on)" checked disabled />
            <Switch label="Unavailable switch (off)" checked={false} disabled />
            <Switch
              label="Vacation mode"
              checked={vacation}
              onChange={(event) => setVacation(event.currentTarget.checked)}
            />
          </Stack>
          <Radio.Group label="Race" value={race} onChange={setRace}>
            <Group gap="sm" mt={4}>
              {['ELF', 'HUMAN', 'UNDEAD', 'GOBLIN'].map((value) => (
                <Radio key={value} value={value} label={value} />
              ))}
            </Group>
          </Radio.Group>
          <Stack gap={4}>
            <Text size="sm" id="showcase-range-label">
              History range
            </Text>
            <SegmentedControl
              aria-labelledby="showcase-range-label"
              value={range}
              onChange={setRange}
              data={[
                { label: 'Day', value: 'day' },
                { label: 'Week', value: 'week' },
                { label: 'Era', value: 'era' },
              ]}
            />
          </Stack>
          <Stack gap={4}>
            <Text size="sm" id="showcase-turns-label">
              Attack turns: {turns}
            </Text>
            <Slider
              aria-labelledby="showcase-turns-label"
              min={1}
              max={10}
              value={turns}
              onChange={setTurns}
              marks={[
                { value: 1, label: '1' },
                { value: 10, label: '10' },
              ]}
            />
          </Stack>
        </SimpleGrid>
      </Specimen>

      <Specimen
        name="TabBar"
        usedOn={[
          '/structures/bank/[tab]',
          '/structures/upgrades/[tab]',
          '/structures/armory/[tab]',
        ]}
        note="game/TabBar: the one routed in-page tab bar, grown pill tabs in an rpg-inset well. Pages pass value, tabs and a router.push onChange; the content renders below it."
        wide
      >
        <TabBar
          value={tabBarValue}
          tabs={[
            { value: 'deposit', label: 'Deposit' },
            { value: 'history', label: 'History' },
            { value: 'economy', label: 'Economy' },
          ]}
          onChange={setTabBarValue}
        />
      </Specimen>

      <Specimen name="Navigation primitives" usedOn={['global']} wide>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <Stack gap="md">
            <Tabs defaultValue="offense">
              <Tabs.List>
                <Tabs.Tab value="offense">Offense</Tabs.Tab>
                <Tabs.Tab value="defense">Defense</Tabs.Tab>
                <Tabs.Tab value="spy">Spy</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="offense" pt="xs">
                <Text size="sm">Offense units panel.</Text>
              </Tabs.Panel>
              <Tabs.Panel value="defense" pt="xs">
                <Text size="sm">Defense units panel.</Text>
              </Tabs.Panel>
              <Tabs.Panel value="spy" pt="xs">
                <Text size="sm">Spy units panel.</Text>
              </Tabs.Panel>
            </Tabs>
            <Tabs defaultValue="inbox" variant="outline">
              <Tabs.List>
                <Tabs.Tab value="inbox">Inbox</Tabs.Tab>
                <Tabs.Tab value="sent">Sent</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="inbox" pt="xs">
                <Text size="sm">Outline tabs.</Text>
              </Tabs.Panel>
              <Tabs.Panel value="sent" pt="xs">
                <Text size="sm">Sent messages.</Text>
              </Tabs.Panel>
            </Tabs>
            <Group gap="sm">
              <Menu shadow="md" width={200}>
                <Menu.Target>
                  <Button variant="default">Open menu</Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Player</Menu.Label>
                  <Menu.Item
                    leftSection={<RpgAwesomeIcon icon="crossed-swords" fw />}
                    onClick={mockAction('Menu: Attack')}
                  >
                    Attack
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<RpgAwesomeIcon icon="hood" fw />}
                    onClick={mockAction('Menu: Spy')}
                  >
                    Spy
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item color="red" onClick={mockAction('Menu: Block')}>
                    Block player
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
              <Tooltip label="Tooltips explain icon-only controls">
                <Button variant="subtle" onClick={mockAction('Tooltip target')}>
                  Hover me
                </Button>
              </Tooltip>
              <Popover width={220} withArrow>
                <Popover.Target>
                  <Button variant="light">Popover</Button>
                </Popover.Target>
                <Popover.Dropdown>
                  <Text size="sm">
                    Popovers carry stat descriptions on ledger headers.
                  </Text>
                </Popover.Dropdown>
              </Popover>
            </Group>
            <Pagination total={12} value={page} onChange={setPage} />
          </Stack>
          <Stack gap="md">
            <Breadcrumbs>
              <Anchor href="#foundations">Home</Anchor>
              <Anchor href="#foundations">Battle</Anchor>
              <Text size="sm">Users</Text>
            </Breadcrumbs>
            <Accordion variant="separated" defaultValue="rules">
              <Accordion.Item value="rules">
                <Accordion.Control>Rules of engagement</Accordion.Control>
                <Accordion.Panel>
                  <Text size="sm">
                    Attacks cost turns; protection ends at level 5.
                  </Text>
                </Accordion.Panel>
              </Accordion.Item>
              <Accordion.Item value="bank">
                <Accordion.Control>Bank deposits</Accordion.Control>
                <Accordion.Panel>
                  <Text size="sm">Deposited gold cannot be stolen.</Text>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
            <Stack gap={0}>
              {[
                { key: 'overview', label: 'Overview', icon: 'castle' },
                { key: 'training', label: 'Training', icon: 'double-team' },
                { key: 'armory', label: 'Armory', icon: 'anvil' },
              ].map((item) => (
                <NavLink
                  key={item.key}
                  label={item.label}
                  leftSection={<RpgAwesomeIcon icon={item.icon} fw />}
                  active={navActive === item.key}
                  onClick={() => setNavActive(item.key)}
                />
              ))}
            </Stack>
            <Divider label="Divider with label" labelPosition="center" />
          </Stack>
        </SimpleGrid>
      </Specimen>

      <Specimen name="Badges and status" usedOn={['/battle/users', 'header']}>
        <Stack gap="md">
          <Group gap="xs">
            <Badge color="green">Online</Badge>
            <Badge color="red" variant="filled">
              PvP zone
            </Badge>
            <Badge color="yellow">New</Badge>
            <Badge color="red" variant="filled" size="xs">
              Urgent
            </Badge>
            <Badge color="pink">Admin</Badge>
            <Badge variant="light" color="gray" tt="none">
              Level 12
            </Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="dot" color="teal">
              Protected
            </Badge>
          </Group>
          <Group gap="lg" align="center">
            <Indicator label="3" size={16} color="red">
              <ActionIcon
                variant="default"
                size="lg"
                aria-label="Messages, 3 unread"
                onClick={mockAction('Open messages')}
              >
                <RpgAwesomeIcon icon="speech-bubble" />
              </ActionIcon>
            </Indicator>
            <Indicator processing color="green" size={10}>
              <ActionIcon
                variant="default"
                size="lg"
                aria-label="Friends online"
                onClick={mockAction('Open friends')}
              >
                <RpgAwesomeIcon icon="two-hearts" />
              </ActionIcon>
            </Indicator>
            <Text size="sm">
              Search <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd>
            </Text>
          </Group>
        </Stack>
      </Specimen>

      <Specimen
        name="Iconography"
        usedOn={['nav', 'sidebar', 'profile']}
        note="RPG Awesome names used in game. 'experience' and 'flag' are referenced in src but do not exist in the icon font, so they are omitted."
        wide
      >
        <SimpleGrid cols={{ base: 3, sm: 6, md: 8 }} spacing="sm">
          {GAME_ICONS.map((icon) => (
            <Stack key={icon} gap={4} align="center">
              <RpgAwesomeIcon
                icon={icon}
                size="2x"
                color="var(--ot-accent)"
                aria-hidden
              />
              <Text size="xs" ff="monospace" c="var(--ot-muted)" ta="center">
                {icon}
              </Text>
            </Stack>
          ))}
        </SimpleGrid>
      </Specimen>
    </ShowcaseSection>
  );
}
