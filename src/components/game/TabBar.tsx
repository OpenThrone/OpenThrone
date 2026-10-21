import { Box, Tabs } from '@mantine/core';

export interface TabBarItem {
  value: string;
  label: string;
}

export interface TabBarProps {
  value: string;
  tabs: TabBarItem[];
  onChange: (value: string) => void;
}

/** The one in-page tab bar: grown pill tabs in a sunken `rpg-inset` well. */
export function TabBar({ value, tabs, onChange }: TabBarProps) {
  return (
    <Box className="rpg-inset" p="xs" style={{ borderRadius: '6px' }}>
      <Tabs
        value={value}
        onChange={(next) => {
          if (next) onChange(next);
        }}
        variant="pills"
      >
        <Tabs.List grow justify="center">
          {tabs.map((tab) => (
            <Tabs.Tab key={tab.value} value={tab.value}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
    </Box>
  );
}
