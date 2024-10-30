import { useUser } from "@/context/users";
import { Text } from "@mantine/core";
import Alert from "./alert";
import { PermissionType } from "@prisma/client";

const PermissionCheck = ({ children, permission }) => {
  const { user } = useUser();

  if (!user?.permissions?.some((perm) => perm.type === permission)) {
    return (
      <div>
        <Text style={{ background: 'linear-gradient(360deg, orange, darkorange)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '1.5rem', fontWeight: 'bold' }}>
          Permission Denied
        </Text>
        <Text>You do not have sufficient permissions to access this page.</Text>
      </div>
    );
  }

  return <>{children}</>;
};

export default PermissionCheck;