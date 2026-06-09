import { faCopy, faPlay, faRedo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  Alert,
  Badge,
  Button,
  Grid,
  Group,
  Loader,
  NumberInput,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useClipboard, useLocalStorage } from "@mantine/hooks";
import type { NextPage } from "next";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ArmyInputForm from "@/components/ArmyInputForm";
import BattleResults from "@/components/BattleTestResults";
import { GameCard } from "@/components/game/GameCard";
import MainArea from "@/components/MainArea";
import type {
  PlayerBattleUpgrade,
  PlayerItem,
  PlayerRace,
  PlayerUnit,
  ShareableArmyData,
  StructureUpgrade,
  User,
} from "@/types/typings";
import { decodeBattleData, encodeBattleData } from "@/utils/battleEncoding";
import MockUserGenerator from "@/utils/MockUserGenerator";
import { stringifyObj } from "@/utils/numberFormatting";

type SimulatorUser = User & {
  UserUnit?: PlayerUnit[];
  UserItem?: PlayerItem[];
  UserBattleUpgrade?: PlayerBattleUpgrade[];
  UserStructureUpgrade?: StructureUpgrade[];
};

type SimulatorResponse = {
  results: unknown;
  attackerStats: unknown;
  defenderStats: unknown;
  message?: string;
};

const numberValue = (value: string | number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 1;

const parseStoredUser = (value: string): SimulatorUser =>
  JSON.parse(value, (_key, parsedValue) => {
    if (typeof parsedValue === "string" && /^\d+n$/.test(parsedValue)) {
      return BigInt(parsedValue.slice(0, -1));
    }
    return parsedValue;
  });

const toShareableArmy = (user: SimulatorUser): ShareableArmyData => ({
  race: user.race,
  experience: user.experience,
  units: user.UserUnit ?? [],
  items: user.UserItem ?? [],
  battle_upgrades: user.UserBattleUpgrade ?? [],
  structure_upgrades: user.UserStructureUpgrade ?? [],
  fort_level: user.fort_level,
  fort_hitpoints: user.fort_hitpoints,
});

const BattleSimulator: NextPage = () => {
  const { t } = useTranslation("battle");
  const router = useRouter();
  const defenderGenerator = useMemo(
    () => new MockUserGenerator().setBasicInfo({ display_name: "Defender" }),
    [],
  );
  const attackerGenerator = useMemo(
    () => new MockUserGenerator().setBasicInfo({ display_name: "Attacker" }),
    [],
  );

  const [attacker, setAttacker] = useLocalStorage<SimulatorUser>({
    key: "battle-sim-attacker",
    defaultValue: attackerGenerator.getUser(),
    serialize: (v) => JSON.stringify(stringifyObj(v)),
    deserialize: parseStoredUser,
  });
  const [defender, setDefender] = useLocalStorage<SimulatorUser>({
    key: "battle-sim-defender",
    defaultValue: defenderGenerator.getUser(),
    serialize: (v) => JSON.stringify(stringifyObj(v)),
    deserialize: parseStoredUser,
  });
  const [turns, setTurns] = useLocalStorage<number>({
    key: "battle-sim-turns",
    defaultValue: 1,
  });

  const [results, setResults] = useState<SimulatorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attackerFormRef = useRef<{ getFormData: () => SimulatorUser }>(null);
  const defenderFormRef = useRef<{ getFormData: () => SimulatorUser }>(null);
  const loadedBattleParamRef = useRef<string | null>(null);

  const handleRunSimulation = useCallback(async () => {
    const updatedAttacker = attackerFormRef.current?.getFormData() || attacker;
    const updatedDefender = defenderFormRef.current?.getFormData() || defender;
    setAttacker(updatedAttacker);
    setDefender(updatedDefender);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/attack/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attacker: JSON.stringify(stringifyObj(updatedAttacker)),
          defender: JSON.stringify(stringifyObj(updatedDefender)),
          turns,
        }),
      });
      const data = (await response.json()) as SimulatorResponse;
      if (!response.ok) {
        throw new Error(data.message ?? t("battleSimulator.error"));
      }
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("battleSimulator.error"));
    } finally {
      setLoading(false);
    }
  }, [attacker, defender, setAttacker, setDefender, t, turns]);

  const handleReset = useCallback(() => setResults(null), []);

  const clipboard = useClipboard();
  const handleCopy = () => {
    const currentAttacker = attackerFormRef.current?.getFormData() || attacker;
    const currentDefender = defenderFormRef.current?.getFormData() || defender;
    setAttacker(currentAttacker);
    setDefender(currentDefender);
    const encoded = encodeBattleData(
      toShareableArmy(currentAttacker),
      toShareableArmy(currentDefender),
      turns,
    );
    if (!encoded) {
      setError(t("battleSimulator.error"));
      return;
    }
    const origin = process.env.NEXT_PUBLIC_URL_ROOT ?? window.location.origin;
    const shareableUrl = `${origin}/battle/battleSimulator?battle=${encoded}`;
    clipboard.copy(shareableUrl);
  };

  const battleParam = Array.isArray(router.query.battle)
    ? router.query.battle[0]
    : router.query.battle;

  useEffect(() => {
    if (
      router.isReady &&
      battleParam &&
      loadedBattleParamRef.current !== battleParam
    ) {
      const data = decodeBattleData(battleParam);
      if (data) {
        const convertToUser = (
          userData: ShareableArmyData,
          baseUser: SimulatorUser,
        ): SimulatorUser => ({
          ...baseUser,
          race: userData.race as PlayerRace,
          experience: userData.experience,
          UserUnit: userData.units ?? [],
          UserItem: userData.items ?? [],
          UserBattleUpgrade: userData.battle_upgrades ?? [],
          UserStructureUpgrade: userData.structure_upgrades ?? [],
          fort_level: userData.fort_level ?? baseUser.fort_level,
          fort_hitpoints: userData.fort_hitpoints ?? baseUser.fort_hitpoints,
        });
        setAttacker(convertToUser(data.attacker, attacker));
        setDefender(convertToUser(data.defender, defender));
        setTurns(data.turns);
        loadedBattleParamRef.current = battleParam;
      }
    }
  }, [
    battleParam,
    attacker,
    defender,
    router.isReady,
    setAttacker,
    setDefender,
    setTurns,
  ]);

  return (
    <MainArea title={t("battleSimulator.title")}>
      <Stack gap="md">
        <GameCard title={t("battleSimulator.title")} goldAccent>
          <Grid align="center">
            <Grid.Col span={{ base: 12, md: 8 }}>
              <Title order={2}>War table simulator</Title>
              <Text c="dimmed" maw={760}>
                Build two complete armies, tune equipment and fortress doctrine,
                then run the live combat engine without spending turns or gold.
              </Text>
              <Group mt="sm" gap="xs">
                <Badge variant="light">Public sandbox</Badge>
                <Badge variant="light">Shareable loadouts</Badge>
                <Badge variant="light">Live battle rules</Badge>
              </Group>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Paper withBorder p="md">
                <NumberInput
                  label={t("battleSimulator.turns")}
                  value={turns}
                  min={1}
                  max={50}
                  onChange={(val) => setTurns(numberValue(val))}
                />
                <SimpleGrid cols={2} mt="md">
                  <Button
                    onClick={handleCopy}
                    variant="outline"
                    leftSection={<FontAwesomeIcon icon={faCopy} />}
                  >
                    {clipboard.copied
                      ? t("battleSimulator.linkCopied")
                      : t("battleSimulator.copyLink")}
                  </Button>
                  <Button
                    loading={loading}
                    onClick={handleRunSimulation}
                    leftSection={<FontAwesomeIcon icon={faPlay} />}
                  >
                    {t("battleSimulator.runSimulation")}
                  </Button>
                </SimpleGrid>
              </Paper>
            </Grid.Col>
          </Grid>
        </GameCard>

        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}

        <Grid>
          <Grid.Col span={{ base: 12, xl: 6 }}>
            <GameCard title={t("battleSimulator.attacker")}>
              <ArmyInputForm
                ref={attackerFormRef}
                title={t("battleSimulator.attacker")}
                armyData={attacker}
                attacker
                key={`attacker-form-${attacker.id}`}
              />
            </GameCard>
          </Grid.Col>
          <Grid.Col span={{ base: 12, xl: 6 }}>
            <GameCard title={t("battleSimulator.defender")}>
              <ArmyInputForm
                ref={defenderFormRef}
                title={t("battleSimulator.defender")}
                armyData={defender}
                attacker={false}
                key={`defender-form-${defender.id}`}
              />
            </GameCard>
          </Grid.Col>
        </Grid>

        {results && (
          <Button
            variant="outline"
            onClick={handleReset}
            leftSection={<FontAwesomeIcon icon={faRedo} />}
          >
            {t("battleSimulator.reset")}
          </Button>
        )}

        {loading ? (
          <Loader my="xl" mx="auto" />
        ) : results ? (
          <BattleResults
            attackerStats={results.attackerStats}
            defenderStats={results.defenderStats}
            results={results.results}
          />
        ) : null}
      </Stack>
    </MainArea>
  );
};

export default BattleSimulator;
