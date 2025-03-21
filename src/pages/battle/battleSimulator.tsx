import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { NextPage } from 'next';
import {
  Container, Title, Button, Card, NumberInput,
  Loader, Alert
} from '@mantine/core';
import MainArea from '@/components/MainArea';
import ArmyInputForm from '@/components/ArmyInputForm';
import BattleResults from '@/components/BattleTestResults';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { PlayerRace, ShareableArmyData, User } from '@/types/typings';
import { stringifyObj } from '@/utils/numberFormatting';
import { useClipboard, useLocalStorage } from '@mantine/hooks';
import router from 'next/router';
import { encodeBattleData, decodeBattleData } from '@/utils/battleEncoding';

const BattleSimulator: NextPage = (props) => {
  const defenderGenerator = useMemo(() => {
    const generator = new MockUserGenerator();
    generator.setBasicInfo({
      email: 'defender@example.com',
      display_name: 'Defender',
    });
    return generator;
  }, []);

  const attackerGenerator = useMemo(() => {
    const generator = new MockUserGenerator();
    generator.setBasicInfo({
      email: 'attacker@example.com',
      display_name: 'Attacker',
    });
    return generator;
  }, []);

  const [attacker, setAttacker] = useLocalStorage<User>({
    key: 'battle-simulator-attacker',
    defaultValue: attackerGenerator.getUser(),
    serialize: (value) => JSON.stringify(stringifyObj(value)),
    deserialize: (value) => {
      try {
        const parsed = JSON.parse(value);
        console.log("Loaded attacker from localStorage:", parsed);
        return parsed;
      } catch (err) {
        console.error("Error parsing attacker data:", err);
        return attackerGenerator.getUser();
      }
    }
  });

  const [defender, setDefender] = useLocalStorage<User>({
    key: 'battle-simulator-defender',
    defaultValue: defenderGenerator.getUser(),
    serialize: (value) => JSON.stringify(stringifyObj(value)),
    deserialize: (value) => {
      try {
        const parsed = JSON.parse(value);
        console.log("Loaded defender from localStorage:", parsed);
        return parsed;
      } catch (err) {
        console.error("Error parsing defender data:", err);
        return defenderGenerator.getUser();
      }
    }
  });

  const [turns, setTurns] = useLocalStorage<number>({
    key: 'battle-simulator-turns',
    defaultValue: 1,
  });
  

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pendingUpdate, setPendingUpdate] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(0);

  const attackerFormRef = useRef<{ getFormData: () => User }>(null);
  const defenderFormRef = useRef<{ getFormData: () => User }>(null);

  const handleRunSimulation = useCallback(async () => {
    // Get latest data from forms before running simulation
    const updatedAttacker = attackerFormRef.current?.getFormData() || attacker;
    const updatedDefender = defenderFormRef.current?.getFormData() || defender;

    setAttacker(updatedAttacker);
    setDefender(updatedDefender);

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/attack/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          attacker: JSON.stringify(stringifyObj(updatedAttacker)), 
          defender: JSON.stringify(stringifyObj(updatedDefender)), 
          turns 
        }),
      });
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [attacker, defender, setAttacker, setDefender, turns]);

  const handleReset = useCallback(() => {
    setResults(null);
  }, []);

  const handleUpdate = useCallback(() => {
    setPendingUpdate(true);
    const attackerData = attackerFormRef.current?.getFormData();
    const defenderData = defenderFormRef.current?.getFormData();
  
    if (attackerData && defenderData) {
      setAttacker(attackerData);
      setDefender(defenderData);
    }
    setPendingUpdate(false);
  }, [setAttacker, setDefender]);

  const clipboard = useClipboard();

  const handleCopy = () => {
    const encoded = encodeBattleData(attacker, defender, turns);
    const shareableUrl = `${process.env.NEXT_PUBLIC_URL_ROOT}/battle/battleSimulator?battle=${encoded}`;
    clipboard.copy(shareableUrl);
  };

  useEffect(() => {
    if (router.query.battle) {
      const data = decodeBattleData(router.query.battle as string);
      if (data) {
        const convertToUser = (userData: ShareableArmyData, baseUser: User): User => {
          return {
            ...baseUser,
            race: userData.race as PlayerRace,
            experience: userData.experience,
            units: userData.units || [],
            items: userData.items || [],
            battle_upgrades: userData.battle_upgrades || [],
            structure_upgrades: userData.structure_upgrades || [],
            fort_level: userData.fort_level || baseUser.fort_level,
            fort_hitpoints: userData.fort_hitpoints || baseUser.fort_hitpoints,
          };
        };
        
        const newAttacker = convertToUser(data.attacker, attacker);
        const newDefender = convertToUser(data.defender, defender);
        
        setAttacker(newAttacker);
        setDefender(newDefender);
        setTurns(data.turns);
        
        // Force forms to reinitialize with new data
        setForceRefresh(prev => prev + 1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.battle]); // only triggers when URL changes

  return (
    <MainArea title="Battle Simulator">
      <Container size="xl" py="md">
        <Card withBorder mb="lg">
          <Title order={2}>Battle Simulator</Title>
        </Card>

        {error && <Alert color="red" mb="lg">{error}</Alert>}
        <Button onClick={handleCopy}>
          {clipboard.copied ? 'Copied!' : 'Copy Shareable Link'}
        </Button>
        <ArmyInputForm
          ref={attackerFormRef}
          title="Attacker"
          armyData={attacker}
          attacker={true}
          key={`attacker-form-${forceRefresh}`}
        />
        <ArmyInputForm
          ref={defenderFormRef}
          armyData={defender}
          title="Defender"
          attacker={false}
          key={`defender-form-${forceRefresh}`}
        />

        
        <Card withBorder mt="lg">
          <NumberInput
            label="Turns"
            value={turns}
            min={1}
            max={50}
            onChange={(val) => setTurns(val as number)}
          />
          <Button mt="md" loading={loading} onClick={handleRunSimulation} disabled={pendingUpdate}>
            Run Simulation
          </Button>
          {results && <Button variant="outline" ml="md" onClick={handleReset}>Reset</Button>}
          <Button mt="md" ml="md" onClick={handleUpdate} loading={pendingUpdate} disabled={loading}>
            {pendingUpdate ? 'Updating...' : 'Update'}
          </Button>
        </Card>
        
        {error && <Alert title="Error" color="red">{error}</Alert>}
        
        {loading ? (
          <Loader my="xl" mx="auto" />
        ) : results ? (
          <BattleResults
            attackerStats={results.attackerStats}
            defenderStats={results.defenderStats}
            results={results.results}
          />
        ) : null}
      </Container>
    </MainArea>
  );
}        
  export default BattleSimulator;

