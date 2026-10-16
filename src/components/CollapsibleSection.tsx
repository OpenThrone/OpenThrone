import { Accordion } from '@mantine/core';
import type React from 'react';

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultOpen = false,
}) => (
  <Accordion
    defaultValue={defaultOpen ? 'section' : null}
    styles={{
      control: { color: 'var(--ot-heading)' },
      item: { borderColor: 'var(--ot-line)' },
    }}
  >
    <Accordion.Item value="section">
      <Accordion.Control>{title}</Accordion.Control>
      <Accordion.Panel>{children}</Accordion.Panel>
    </Accordion.Item>
  </Accordion>
);

export default CollapsibleSection;
