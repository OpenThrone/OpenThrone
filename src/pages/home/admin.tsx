import React, { useEffect, useState, useCallback } from "react";
import Alert from "@/components/alert";
import { raceClasses, useLayout } from "@/context/LayoutContext";
import { useUser } from "@/context/users";
import { alertService } from "@/services";
import { Locales, PlayerRace } from "@/types/typings";
import {
  Modal,
  Button,
  TextInput,
  Select,
  Collapse,
  Group,
  PasswordInput,
  Space,
  Card,
  Text,
  Grid
} from "@mantine/core";
import { useDisclosure, useDebouncedValue } from "@mantine/hooks";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faMinus } from "@fortawesome/free-solid-svg-icons";
import { PermissionType } from '@prisma/client';

const Admin = (props) => {
  const { user, forceUpdate } = useUser();

  if (!user?.permissions?.some((perm) => perm.type === PermissionType.ADMINISTRATOR)) {
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
        <Alert />
        <Text>
          You do not have sufficient permissions to access this page.
        </Text>
      </div>
    );
  }

  const [grantUser, setGrantUser] = useState('');
  const [grantLevel, setGrantLevel] = useState(PermissionType.ADMINISTRATOR);

  const grantUserPermission = async () => {
    if (!Object.keys(PermissionType).some((perm) => perm === grantLevel)) {
      // Attempted to set a permission type that doesn't exist, fail
      return;
    }

    const response = await fetch('/api/admin/grantPermission', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user: grantUser,
        permission: grantLevel,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      alertService.success('Sucessfully granted ' + user.display_name + ' permission level ' + grantLevel);
      setGrantUser('');
      setGrantLevel(PermissionType.ADMINISTRATOR);
    } else {
      alertService.error(data.error);
    }
  };

  return (
    <div className="mainArea pb-10">
      <Text
        style={{
          background: 'linear-gradient(360deg, orange, darkorange)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontSize: '1.5rem',
          fontWeight: 'bold',
        }}
      >
        Administration
      </Text>
      <Alert />
      <Grid gutter="lg">
        <Grid.Col span={6}>
          <Card shadow="sm" padding="lg" style={{ backgroundColor: '#1A1B1E' }}>
            <Text size="xl" fw='bolder'>Grant user</Text>
            <Text>The user you want to grant permissions</Text>
            <TextInput
              value={grantUser}
              onChange={(e) => setGrantUser(e.target.value)}
              className={raceClasses.bgClass}
            />
            <Select
              data={Object.keys(PermissionType).map((permType) => ({ value: permType, label: PermissionType[permType]}))}
              value={grantLevel}
              onChange={setGrantLevel}
              className={raceClasses.bgClass}
            />
            <Button
              className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
              onClick={grantUserPermission}
            >
              Save
            </Button>
          </Card>
        </Grid.Col>
      </Grid>
    </div>
  );

};

export default Admin;
