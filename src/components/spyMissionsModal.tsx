import type { FC } from 'react';
import React, { useEffect, useState } from 'react';
import { faBackwardStep } from '@fortawesome/free-solid-svg-icons';
import { useLayout } from '@/context/LayoutContext';
import { useUser } from '@/context/users';
import { alertService } from '@/services';
import router from 'next/router';
import { Button, NumberInput, Modal, Group, Select, Text, Paper, Divider, Title, Tooltip, Alert } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { SpyUpgrades } from '@/constants';

/**
 * Props for the CustomModal component.
 */
interface ModalProps {
  /** Whether the modal is currently open. */
  isOpen: boolean;
  /** Function to toggle the modal's visibility. */
  toggleModal: () => void;
  /** The content to display inside the modal body. */
  children: React.ReactNode;
}

/**
 * A reusable modal component with a standard header and structure for spy missions.
 */
const CustomModal: FC<ModalProps> = ({ isOpen, children, toggleModal }) => {
  const layoutCont = useLayout(); // Note: layoutCont is declared but not used. Consider removing if unnecessary.

  return (
    <Modal.Root
      opened={isOpen}
      onClose={toggleModal}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header >
          <Modal.Title>
            Spy Mission
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

/**
 * Props for the CustomButton component.
 */
interface CustomButtonProps {
  /** Whether the button should be disabled. */
  disabled: boolean;
  /** Function to call when the button is clicked. */
  onClick: () => void;
  /** The content to display inside the button. */
  children: React.ReactNode;
}

/**
 * A styled button component used for selecting spy mission types.
 */
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


/**
 * Props for the SpyMissionsModal component.
 */
interface SpyMissionProps {
  /** Whether the modal is currently open. */
  isOpen: boolean;
  /** Function to toggle the modal's visibility. */
  toggleModal: () => void;
  /** The ID of the user being targeted by the spy mission. */
  defenderID: number;
}

/** Type definition for the keys representing different spy mission panels. */
type MissionPanelKey = 'intelligence' | 'assassination' | 'infiltration';

/**
 * A modal component for initiating various spy missions (Intel, Assassination, Infiltration).
 * Allows the user to select a mission type, specify the number of spies/units,
 * and confirms the action. Handles enabling/disabling missions based on user upgrades
 * and environment variables.
 */
const SpyMissionsModal: FC<SpyMissionProps> = ({
  isOpen,
  toggleModal,
  defenderID,
}) => {
  const [currentPanel, setCurrentPanel] = useState<MissionPanelKey | ''>('');
  const [intelSpies, setIntelSpies] = useState(1); // Used for spy/assassin/infiltrator count
  const [assassinateUnit, setAssassinateUnit] = useState('CITIZEN/WORKERS'); // Target for assassination

  const [isAssassinateDisabled, setIsAssassinateDisabled] = useState(true);
  const [isInfiltrationDisabled, setIsInfiltrationDisabled] = useState(true);
  const [isIntelDisabled, setIsIntelDisabled] = useState(true);
  const { user } = useUser();
  const [units, setUnits] = useState({ SPY: 0, ASSASSIN: 0, INFILTRATOR: 0 });
  const [spyLimits, setSpyLimits] = useState({
    INFIL: { perUser: 0, perDay: 0, perMission: 0 },
    ASSASS: { perUser: 0, perDay: 0, perMission: 0 }
  });

  /**
   * Gets the name of the spy upgrade required for a given level.
   * @param level - The required upgrade level (defaults to 1).
   * @returns The name of the spy upgrade.
   */
  const getUpgradeInfo = (level: number = 1): string => {
    // Ensure level is within bounds
    const validLevel = Math.max(0, Math.min(level, SpyUpgrades.length - 1));
    return SpyUpgrades[validLevel]?.name ?? 'Unknown Upgrade';
  }

  // Effect to update mission availability and unit counts based on user data
  useEffect(() => {
    if (user) {
      setIsInfiltrationDisabled(
        !(user.spyMissions?.['infil']?.enabled && process.env.NEXT_PUBLIC_ENABLE_INFILTRATIONS === 'true')
      );

      setIsAssassinateDisabled(
        !(user.spyMissions?.['assass']?.enabled && process.env.NEXT_PUBLIC_ENABLE_ASSASSINATIONS === 'true')
      );

      setIsIntelDisabled(
        !(user.spyMissions?.['intel']?.enabled && process.env.NEXT_PUBLIC_ENABLE_INTEL === 'true')
      );
      setUnits({
        SPY: user.units?.find((unit) => unit.type === 'SPY' && unit.level === 1)?.quantity ?? 0,
        ASSASSIN: user.units?.find((unit) => unit.type === 'SPY' && unit.level === 3)?.quantity ?? 0,
        INFILTRATOR: user.units?.find((unit) => unit.type === 'SPY' && unit.level === 2)?.quantity ?? 0,
      });
      setSpyLimits({
        INFIL: {
          perUser: user.spyLimits?.infil?.perUser ?? 0,
          perDay: user.spyLimits?.infil?.perDay ?? 0,
          perMission: user.spyLimits?.infil?.perMission ?? 0,
        },
        ASSASS: {
          perUser: user.spyLimits?.assass?.perUser ?? 0,
          perDay: user.spyLimits?.assass?.perDay ?? 0,
          perMission: user.spyLimits?.assass?.perMission ?? 0,
        },
      });
    }
  }, [user]);

  /**
   * Handles the submission of a spy mission.
   * Sends the mission details to the appropriate API endpoint and redirects to results on success.
   */
  const handleSpyMission = async () => {
    let type = 'INTEL';
    if (currentPanel === "assassination") {
      type = 'ASSASSINATE';
    } else if (currentPanel === "infiltration") {
      type = 'INFILTRATE';
    }
    const bodyPayload = currentPanel === "assassination"
        ? { type, spies: intelSpies, unit: assassinateUnit }
        : { type, spies: intelSpies };

    const res = await fetch(`/api/spy/${defenderID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });
    const results = await res.json();

    if (results.status === 'failed') {
      alertService.error(results.message);
      return
    }
    router.push(`/battle/results/${results.attack_log}`);
    toggleModal();

    alertService.success(
      `You have sent ${intelSpies} ${currentPanel === 'assassination' ? 'assassins' : currentPanel === 'infiltration' ? 'infiltrators' : 'spies'}.`
    );
  }

  /**
   * Checks if the user has enough units (spies, assassins, or infiltrators) for the selected mission panel.
   * @returns True if the user has enough units, false otherwise.
   */
  const hasEnoughUnits = (): boolean => {
    if (currentPanel === 'intelligence') {
      return units.SPY >= intelSpies;
    } else if (currentPanel === 'assassination') {
      return units.ASSASSIN >= intelSpies;
    } else if (currentPanel === 'infiltration') {
      return units.INFILTRATOR >= intelSpies;
    }
    return false;
  };

  /** JSX elements for each specific mission panel within the modal. */
  const MissionPanels: Record<MissionPanelKey, JSX.Element> = {
    intelligence: (
      <div>
        <Title ta="center" order={3} fw={700} mb="md">Intelligence Gathering</Title>
        <Text>How many spies would you like to send?</Text>
        <Group mt="md">
          <NumberInput
            max={10} // Example limit, adjust as needed
            min={1}
            value={intelSpies}
            onChange={(value) => setIntelSpies(Number(value))}
          />
          <Tooltip
            label={!hasEnoughUnits() ? `You need at least ${intelSpies} spies` : "Send spies on an intelligence mission"}
            disabled={hasEnoughUnits()}
          >
            {/* Tooltip requires a single direct child */}
            <span>
              <Button
                onClick={handleSpyMission}
                disabled={!hasEnoughUnits()}
              >
                Send Spies
              </Button>
            </span>
          </Tooltip>
        </Group>
        <div className="mt-4">
          <Title ta="center" order={3} fw={700}>Intelligence Information</Title>
          <Text mt="md">Spies Trained: {units.SPY}</Text>
          <Text>You can send a maximum of 10 spies per mission.</Text>
        </div>
      </div>
    ),
    assassination: (
      <div>
        <Text ta="center" size="lg" fw={700} mb="md">Assassination</Text>
        <Text mt="md">How many assassins would you like to send?</Text>
        <NumberInput
          max={spyLimits.ASSASS.perMission}
          min={1}
          value={intelSpies}
          onChange={(value) => setIntelSpies(Number(value))}
          mt="md"
        />
        <Text>What Unit Type would you like to target?</Text>
        <Select
          value={assassinateUnit}
          onChange={(value) => setAssassinateUnit(value ?? 'CITIZEN/WORKERS')} // Handle null case
          data={[
            { value: 'CITIZEN/WORKERS', label: 'Citizen/Workers' },
            { value: 'OFFENSE', label: 'Offense' },
            { value: 'DEFENSE', label: 'Defense' }
          ]}
        />
        <Tooltip
          label={!hasEnoughUnits() ? `You need at least ${intelSpies} assassins` : "Send assassins on a mission"}
          disabled={hasEnoughUnits()}
        >
          <span>
            <Button
              onClick={handleSpyMission}
              disabled={!hasEnoughUnits()}
              fullWidth
              mt="md"
            >
              Assassinate
            </Button>
          </span>
        </Tooltip>
        <div className="mt-4">
          <Text ta="center" size="lg" fw={700}>Assassination Information</Text>
          <Text mt="md">Total Assassins: {units.ASSASSIN}</Text>
          <Text>You can send a maximum of {spyLimits.ASSASS.perMission} assassins per mission.</Text>
          <Text mt="md">Assassination Attempts Available: {spyLimits.ASSASS.perUser} / {spyLimits.ASSASS.perDay} today</Text>
          <Text>
            You can only send {spyLimits.ASSASS.perDay} assassination attempt(s) per 24 hours.
            To increase the number of attempts per day, upgrade your spy
            structure!
          </Text>
        </div>
      </div>
    ),
    infiltration: (
      <div>
        <Text ta="center" size="lg" fw={700} mb="md">Infiltration</Text>
        <Text>How many spies would you like to send to infiltrate?</Text>
        <Group mt="md">
          <NumberInput
            max={spyLimits.INFIL.perMission}
            min={1}
            value={intelSpies}
            onChange={(value) => setIntelSpies(Number(value))}
          />
          <Tooltip
            label={!hasEnoughUnits() ? `You need at least ${intelSpies} infiltrators` : "Send infiltrators on a mission"}
            disabled={hasEnoughUnits()}
          >
            <span>
              <Button
                onClick={handleSpyMission}
                disabled={!hasEnoughUnits()}
              >
                Infiltrate
              </Button>
            </span>
          </Tooltip>
        </Group>
        <div className="mt-4">
          <Text ta="center" size="lg" fw={700}>Infiltration Information</Text>
          <Text mt="md">Total Infiltrators: {units.INFILTRATOR}</Text>
          <Text>You can send a maximum of {spyLimits.INFIL.perMission} spies per infiltration mission.</Text>
          <Text mt="md">Infiltration Attempts Available: {spyLimits.INFIL.perUser} / {spyLimits.INFIL.perDay} today</Text>
          <Text>
            You can only send {spyLimits.INFIL.perDay} infiltration attempt(s) per 24 hours.
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
                {process.env.NEXT_PUBLIC_ENABLE_INFILTRATIONS === 'true' ?
                  <small className="text-slate-300"> Requires Upgrade: {getUpgradeInfo(user?.spyMissions?.['infil']?.requiredLevel)}</small>
                  :
                  <small className="text-slate-300"> This mission is disabled by the Administrators</small>
                }
              </b>
            )}
          </CustomButton>
          <CustomButton
            onClick={() => setCurrentPanel('assassination')}
            disabled={isAssassinateDisabled}
          >
            <span>🗡️ Assassination</span>
            <small>Attempt to assassinate player's Defenders</small>
            {isAssassinateDisabled && (
              <b>
                {process.env.NEXT_PUBLIC_ENABLE_ASSASSINATIONS === 'true' ?
                  <small className="text-slate-300"> Requires Upgrade: {getUpgradeInfo(user?.spyMissions?.['assass']?.requiredLevel)}</small>
                  :
                  <small className="text-slate-300"> This mission is disabled by the Administrators</small>
                }
              </b>
            )}
          </CustomButton>
        </div>
      ) : (
        <>
          <Button
            leftSection={<FontAwesomeIcon icon={faBackwardStep} size={'1x'} />}
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
