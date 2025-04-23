// src/components/NavSkeleton.tsx
import { Group, Skeleton } from '@mantine/core';
import React from 'react';

const NavSkeleton: React.FC = () => {
  return (
    <div>
      {/* Top Tier Nav Skeleton */}
      <div className="h-10 bg-gray-800 md:block"> {/* Use a placeholder background */}
        <div className="mx-auto max-w-screen-lg md:block justify-center">
          <Group justify="center" align="center" className="h-full">
            {[...Array(5)].map((_, index) => ( // Adjust count based on parent links
              <Skeleton key={`nav-top-${index}`} height={12} width={80} radius="sm" />
            ))}
            <Skeleton key="nav-top-signout" height={12} width={60} radius="sm" />
          </Group>
        </div>
      </div>
      {/* Bottom Tier Nav Skeleton */}
      <div className="h-10 bg-gray-700 md:block"> {/* Use a placeholder background */}
        <div className="mx-auto max-w-screen-lg md:block justify-center">
          <Group justify="center" align="center" className="h-full">
            {[...Array(4)].map((_, index) => ( // Adjust count based on typical sub links
              <Skeleton key={`nav-bottom-${index}`} height={10} width={100} radius="sm" />
            ))}
          </Group>
        </div>
      </div>
    </div>
  );
};

export default NavSkeleton;