import React from 'react';
import { Space, Center, Paper, Group } from '@mantine/core';
import Alert from './alert';

const MainArea = ({ title, children, paperWidth = { sm: '100%', md: '80%' } }) => {
  return (
    <div className="mainArea pb-10">
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
};

export default MainArea;
