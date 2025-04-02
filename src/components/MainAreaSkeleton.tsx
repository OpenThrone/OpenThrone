// src/components/MainAreaSkeleton.tsx
import { Container, Group, Skeleton, Stack, Title } from '@mantine/core';
import React from 'react';

const MainAreaSkeleton: React.FC = () => {
  return (
    <div className="mainArea pb-10 w-full">
      {/* Header Skeleton */}
      <header style={{ height: '56px', borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Container size="lg" style={{ height: '56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Title Skeleton */}
          <Skeleton height={24} width="30%" />
          {/* Action Icons Skeleton */}
          <Group gap={'lg'} visibleFrom='md'>
            <Skeleton height={20} circle />
            <Skeleton height={20} circle />
            <Skeleton height={20} circle />
          </Group>
        </Container>
      </header>

      {/* Spacer */}
      <div style={{ height: 'var(--mantine-spacing-md)' }} />

      {/* Main Content Area Skeleton */}
      <Stack gap="lg" p="md">
        {/* Simulate a few paragraphs or content blocks */}
        <Skeleton height={12} mt={6} radius="xl" />
        <Skeleton height={12} mt={6} radius="xl" />
        <Skeleton height={12} mt={6} width="70%" radius="xl" />
        <Skeleton height={150} mt="md" /> {/* Larger block for bigger content */}
        <Skeleton height={12} mt={6} radius="xl" />
        <Skeleton height={12} mt={6} width="85%" radius="xl" />
      </Stack>
    </div>
  );
};

export default MainAreaSkeleton;