import React, { useState, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Table, NumberInput, Select, Title, Paper, Stack, Tabs, Grid, Text, Tooltip, Group, Button, Box } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import ArmyPresets from '@/components/ArmyPresets';
import ItemsInputForm from './ItemsInputForm';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { User, PlayerUnit, PlayerItem, PlayerBattleUpgrade, UnitType, ItemType, ItemUsage } from "@/types/typings";
import UserModel from '@/models/Users';
import { getLevelFromXP } from "@/utils/utilities";

interface ArmyInputFormProps {
  title: string;
  armyData: any;
  onUpdate?: (user: User) => void;
  attacker?: boolean;
}

// Dummy functions for now
const userToFormData = (user: User) => user;
const formDataToUser = (formData: any) => formData;
const getItemUsage = () => {};
const parseItemsData = () => {};

const ArmyInputForm = forwardRef<{ getFormData: () => User }, ArmyInputFormProps>(({ title, armyData, onUpdate, attacker = true }, ref) => {
    const initialFormData = useMemo(() => ('units' in armyData ? userToFormData(armyData) : armyData), [armyData]);
    const [formData, setFormData] = useState(initialFormData);
    const [updating, setUpdating] = useState(false);
    
    const handleChange = useCallback((field: string, value: any) => setFormData(prev => ({ ...prev, [field]: value })), []);
    const handleUnitChange = useCallback((unitType: string, level: number, value: number) => setFormData(prev => ({ ...prev, [`${unitType.toLowerCase()}${level}`]: value })), []);
    const handleItemsChange = useCallback((itemsData: Record<string, Record<number, number>>) => {
      setFormData(prevData => {
        const baseData = { ...prevData };
        Object.keys(baseData).forEach(key => { if (key.startsWith('item_')) delete baseData[key]; });
        Object.entries(itemsData).forEach(([type, levels]) => {
          Object.entries(levels).forEach(([level, quantity]) => {
            if (quantity > 0) baseData[`item_${type.toLowerCase()}_${parseInt(level)}`] = quantity;
          });
        });
        baseData.items = itemsData;
        return baseData;
      });
    }, []);

    const getUserModel = useCallback(() => formDataToUser(formData), [formData]);

    useImperativeHandle(ref, () => ({ getFormData: getUserModel }));

    const handleUpdate = useCallback(() => {
      if (onUpdate) {
        setUpdating(true);
        try { onUpdate(getUserModel()); } finally { setUpdating(false); }
      }
    }, [getUserModel, onUpdate]);

    const userModel = useMemo(() => getUserModel(), [getUserModel]);
  
    return (
      <>
        <Group justify="space-between" mb="md">
          <Title order={3}>{title}</Title>
          <Group>
            <ArmyPresets onSelect={setFormData} />
            {onUpdate && <Button onClick={handleUpdate} loading={updating}>Update</Button>}
          </Group>
        </Group>
        
        <Tabs defaultValue="units"
          styles={(theme) => ({
            tab: {
              backgroundColor: theme.colors.dark[6],
              borderColor: theme.colors.dark[4],
              color: theme.colors.gray[5],
              '&:focus-visible': {
                outline: `2px solid ${theme.colors.blue[5]}`,
                outlineOffset: 2,
              },
              '&[data-active]': {
                backgroundColor: theme.colors.dark[7],
                borderColor: theme.colors.dark[4],
                color: theme.white,
              },
            },
          })}
        >
          <Tabs.List>
            <Tabs.Tab value="basic">Basic Info</Tabs.Tab>
            <Tabs.Tab value="units">Units</Tabs.Tab>
            <Tabs.Tab value="items">Items</Tabs.Tab>
            <Tabs.Tab value="upgrades">Upgrades</Tabs.Tab>
            <Tabs.Tab value="stats">Stats</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="basic" pt="xs">
            <BasicInfoTab armyData={formData} handleChange={handleChange} />
          </Tabs.Panel>

          <Tabs.Panel value="units" pt="xs">
            <UnitsTab armyData={formData} handleUnitChange={handleUnitChange} isAttacker={attacker} />
          </Tabs.Panel>

          <Tabs.Panel value="items" pt="xs">
            <ItemsTab armyData={formData} handleItemsChange={handleItemsChange} />
          </Tabs.Panel>

          <Tabs.Panel value="stats" pt="xs">
            <Stack>
              <Title order={5} mt="lg">Army Statistics</Title>
              {(() => {
                const userModelInstance = new UserModel(userModel);
                return (
                  <Grid>
                    <Grid.Col span={6}>
                      <Paper withBorder p="sm">
                        <Title order={6} mb="xs">Combat Strength</Title>
                        <Text><b>Offense:</b> {userModelInstance.offense.toLocaleString()}</Text>
                        <Text><b>Defense:</b> {userModelInstance.defense.toLocaleString()}</Text>
                        <Text><b>Sentry:</b> {userModelInstance.sentry.toLocaleString()}</Text>
                      </Paper>
                    </Grid.Col>
                    <Grid.Col span={6}>
                      <Paper withBorder p="sm">
                        <Title order={6} mb="xs">Army</Title>
                        <Text><b>Total Units:</b> {userModelInstance.armySize.toLocaleString()}</Text>
                      </Paper>
                    </Grid.Col>
                  </Grid>
                );
              })()}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="upgrades" pt="xs">
            <UpgradesTab armyData={formData} handleChange={handleChange} />
          </Tabs.Panel>
        </Tabs>
      </>
    );
});

// Dummy tab components for now
const BasicInfoTab = ({ armyData, handleChange }: { armyData: any; handleChange: (field: string, value: any) => void }) => (
  <div>Basic Info Tab - Placeholder</div>
);

const UnitsTab = ({ armyData, handleUnitChange, isAttacker }: { armyData: any; handleUnitChange: (unitType: string, level: number, value: number) => void; isAttacker: boolean }) => (
  <div>Units Tab - Placeholder</div>
);

const ItemsTab = ({ armyData, handleItemsChange }: { armyData: any; handleItemsChange: (itemsData: Record<string, Record<number, number>>) => void }) => (
  <div>Items Tab - Placeholder</div>
);

const UpgradesTab = ({ armyData, handleChange }: { armyData: any; handleChange: (field: string, value: any) => void }) => (
  <div>Upgrades Tab - Placeholder</div>
);

ArmyInputForm.displayName = 'ArmyInputForm';
export default ArmyInputForm;
