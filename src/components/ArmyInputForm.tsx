import {
  Badge,
  Button,
  Divider,
  Grid,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";

import { BattleUpgrades } from "@/constants/Battle_Upgrades";
import { ItemTypes } from "@/constants/Items";
import { UnitTypes } from "@/constants/Units";
import UserModel from "@/models/Users";
import type {
  BattleUpgradeType,
  ItemType,
  ItemUsage,
  PlayerBattleUpgrade,
  PlayerClass,
  PlayerItem,
  PlayerRace,
  PlayerUnit,
  StructureUpgrade,
  UnitType,
  User,
} from "@/types/typings";

type SimulatorUser = User & {
  UserUnit?: PlayerUnit[];
  UserItem?: PlayerItem[];
  UserBattleUpgrade?: PlayerBattleUpgrade[];
  UserStructureUpgrade?: StructureUpgrade[];
};

interface ArmyInputFormProps {
  title: string;
  armyData: SimulatorUser;
  onUpdate?: (user: SimulatorUser) => void;
  attacker?: boolean;
}

const RACES: PlayerRace[] = ["HUMAN", "ELF", "GOBLIN", "UNDEAD"];
const CLASSES: PlayerClass[] = ["FIGHTER", "CLERIC", "ASSASSIN", "THIEF"];
const STRUCTURE_UPGRADES: StructureUpgrade["type"][] = [
  "OFFENSE",
  "SPY",
  "SENTRY",
  "ARMORY",
];
const ITEM_GROUPS: Array<{ type: ItemType; usage: ItemUsage; label: string }> =
  [
    { type: "WEAPON", usage: "OFFENSE", label: "Attack weapon" },
    { type: "ARMOR", usage: "DEFENSE", label: "Defense armor" },
    { type: "SHIELD", usage: "DEFENSE", label: "Shield wall" },
    { type: "HELM", usage: "DEFENSE", label: "Helms" },
    { type: "BOOTS", usage: "OFFENSE", label: "Raiding boots" },
    { type: "BRACERS", usage: "OFFENSE", label: "Bracers" },
  ];

const numberValue = (value: string | number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const normalizeUser = (user: SimulatorUser): SimulatorUser => ({
  ...user,
  UserUnit: user.UserUnit ?? [],
  UserItem: user.UserItem ?? [],
  UserBattleUpgrade: user.UserBattleUpgrade ?? [],
  UserStructureUpgrade: user.UserStructureUpgrade ?? [],
});

const formatType = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const getUnitQuantity = (units: PlayerUnit[], type: UnitType, level: number) =>
  units.find((unit) => unit.type === type && unit.level === level)?.quantity ??
  0;

const getItemQuantity = (
  items: PlayerItem[],
  type: ItemType,
  usage: ItemUsage,
  level: number,
) =>
  items.find(
    (item) =>
      item.type === type && item.usage === usage && item.level === level,
  )?.quantity ?? 0;

const getBattleUpgradeQuantity = (
  upgrades: PlayerBattleUpgrade[],
  type: BattleUpgradeType,
  level: number,
) =>
  upgrades.find((upgrade) => upgrade.type === type && upgrade.level === level)
    ?.quantity ?? 0;

const getStructureLevel = (
  upgrades: StructureUpgrade[],
  type: StructureUpgrade["type"],
) => upgrades.find((upgrade) => upgrade.type === type)?.level ?? 1;

const isRaceAllowed = (itemRace: PlayerRace, playerRace: PlayerRace) =>
  itemRace === "ALL" || itemRace === playerRace;

const getRequiredStructureType = (
  type: BattleUpgradeType,
): StructureUpgrade["type"] => (type === "DEFENSE" ? "OFFENSE" : type);

const canUseUnit = (
  unit: (typeof UnitTypes)[number],
  playerLevel: number,
  fortLevel: number,
) => playerLevel >= unit.level && fortLevel >= unit.fortLevel;

const canUseItem = (
  item: (typeof ItemTypes)[number],
  playerLevel: number,
  armoryLevel: number,
  race: PlayerRace,
) =>
  playerLevel >= item.level &&
  armoryLevel >= item.armoryLevel &&
  isRaceAllowed(item.race, race);

const canUseBattleUpgrade = (
  upgrade: (typeof BattleUpgrades)[number],
  units: PlayerUnit[],
  structureUpgrades: StructureUpgrade[],
  playerLevel: number,
) => {
  const type = upgrade.type as BattleUpgradeType;
  const requiredStructureType = getRequiredStructureType(type);
  const structureLevel = getStructureLevel(
    structureUpgrades,
    requiredStructureType,
  );
  const hasCoveredUnits = units.some(
    (unit) =>
      unit.type === type &&
      unit.level >= upgrade.minUnitLevel &&
      unit.quantity > 0,
  );

  return (
    playerLevel >= upgrade.minUnitLevel &&
    structureLevel >= upgrade.SiegeUpgradeLevel &&
    hasCoveredUnits
  );
};

const sanitizeUserForAvailability = (user: SimulatorUser): SimulatorUser => {
  const normalized = normalizeUser(user);
  const model = new UserModel(normalized);
  const playerLevel = model.level;
  const fortLevel = normalized.fort_level ?? 1;
  const structureUpgrades = normalized.UserStructureUpgrade ?? [];
  const armoryLevel = getStructureLevel(structureUpgrades, "ARMORY");
  const race = normalized.race as PlayerRace;

  const UserUnit = (normalized.UserUnit ?? []).filter((unit) => {
    const unitDefinition = UnitTypes.find(
      (candidate) =>
        candidate.type === unit.type && candidate.level === unit.level,
    );
    return unitDefinition
      ? canUseUnit(unitDefinition, playerLevel, fortLevel)
      : false;
  });

  const UserItem = (normalized.UserItem ?? []).filter((item) => {
    const itemDefinition = ItemTypes.find(
      (candidate) =>
        candidate.type === item.type &&
        candidate.usage === item.usage &&
        candidate.level === item.level,
    );
    return itemDefinition
      ? canUseItem(itemDefinition, playerLevel, armoryLevel, race)
      : false;
  });

  const UserBattleUpgrade = (normalized.UserBattleUpgrade ?? []).filter(
    (upgrade) => {
      const upgradeDefinition = BattleUpgrades.find(
        (candidate) =>
          candidate.type === upgrade.type && candidate.level === upgrade.level,
      );
      return upgradeDefinition
        ? canUseBattleUpgrade(
            upgradeDefinition,
            UserUnit,
            structureUpgrades,
            playerLevel,
          )
        : false;
    },
  );

  return { ...normalized, UserUnit, UserItem, UserBattleUpgrade };
};

const ArmyInputForm = forwardRef<
  { getFormData: () => SimulatorUser },
  ArmyInputFormProps
>(({ title, armyData, onUpdate, attacker = true }, ref) => {
  const [formData, setFormData] = useState<SimulatorUser>(() =>
    normalizeUser(armyData),
  );

  useEffect(() => {
    setFormData(normalizeUser(armyData));
  }, [armyData]);

  const updateUser = useCallback(
    (updater: (current: SimulatorUser) => SimulatorUser) => {
      setFormData((current: SimulatorUser) =>
        normalizeUser(updater(normalizeUser(current))),
      );
    },
    [],
  );

  const handleBasicChange = useCallback(
    <K extends keyof SimulatorUser>(field: K, value: SimulatorUser[K]) => {
      updateUser((current: SimulatorUser) => ({ ...current, [field]: value }));
    },
    [updateUser],
  );

  const handleUnitChange = useCallback(
    (type: UnitType, level: number, value: string | number) => {
      const quantity = numberValue(value);
      updateUser((current: SimulatorUser) => {
        const nextUnits = (current.UserUnit ?? []).filter(
          (unit: PlayerUnit) => !(unit.type === type && unit.level === level),
        );
        if (quantity > 0) {
          nextUnits.push({
            id: 0,
            userId: current.id,
            type,
            level,
            quantity,
            isMercenary: false,
          });
        }
        return { ...current, UserUnit: nextUnits };
      });
    },
    [updateUser],
  );

  const handleItemChange = useCallback(
    (
      type: ItemType,
      usage: ItemUsage,
      level: number,
      value: string | number,
    ) => {
      const quantity = numberValue(value);
      updateUser((current: SimulatorUser) => {
        const nextItems = (current.UserItem ?? []).filter(
          (item: PlayerItem) =>
            !(
              item.type === type &&
              item.usage === usage &&
              item.level === level
            ),
        );
        if (quantity > 0) {
          nextItems.push({
            id: 0,
            userId: current.id,
            type,
            usage,
            level,
            quantity,
          });
        }
        return { ...current, UserItem: nextItems };
      });
    },
    [updateUser],
  );

  const handleBattleUpgradeChange = useCallback(
    (type: BattleUpgradeType, level: number, value: string | number) => {
      const quantity = numberValue(value);
      updateUser((current: SimulatorUser) => {
        const nextUpgrades = (current.UserBattleUpgrade ?? []).filter(
          (upgrade: PlayerBattleUpgrade) =>
            !(upgrade.type === type && upgrade.level === level),
        );
        if (quantity > 0) {
          nextUpgrades.push({
            id: 0,
            userId: current.id,
            type,
            level,
            quantity,
          });
        }
        return { ...current, UserBattleUpgrade: nextUpgrades };
      });
    },
    [updateUser],
  );

  const handleStructureChange = useCallback(
    (type: StructureUpgrade["type"], value: string | number) => {
      const level = Math.max(1, numberValue(value));
      updateUser((current: SimulatorUser) => {
        const nextUpgrades = (current.UserStructureUpgrade ?? []).filter(
          (upgrade: StructureUpgrade) => upgrade.type !== type,
        );
        nextUpgrades.push({ id: 0, userId: current.id, type, level });
        return { ...current, UserStructureUpgrade: nextUpgrades };
      });
    },
    [updateUser],
  );

  const availableFormData = useMemo(
    () => sanitizeUserForAvailability(formData),
    [formData],
  );
  const userModel = useMemo(
    () => new UserModel(availableFormData),
    [availableFormData],
  );
  const units = formData.UserUnit ?? [];
  const items = formData.UserItem ?? [];
  const battleUpgrades = formData.UserBattleUpgrade ?? [];
  const availableUnits = availableFormData.UserUnit ?? [];
  const availableItems = availableFormData.UserItem ?? [];
  const availableBattleUpgrades = availableFormData.UserBattleUpgrade ?? [];
  const structureUpgrades = formData.UserStructureUpgrade ?? [];
  const playerLevel = userModel.level;
  const fortLevel = formData.fort_level ?? 1;
  const armoryLevel = getStructureLevel(structureUpgrades, "ARMORY");

  useImperativeHandle(ref, () => ({ getFormData: () => availableFormData }), [
    availableFormData,
  ]);

  const updateButton = onUpdate ? (
    <Button size="xs" variant="light" onClick={() => onUpdate(formData)}>
      Apply
    </Button>
  ) : null;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={3}>{title}</Title>
          <Text size="sm" c="dimmed">
            {attacker
              ? "Configure the raiding force"
              : "Shape the defending realm"}
          </Text>
        </div>
        {updateButton}
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <StatTile label="Offense" value={userModel.offense} />
        <StatTile label="Defense" value={userModel.defense} />
        <StatTile label="Sentry" value={userModel.sentry} />
        <StatTile label="Army" value={userModel.armySize} />
      </SimpleGrid>

      <Tabs defaultValue="basic" variant="outline">
        <Tabs.List>
          <Tabs.Tab value="basic">Command</Tabs.Tab>
          <Tabs.Tab value="units">Units</Tabs.Tab>
          <Tabs.Tab value="items">Items</Tabs.Tab>
          <Tabs.Tab value="upgrades">Upgrades</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="basic" pt="md">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
            <TextInput
              label="Name"
              value={formData.display_name ?? ""}
              onChange={(event) =>
                handleBasicChange("display_name", event.currentTarget.value)
              }
            />
            <Select
              label="Race"
              data={RACES}
              value={formData.race}
              onChange={(value) =>
                handleBasicChange("race", (value ?? "HUMAN") as PlayerRace)
              }
            />
            <Select
              label="Class"
              data={CLASSES}
              value={formData.class}
              onChange={(value) =>
                handleBasicChange("class", (value ?? "FIGHTER") as PlayerClass)
              }
            />
            <NumberInput
              label="Experience"
              min={0}
              value={formData.experience ?? 0}
              onChange={(value) =>
                handleBasicChange("experience", numberValue(value))
              }
            />
            <NumberInput
              label="Gold on hand"
              min={0}
              value={Number(formData.gold ?? 0)}
              onChange={(value) =>
                handleBasicChange("gold", BigInt(numberValue(value)))
              }
            />
            <NumberInput
              label="Fort level"
              min={1}
              max={30}
              value={formData.fort_level ?? 1}
              onChange={(value) =>
                handleBasicChange("fort_level", numberValue(value))
              }
            />
            <NumberInput
              label="Fort hitpoints"
              min={0}
              value={formData.fort_hitpoints ?? 0}
              onChange={(value) =>
                handleBasicChange("fort_hitpoints", numberValue(value))
              }
            />
            <NumberInput
              label="Attack turns"
              min={0}
              value={formData.attack_turns ?? 0}
              onChange={(value) =>
                handleBasicChange("attack_turns", numberValue(value))
              }
            />
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="units" pt="md">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            {UnitTypes.map((unit) =>
              (() => {
                const disabled = !canUseUnit(unit, playerLevel, fortLevel);
                const unlockText = disabled
                  ? `Requires player level ${unit.level} and fort ${unit.fortLevel}+`
                  : `HP ${unit.hp} · fort ${unit.fortLevel}+`;

                return (
                  <NumberInput
                    key={`${unit.type}-${unit.level}`}
                    label={`${unit.name} · ${formatType(unit.type)} L${unit.level}`}
                    description={unlockText}
                    min={0}
                    disabled={disabled}
                    value={getUnitQuantity(
                      disabled ? availableUnits : units,
                      unit.type,
                      unit.level,
                    )}
                    onChange={(value) =>
                      handleUnitChange(unit.type, unit.level, value)
                    }
                  />
                );
              })(),
            )}
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="items" pt="md">
          <Stack gap="lg">
            {ITEM_GROUPS.map((group) => {
              const levels = ItemTypes.filter(
                (item) =>
                  item.type === group.type && item.usage === group.usage,
              ).slice(0, 8);
              return (
                <Paper key={`${group.usage}-${group.type}`} withBorder p="md">
                  <Group justify="space-between" mb="sm">
                    <Title order={5}>{group.label}</Title>
                    <Badge variant="outline">{group.usage}</Badge>
                  </Group>
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
                    {levels.map((item) =>
                      (() => {
                        const disabled = !canUseItem(
                          item,
                          playerLevel,
                          armoryLevel,
                          formData.race as PlayerRace,
                        );
                        const unlockText = disabled
                          ? `Requires level ${item.level}, armory ${item.armoryLevel}, ${item.race === "ALL" ? "any race" : item.race}`
                          : `Armory ${item.armoryLevel} · ${item.race === "ALL" ? "all races" : item.race}`;

                        return (
                          <NumberInput
                            key={item.id}
                            label={`${item.name} · L${item.level}`}
                            description={unlockText}
                            min={0}
                            disabled={disabled}
                            value={getItemQuantity(
                              disabled ? availableItems : items,
                              group.type,
                              group.usage,
                              item.level,
                            )}
                            onChange={(value) =>
                              handleItemChange(
                                group.type,
                                group.usage,
                                item.level,
                                value,
                              )
                            }
                          />
                        );
                      })(),
                    )}
                  </SimpleGrid>
                </Paper>
              );
            })}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="upgrades" pt="md">
          <Grid>
            <Grid.Col span={{ base: 12, md: 5 }}>
              <Paper withBorder p="md" h="100%">
                <Title order={5} mb="sm">
                  Structure doctrine
                </Title>
                <Stack gap="sm">
                  {STRUCTURE_UPGRADES.map((type) => (
                    <NumberInput
                      key={type}
                      label={formatType(type)}
                      min={1}
                      max={30}
                      value={getStructureLevel(structureUpgrades, type)}
                      onChange={(value) => handleStructureChange(type, value)}
                    />
                  ))}
                </Stack>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 7 }}>
              <Paper withBorder p="md" h="100%">
                <Title order={5} mb="sm">
                  Battle equipment crews
                </Title>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  {BattleUpgrades.map((upgrade) =>
                    (() => {
                      const type = upgrade.type as BattleUpgradeType;
                      const requiredStructureType =
                        getRequiredStructureType(type);
                      const disabled = !canUseBattleUpgrade(
                        upgrade,
                        availableUnits,
                        structureUpgrades,
                        playerLevel,
                      );
                      const unlockText = disabled
                        ? `Requires level ${upgrade.minUnitLevel}+ ${formatType(type)} units and ${formatType(requiredStructureType)} structure ${upgrade.SiegeUpgradeLevel}`
                        : `Covers ${upgrade.unitsCovered} unit${
                            upgrade.unitsCovered === 1 ? "" : "s"
                          }`;

                      return (
                        <NumberInput
                          key={`${upgrade.type}-${upgrade.level}`}
                          label={`${upgrade.name} · ${formatType(upgrade.type)} L${upgrade.level}`}
                          description={unlockText}
                          min={0}
                          disabled={disabled}
                          value={getBattleUpgradeQuantity(
                            disabled ? availableBattleUpgrades : battleUpgrades,
                            type,
                            upgrade.level,
                          )}
                          onChange={(value) =>
                            handleBattleUpgradeChange(
                              type,
                              upgrade.level,
                              value,
                            )
                          }
                        />
                      );
                    })(),
                  )}
                </SimpleGrid>
              </Paper>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
});

const StatTile = ({ label, value }: { label: string; value: number }) => (
  <Paper withBorder p="sm">
    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
      {label}
    </Text>
    <Divider my={6} />
    <Text fw={800}>{Math.round(value).toLocaleString()}</Text>
  </Paper>
);

ArmyInputForm.displayName = "ArmyInputForm";
export default ArmyInputForm;
