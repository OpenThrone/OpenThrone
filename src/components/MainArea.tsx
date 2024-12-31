import React, { forwardRef } from 'react';
import { Space, Group, SimpleGrid } from '@mantine/core';
import Alert from './alert';
import { alertService } from '../services/alert.service';

interface MainAreaProps {
  title: string;
  children: React.ReactNode;
  paperWidth?: { sm: string; md: string };
  parentRef?: React.RefObject<HTMLDivElement>;
}

const MainArea = forwardRef<HTMLDivElement, MainAreaProps>(
  function MainArea({ title, children, parentRef}) {
    return (
      <div className="mainArea pb-10 w-full" ref={parentRef || null}>
        <h2 className="text-gradient-orange bg-orange-gradient text-shadow text-shadow-xs">
          {title}
        </h2>
        <Space h="md" />
          <SimpleGrid cols={1}>
          {alertService.alert && (
            <Group grow>
              <Alert />
            </Group>
            )}
          </SimpleGrid>
        <Space h="md" />
        {children}
      </div>
    );
  }
);

export default MainArea;
