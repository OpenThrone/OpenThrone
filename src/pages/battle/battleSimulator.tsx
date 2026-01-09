import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { NextPage } from 'next';
import { Button, NumberInput, Loader, Alert, Group } from '@mantine/core';
import ArmyInputForm from '@/components/ArmyInputForm';
import BattleResults from '@/components/BattleTestResults';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { PlayerRace, ShareableArmyData, User } from '@/types/typings';
import { stringifyObj } from '@/utils/numberFormatting';
import { useClipboard, useLocalStorage } from '@mantine/hooks';
import router from 'next/router';
import { encodeBattleData, decodeBattleData } from '@/utils/battleEncoding';
import { logError } from '@/utils/logger';
import { GameCard } from '@/components/game/GameCard';
import { faCopy, faPlay, faRedo, faSync } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import MainArea from '@/components/MainArea';

const BattleSimulator: NextPage = () => {
  const defenderGenerator = useMemo(() => new MockUserGenerator().setBasicInfo({ display_name: 'Defender' }), []);
  const attackerGenerator = useMemo(() => new MockUserGenerator().setBasicInfo({ display_name: 'Attacker' }), []);

  const [attacker, setAttacker] = useLocalStorage<User>({ key: 'battle-sim-attacker', defaultValue: attackerGenerator.getUser(), serialize: (v) => JSON.stringify(stringifyObj(v)), deserialize: (v) => JSON.parse(v) });
  const [defender, setDefender] = useLocalStorage<User>({ key: 'battle-sim-defender', defaultValue: defenderGenerator.getUser(), serialize: (v) => JSON.stringify(stringifyObj(v)), deserialize: (v) => JSON.parse(v) });
  const [turns, setTurns] = useLocalStorage<number>({ key: 'battle-sim-turns', defaultValue: 1 });
  
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const attackerFormRef = useRef<{ getFormData: () => User }>(null);
  const defenderFormRef = useRef<{ getFormData: () => User }>(null);

  const handleRunSimulation = useCallback(async () => {
    const updatedAttacker = attackerFormRef.current?.getFormData() || attacker;
    const updatedDefender = defenderFormRef.current?.getFormData() || defender;
    setAttacker(updatedAttacker);
    setDefender(updatedDefender);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/attack/battleTest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attacker: JSON.stringify(stringifyObj(updatedAttacker)), defender: JSON.stringify(stringifyObj(updatedDefender)), turns }),
      });
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [attacker, defender, setAttacker, setDefender, turns]);

  const handleReset = useCallback(() => setResults(null), []);

  const clipboard = useClipboard();
  const handleCopy = () => {
    const encoded = encodeBattleData(attacker, defender, turns);
    const shareableUrl = `${process.env.NEXT_PUBLIC_URL_ROOT}/battle/battleSimulator?battle=${encoded}`;
    clipboard.copy(shareableUrl);
  };

  const battleParam = Array.isArray(router.query.battle)
    ? router.query.battle[0]
    : router.query.battle;

  useEffect(() => {
    if (battleParam) {
      const data = decodeBattleData(battleParam as string);
      if (data) {
        const convertToUser = (userData: ShareableArmyData, baseUser: User): User => ({
          ...baseUser,
          race: userData.race as PlayerRace,
          experience: userData.experience,
          units: userData.units || [],
          items: userData.items || [],
          battle_upgrades: userData.battle_upgrades || [],
          structure_upgrades: userData.structure_upgrades || [],
          fort_level: userData.fort_level || baseUser.fort_level,
          fort_hitpoints: userData.fort_hitpoints || baseUser.fort_hitpoints,
        });
        setAttacker(convertToUser(data.attacker, attacker));
        setDefender(convertToUser(data.defender, defender));
        setTurns(data.turns);
      }
    }
  }, [battleParam, attacker, defender, setAttacker, setDefender, setTurns]);

  return (
    <MainArea title="Battle Simulator">
      <GameCard title="Battle Simulator">
        <Group>
          <Button onClick={handleCopy} leftSection={<FontAwesomeIcon icon={faCopy} />}>
            {clipboard.copied ? 'Copied Link!' : 'Copy Shareable Link'}
          </Button>
        </Group>
      </GameCard>

      {error && <Alert color="red" my="lg">{error}</Alert>}

      <GameCard title="Attacker" mt="md">
        <ArmyInputForm ref={attackerFormRef} title="Attacker Army" armyData={attacker} attacker key={`attacker-form-${attacker.id}`} />
      </GameCard>

      <GameCard title="Defender" mt="md">
        <ArmyInputForm ref={defenderFormRef} title="Defender Army" armyData={defender} attacker={false} key={`defender-form-${defender.id}`} />
      </GameCard>

      <GameCard title="Controls" mt="md">
        <NumberInput label="Turns" value={turns} min={1} max={50} onChange={(val) => setTurns(val as number)} />
        <Group mt="md">
          <Button loading={loading} onClick={handleRunSimulation} leftSection={<FontAwesomeIcon icon={faPlay} />}>
            Run Simulation
          </Button>
          {results && <Button variant="outline" onClick={handleReset} leftSection={<FontAwesomeIcon icon={faRedo} />}>Reset</Button>}
        </Group>
      </GameCard>

      {loading ? (
        <Loader my="xl" mx="auto" />
      ) : results ? (
        <BattleResults
          attackerStats={results.attackerStats}
          defenderStats={results.defenderStats}
          results={results.results}
        />
      ) : null}
    </MainArea>
  );
}
export default BattleSimulator;
