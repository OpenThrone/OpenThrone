import { Tabs } from '@mantine/core';
import type React from 'react';

interface Tab {
  label: string;
  content: React.ReactNode;
}
interface TabbedContentProps {
  tabs: Tab[];
}

/** Compatibility wrapper around the shared Mantine tab system. */
const TabbedContent: React.FC<TabbedContentProps> = ({ tabs }) => (
  <Tabs defaultValue={tabs.length ? '0' : null} keepMounted={false}>
    <Tabs.List>
      {tabs.map((tab, index) => (
        <Tabs.Tab key={tab.label} value={String(index)}>
          {tab.label}
        </Tabs.Tab>
      ))}
    </Tabs.List>
    {tabs.map((tab, index) => (
      <Tabs.Panel key={tab.label} value={String(index)} pt="md">
        {tab.content}
      </Tabs.Panel>
    ))}
  </Tabs>
);

export default TabbedContent;
