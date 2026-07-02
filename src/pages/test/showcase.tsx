import { faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Box, Divider, SimpleGrid, Space, Text, Title } from '@mantine/core';

import { NeumorphicTable } from '@/components/NumericTable';
import { OrnatePanel } from '@/components/OrnatePanel';
import { PaperTable } from '@/components/PaperTable';
import StatCard from '@/components/StatCard';
import TabbedContent from '@/components/TabbedContent';

import MainArea from '../../components/MainArea';

const SECTIONS = [
  {
    title: 'NumericTable (NeumorphicTable)',
    description:
      'Demo table with neumorphic / themed row styling. Currently renders hardcoded periodic-table data. Intended as a UI exploration — not wired to game data.',
    status: 'Showcase only',
  },
  {
    title: 'PaperTable',
    description:
      'Demo table with paper/noise texture background and themed variant. Same as NumericTable — hardcoded data, UI exploration only.',
    status: 'Showcase only',
  },
  {
    title: 'OrnatePanel',
    description:
      'Wraps children in a decorative frame using /assets/images/ui/battle-report/frames/panel-frame-blue.webp. Use for battle results, quest panels, or any section needing a premium RPG frame.',
    status: 'Ready to integrate',
  },
  {
    title: 'StatCard',
    description:
      'RPG-styled stat card with title, value, icon, and variants (default, highlight, pulse). Has hover animations and medieval styling.',
    status: 'Ready to integrate',
  },
  {
    title: 'TabbedContent',
    description:
      'Simple tab container with yellow RPG-styled active tab indicator. Accepts an array of { label, content } tabs.',
    status: 'Ready to integrate',
  },
];

/** Component showcase. */
export default function ComponentShowcase() {
  return (
    <MainArea title="Component Showcase">
      <div className="mx-auto w-full max-w-7xl space-y-8 p-4">
        <Box>
          <Title order={2} c="yellow">
            Unused Component Gallery
          </Title>
          <Text size="sm" c="dimmed" mt="xs">
            Components detected as unused by knip. Each card shows the component
            rendered live, its purpose, and its integration status.
          </Text>
        </Box>

        <Divider label="Showcase Components" labelPosition="center" />

        <ShowcaseSection
          title={SECTIONS[0].title}
          description={SECTIONS[0].description}
          status={SECTIONS[0].status}
        >
          <NeumorphicTable tone="themed" />
        </ShowcaseSection>

        <ShowcaseSection
          title={SECTIONS[1].title}
          description={SECTIONS[1].description}
          status={SECTIONS[1].status}
        >
          <PaperTable tone="themed" />
        </ShowcaseSection>

        <Divider label="Ready to Integrate" labelPosition="center" />

        <ShowcaseSection
          title={SECTIONS[2].title}
          description={SECTIONS[2].description}
          status={SECTIONS[2].status}
        >
          <OrnatePanel minHeight={120}>
            <Text c="white" ta="center">
              Content inside the ornate panel frame.
            </Text>
          </OrnatePanel>
        </ShowcaseSection>

        <ShowcaseSection
          title={SECTIONS[3].title}
          description={SECTIONS[3].description}
          status={SECTIONS[3].status}
        >
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <StatCard
              title="Offense"
              value={42500}
              icon={<FontAwesomeIcon icon={faShieldHalved} />}
            />
            <StatCard
              title="Gold"
              value="8,450,200"
              icon={<Text>🪙</Text>}
              variant="highlight"
              subtext="+2% daily bonus"
            />
            <StatCard
              title="Alert"
              value="New Attack"
              icon={<Text>⚔️</Text>}
              variant="pulse"
            />
          </SimpleGrid>
        </ShowcaseSection>

        <ShowcaseSection
          title={SECTIONS[4].title}
          description={SECTIONS[4].description}
          status={SECTIONS[4].status}
        >
          <TabbedContent
            tabs={[
              {
                label: 'Offense',
                content: (
                  <Text c="gray.3">
                    Train offense units and upgrade weapons.
                  </Text>
                ),
              },
              {
                label: 'Defense',
                content: (
                  <Text c="gray.3">Fortify walls and train defenders.</Text>
                ),
              },
              {
                label: 'Spy',
                content: (
                  <Text c="gray.3">Send spies and gather intelligence.</Text>
                ),
              },
            ]}
          />
        </ShowcaseSection>
      </div>
    </MainArea>
  );
}

function ShowcaseSection({
  title,
  description,
  status,
  children,
}: {
  title: string;
  description: string;
  status: string;
  children: React.ReactNode;
}) {
  const statusColor =
    status === 'Showcase only' ? 'text-gray-400' : 'text-green-400';

  return (
    <Box>
      <div className="mb-2 flex items-baseline justify-between">
        <Title order={4} c="yellow">
          {title}
        </Title>
        <Text size="xs" className={statusColor}>
          {status}
        </Text>
      </div>
      <Text size="sm" c="dimmed" mb="md">
        {description}
      </Text>
      <div className="rounded border border-gray-700 bg-gray-900/50 p-4">
        {children}
      </div>
      <Space h="lg" />
    </Box>
  );
}
