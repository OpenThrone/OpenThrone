// src/components/SidebarSkeleton.tsx
import { List, Paper, Skeleton, Stack, Text, Title } from '@mantine/core';
import React from 'react';

const SidebarSkeleton: React.FC = () => {
  return (
    <div className="block sm:block">
      {/* Mimic the scroll/background container */}
      <Paper p="md" mt="sm" withBorder style={{ backgroundColor: 'rgba(181, 165, 101, 0.8)' /* Approx advisor color */ }}>
        <Stack gap="md">
          {/* Advisor Title Skeleton */}
          <Skeleton height={20} width="50%" mx="auto" mb="xs" />
          {/* Advisor Message Skeleton */}
          <Skeleton height={8} radius="xl" />
          <Skeleton height={8} mt={6} radius="xl" />
          <Skeleton height={8} mt={6} width="70%" radius="xl" mb="md" />

          {/* Stats Title Skeleton */}
          <Skeleton height={16} width="40%" mx="auto" mb="xs" />
          {/* Stats List Skeleton */}
          <List gap="xs" size="sm">
            {[...Array(7)].map((_, index) => (
              <List.Item key={`stat-${index}`}>
                <Skeleton height={10} width={`${Math.random() * 30 + 60}%`} radius="sm" />
              </List.Item>
            ))}
          </List>

          {/* Search Title Skeleton */}
          <Skeleton height={16} width="30%" mx="auto" mt="md" mb="xs" />
          {/* Search Input Skeleton */}
          <Skeleton height={36} mb="sm" />
          {/* Search Button Skeleton */}
          <Skeleton height={36} width="40%" mx="auto" />
        </Stack>
      </Paper>
    </div>
  );
};

export default SidebarSkeleton;