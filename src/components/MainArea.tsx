import React, { forwardRef } from 'react';
import { Space, Center, Paper, Group } from '@mantine/core';
import Alert from './alert';

interface MainAreaProps {
  title: string;
  children: React.ReactNode;
  paperWidth?: { sm: string; md: string };
  parentRef?: React.RefObject<HTMLDivElement>;
}

const MainArea = forwardRef<HTMLDivElement, MainAreaProps>(
  function MainArea({ title, children, parentRef}) {
    return (
      <div className="mainArea pb-10" ref={parentRef || null}>
        <h2 className="text-gradient-orange bg-orange-gradient text-shadow text-shadow-xs">
          {title}
        </h2>
        <Space h="md" />
        <Center>
          {alert && (
            <Group grow>
              <Alert />
            </Group>
          )}
        </Center>

        <Space h="md" />
        {children}
      </div>
    );
  }
);

export default MainArea;
