import React, { useEffect, useState, useCallback } from "react";
import Alert from "@/components/alert";
import {
  Text,
  Grid
} from "@mantine/core";
import { PermissionType } from '@prisma/client';
import PermissionCheck from "@/components/PermissionCheck";
import GrantUserForm from "@/components/GrantUserForm";

const Admin = (props) => {
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
      <PermissionCheck permission={PermissionType.ADMINISTRATOR}>
      <Grid gutter="lg">
        <Grid.Col span={6}>
          <PermissionCheck permission={PermissionType.ADMINISTRATOR}>
            <GrantUserForm />
          </PermissionCheck>
          
        </Grid.Col>
        </Grid>
      </PermissionCheck>
    </div>
  );

};

export default Admin;
