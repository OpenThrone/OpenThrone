import type { FC } from 'react';
import React, { useEffect, useState } from 'react';
import { faBackwardStep } from '@fortawesome/free-solid-svg-icons';
import { useLayout } from '@/context/LayoutContext';
import { useUser } from '@/context/users';
import { alertService } from '@/services';

import Alert from './alert';
import router from 'next/router';
import { stringifyObj } from '@/utils/numberFormatting';
import { Button, NumberInput, Modal, Group, Select, Text, Paper, Divider, Title } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { SpyUpgrades } from '@/constants';

interface ModalProps {
  isOpen: boolean;
  toggleModal: () => void;
  children: React.ReactNode;
}

const CustomModal: FC<ModalProps> = ({ isOpen, children, toggleModal }) => {
  const layoutCont = useLayout();

  return (
    <Modal.Root
      opened={isOpen}
      onClose={toggleModal}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header >
          <Modal.Title>
            <Title order={4}>Spy Mission</Title>
          </Modal.Title>
          <Modal.CloseButton size={'lg'} />
        </Modal.Header>
        <Divider my="xs" />
        <Modal.Body>
      <Paper>
        <Alert />
        {children}
          </Paper>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};

interface CustomButtonProps {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const CustomButton: FC<CustomButtonProps> = ({
  onClick,
  disabled,
  children,
}) => (
  <Button
    onClick={onClick}
    disabled={disabled}
    fullWidth
    radius="md"
    size="lg"
    variant="filled"
    mb={'lg'}
    
  >
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '2px' }}>
      {children}
    </div>
  </Button>
);


interface SpyMissionProps {
  isOpen: boolean;
  toggleModal: () => void;
  defenderID: number;
}

type MissionPanelKey = 'intelligence' | 'assassination' | 'infiltration';

const SpyMissionsModal: FC<SpyMissionProps> = ({
  isOpen,
  toggleModal,
  defenderID,
}) => {
  const [currentPanel, setCurrentPanel] = useState<MissionPanelKey | ''>('');
  const [intelSpies, setIntelSpies] = useState(1);
  const [assassinateUnit, setAssassinateUnit] = useState('CITIZEN/WORKERS');

  const [isAssassinateDisabled, setIsAssassinateDisabled] = useState(true);
  const [isInfiltrationDisabled, setIsInfiltrationDisabled] = useState(true);
  const [isIntelDisabled, setIsIntelDisabled] = useState(true);
  const { user } = useUser();
  const [units, setUnits] = useState({ SPY: 0, ASSASSIN: 0, INFILTRATOR: 0 });
  const [spyLimits, setSpyLimits] = useState({
    INFIL: {
      perUser: 0,
      perDay: 0,
      perMission: 0,
    }, ASSASS: {
      perUser: 0,
      perDay: 0,
      perMission: 0,
  } });

  const getUpgradeInfo = (level: number = 1) => {
    return SpyUpgrades[level].name;
  }

  useEffect(() => {
    if (user) {
      setIsInfiltrationDisabled(!user.spyMissions['infil'].enabled);
      setIsAssassinateDisabled(!user.spyMissions['assass'].enabled);
      setIsIntelDisabled(!user.spyMissions['intel'].enabled);
      setUnits({
        SPY:
          user.units.find((unit) => unit.type === 'SPY' && unit.level === 1)
            ?.quantity ?? 0,
        ASSASSIN:
          user.units.find((unit) => unit.type === 'SPY' && unit.level === 3)
            ?.quantity ?? 0,
        INFILTRATOR:
          user.units.find((unit) => unit.type === 'SPY' && unit.level === 2)
            ?.quantity ?? 0,
      });
      setSpyLimits({
        INFIL: {
          perUser: user.spyLimits.infil.perUser,
          perDay: user.spyLimits.infil.perDay,
          perMission: user.spyLimits.infil.perMission,
        },
        ASSASS: {
          perUser: user.spyLimits.assass.perUser,
          perDay: user.spyLimits.assass.perDay,
          perMission: user.spyLimits.assass.perMission,
        },
      });
    }
  }, [user]);

  const handleSpyMission = async () => {
    let type = 'INTEL';
    if (currentPanel === "assassination") {
      type = 'ASSASSINATE';
    } else if (currentPanel === "infiltration") {
      type = 'INFILTRATE';
    }
    const res = await fetch(`/api/spy/${defenderID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify((currentPanel === "assassination" ? { type, spies: intelSpies, unit: assassinateUnit } : { type, spies: intelSpies })),
    });
    const results = await res.json();

    if (results.status === 'failed') {
      alertService.error(results.message);
      return
    }
    router.push(`/battle/results/${results.attack_log}`);
    toggleModal();

    alertService.success(
      `You have sent ${intelSpies} spies.`
    );
  }

  const MissionPanels: Record<MissionPanelKey, JSX.Element> = {
    intelligence: (
      <div>
        <Title align="center" order={3} weight={700} mb="md">Intelligence Gathering</Title>
        <Text>How many spies would you like to send?</Text>
        <Group mt="md">
          <NumberInput
            max={10}
            min={1}
            value={intelSpies}
            onChange={(value) => setIntelSpies(value)}
          />
          <Button onClick={handleSpyMission}>Send Spies</Button>
        </Group>
        <div className="mt-4">
          <Title align="center" order={3} weight={700}>Intelligence Information</Title>
          <Text mt="md">Spies Trained: {units.SPY}</Text>
          <Text>You can send a maximum of 10 spies per mission.</Text>
        </div>
      </div>
    ),
    assassination: (
      <div>
        <Text align="center" size="lg" weight={700} mb="md">Assassination</Text>
        <Text>What type of units would you like to assassinate?</Text>
        <Select
          value={assassinateUnit}
          onChange={(value) => setAssassinateUnit(value)}
          data={['CITIZEN/WORKERS', 'OFFENSE', 'DEFENSE']}
          mt="md"
        />
        <Text mt="md">How many assassins would you like to send?</Text>
        <NumberInput
          max={5}
          min={1}
          value={intelSpies}
          onChange={(value) => setIntelSpies(value)}
          mt="md"
        />
        <Text>What Unit Type would you like to target?</Text>
        <Select>
          <option value="CITIZEN/WORKERS">Citizen/Workers</option>
          <option value="OFFENSE">Offense</option>
          <option value="DEFENSE">Defense</option>
        </Select>
        <Button onClick={handleSpyMission} fullWidth mt="md">Assassinate</Button>
        <div className="mt-4">
          <Text align="center" size="lg" weight={700}>Assassination Information</Text>
          <Text mt="md">Total Assassins: {units.ASSASSIN}</Text>
          <Text>You can send a maximum of  assassins per mission.</Text>
          <Text mt="md">Assassination Attempts Available: ##</Text>
          <Text>
            You can only send 1 assassination attempt per 24 hours.
            To increase the number of attempts per day, upgrade your spy
            structure!
          </Text>
        </div>
      </div>
    ),
    infiltration: (
      <div>
        <Text align="center" size="lg" weight={700} mb="md">Infiltration</Text>
        <Text>How many spies would you like to send to infiltrate?</Text>
        <Group mt="md">
          <NumberInput
            max={3}
            min={1}
            value={intelSpies}
            onChange={(value) => setIntelSpies(value)}
          />
          <Button onClick={handleSpyMission}>Infiltrate</Button>
        </Group>
        <div className="mt-4">
          <Text align="center" size="lg" weight={700}>Infiltration Information</Text>
          <Text mt="md">Total Spies: {units.INFILTRATOR}</Text>
          <Text>You can send a maximum of {spyLimits.INFIL.perMission} spies per infiltration mission.</Text>
          <Text mt="md">Infiltration Attempts Available: </Text>
          <Text>
            You can only send {spyLimits.INFIL.perDay} infiltration attempts per 24 hours.
            To increase the number of attempts per day, upgrade your spy structure!
          </Text>
        </div>
      </div>
    ),
  };

  return (
    <CustomModal isOpen={isOpen} toggleModal={toggleModal}>
      {!currentPanel ? (
        <div>
          <CustomButton
            onClick={() => setCurrentPanel('intelligence')}
            disabled={isIntelDisabled}
          >
            <span>🔍 Intelligence Gathering</span>
            <small>Send up to 10 Spies to collect Intel</small>
          </CustomButton>
          <CustomButton
            onClick={() => setCurrentPanel('infiltration')}
            disabled={isInfiltrationDisabled}
          >
            <span>🚧 Infiltration</span>
            <small>Infiltrate and Destroy the Fort</small>
            {isInfiltrationDisabled && (
              <b>
                <small className="text-slate-300"> Requires Upgrade: {getUpgradeInfo(user?.spyMissions['infil'].requiredLevel)}</small>
              </b>
            )}
          </CustomButton>
          <CustomButton
            onClick={() => setCurrentPanel('assassination')}
            disabled={isAssassinateDisabled}
          >
            <span>🗡️ Assassination</span>
            <small>Attempt to assassinate player&apos;s Defenders</small>
            {isAssassinateDisabled && (
              <b>
                <small className="text-slate-300"> Requires Upgrade: {getUpgradeInfo(user?.spyMissions['assass'].requiredLevel)}</small>
              </b>
            )}
          </CustomButton>
        </div>
      ) : (
        <>
          <Button
            leftIcon={<FontAwesomeIcon icon={faBackwardStep} size={'1x'} />}
            onClick={() => setCurrentPanel('')}
            mb="md"
          >
            Back
          </Button>
          {MissionPanels[currentPanel]}
        </>
      )}
    </CustomModal>
  );
};

export default SpyMissionsModal;
