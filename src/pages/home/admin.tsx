import React, { useEffect, useState, useCallback } from "react";
import Alert from "@/components/alert";
import {
  Text,
  Grid
} from "@mantine/core";
import { PermissionType } from '@prisma/client';
import PermissionCheck from "@/components/PermissionCheck";
import GrantUserForm from "@/components/GrantUserForm";
import MainArea from "@/components/MainArea";

const Admin = (props) => {
  return (
    <MainArea title="Admin">
      <PermissionCheck permission={PermissionType.ADMINISTRATOR}>
      <Grid gutter="lg">
        <Grid.Col span={6}>
          <PermissionCheck permission={PermissionType.ADMINISTRATOR}>
            <GrantUserForm />
          </PermissionCheck>
          
        </Grid.Col>
        </Grid>
      </PermissionCheck>
    </MainArea>
  );

};

export default Admin;
