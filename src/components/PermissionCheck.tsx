import { Text } from '@mantine/core';
import { PermissionType } from '@prisma/client';

import { useUser } from '@/context/users';

interface PermissionCheckProps {
  children: React.ReactNode;
  permission?: PermissionType;
  permissions?: PermissionType[];
  requireAll?: boolean;
}

const PermissionCheck = ({
  children,
  permission,
  permissions,
  requireAll = false,
}: PermissionCheckProps) => {
  const { user } = useUser();

  const userPerms =
    user?.permissions?.map((p) => p.type as PermissionType) ?? [];

  let hasAccess = false;

  if (permission) {
    hasAccess = userPerms.includes(permission);
  } else if (permissions && permissions.length > 0) {
    hasAccess = requireAll
      ? permissions.every((p) => userPerms.includes(p))
      : permissions.some((p) => userPerms.includes(p));
  } else {
    hasAccess = userPerms.length > 0;
  }

  if (!hasAccess) {
    return (
      <div>
        <Text
          style={{
            background: 'linear-gradient(360deg, orange, darkorange)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontSize: '1.5rem',
            fontWeight: 'bold',
          }}
        >
          Permission Denied
        </Text>
        <Text>You do not have sufficient permissions to access this page.</Text>
      </div>
    );
  }

  return <>{children}</>;
};

export default PermissionCheck;
