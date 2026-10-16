import { faBackwardStep } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import router from 'next/router';
import { useTranslation } from 'next-i18next';
import type { FC } from 'react';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import { SpyUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';

interface ModalProps {
  isOpen: boolean;
  toggleModal: () => void;
  children: React.ReactNode;
  busy?: boolean;
  title?: string;
}

const CustomModal: FC<ModalProps> = ({
  isOpen,
  children,
  toggleModal,
  busy,
  title,
}) => {
  const { t } = useTranslation('common');
  return (
    <Modal.Root
      opened={isOpen}
      onClose={() => {
        if (!busy) toggleModal();
      }}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>{title ?? 'Spy Mission'}</Modal.Title>
          <Modal.CloseButton
            size="lg"
            disabled={busy}
            aria-label={t('buttons.close')}
          />
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
    mb="lg"
  >
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: '2px',
      }}
    >
      {children}
    </div>
  </Button>
);

interface SpyMissionProps {
  isOpen: boolean;
  toggleModal: () => void;
  defenderID: number;
  targetName?: string;
  allowNewTab?: boolean;
}

/** Type definition for the keys representing different spy mission panels. */
type MissionPanelKey = 'intelligence' | 'assassination' | 'infiltration';

const MISSION_TURN_LIMITS: Record<
  MissionPanelKey,
  { min: number; max: number }
> = {
  intelligence: { min: 1, max: 5 },
  infiltration: { min: 2, max: 10 },
  assassination: { min: 3, max: 10 },
};

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
  targetName,
  allowNewTab = false,
}) => {
  const { t } = useTranslation('battle');
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [newTab, setNewTab] = useLocalStorage({
    key: 'battle-report-new-tab',
    defaultValue: false,
  });
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [currentPanel, setCurrentPanel] = useState<MissionPanelKey | ''>('');
  const [intelSpies, setIntelSpies] = useState(1);
  const [missionTurns, setMissionTurns] = useState(1);
  const [assassinateUnit, setAssassinateUnit] = useState('CITIZEN/WORKERS'); // Target for assassination

  const { user, forceUpdate } = useUser();
  const { config } = useRuntimeConfig();

  const units = useMemo(
    () => ({
      SPY:
        user?.units?.find((unit) => unit.type === 'SPY' && unit.level === 1)
          ?.quantity ?? 0,
      ASSASSIN:
        user?.units?.find((unit) => unit.type === 'SPY' && unit.level === 3)
          ?.quantity ?? 0,
      INFILTRATOR:
        user?.units?.find((unit) => unit.type === 'SPY' && unit.level === 2)
          ?.quantity ?? 0,
    }),
    [user],
  );

  const spyLimits = useMemo(
    () => ({
      INFIL: {
        perUser: user?.spyLimits?.infil?.perUser ?? 0,
        perDay: user?.spyLimits?.infil?.perDay ?? 0,
        perMission: user?.spyLimits?.infil?.perMission ?? 0,
      },
      ASSASS: {
        perUser: user?.spyLimits?.assass?.perUser ?? 0,
        perDay: user?.spyLimits?.assass?.perDay ?? 0,
        perMission: user?.spyLimits?.assass?.perMission ?? 0,
      },
    }),
    [user],
  );

  const isInfiltrationDisabled = !(
    user?.spyMissions?.infil?.enabled && config?.enableInfiltrations === true
  );
  const isAssassinateDisabled = !(
    user?.spyMissions?.assass?.enabled && config?.enableAssassinations === true
  );
  const isIntelDisabled = !(
    user?.spyMissions?.intel?.enabled && config?.enableIntel === true
  );

  const getUpgradeInfo = useCallback((level = 1): string => {
    const validLevel = Math.max(0, Math.min(level, SpyUpgrades.length - 1));
    return SpyUpgrades[validLevel]?.name ?? 'Unknown Upgrade';
  }, []);

  const handleSpyMission = useCallback(async () => {
    const missionEnabled =
      (currentPanel === 'intelligence' && config?.enableIntel === true) ||
      (currentPanel === 'assassination' &&
        config?.enableAssassinations === true) ||
      (currentPanel === 'infiltration' && config?.enableInfiltrations === true);
    if (!missionEnabled) {
      alertService.error('This spy mission is currently unavailable.');
      return;
    }

    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    const reportTab =
      allowNewTab && newTab ? window.open('about:blank', '_blank') : null;
    if (reportTab) reportTab.opener = null;
    try {
      let type: 'INTEL' | 'ASSASSINATE' | 'INFILTRATE';
      if (currentPanel === 'assassination') {
        type = 'ASSASSINATE';
      } else if (currentPanel === 'infiltration') {
        type = 'INFILTRATE';
      } else {
        type = 'INTEL';
      }
      const bodyPayload =
        currentPanel === 'assassination'
          ? {
              type,
              spies: intelSpies,
              turns: missionTurns,
              unit: assassinateUnit,
            }
          : { type, spies: intelSpies, turns: missionTurns };

      const idempotencyKey = `spy-${defenderID}-${type}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;

      const res = await fetch(`/api/spy/${defenderID}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(bodyPayload),
      });
      const results = await res.json();

      if (
        !res.ok ||
        results.status === 'failed' ||
        !results?.attack_log ||
        Number.isNaN(Number(results.attack_log))
      ) {
        reportTab?.close();
        alertService.error(results?.message ?? 'Unable to run spy mission.');
        return;
      }
      forceUpdate();
      const url = `/battle/results/${Number(results.attack_log)}`;
      if (allowNewTab && newTab) {
        if (reportTab && !reportTab.closed) {
          reportTab.location.replace(url);
          toggleModal();
        } else setReportUrl(url);
      } else {
        await router.push(url);
        toggleModal();
      }

      alertService.success(
        `You have sent ${intelSpies} ${currentPanel === 'assassination' ? 'assassins' : currentPanel === 'infiltration' ? 'infiltrators' : 'spies'}.`,
      );
    } catch (error) {
      reportTab?.close();
      logError(error, { defenderID }, 'Spy submission failed');
      alertService.error(t('actions.spyFailed'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }, [
    allowNewTab,
    newTab,
    forceUpdate,
    t,
    currentPanel,
    config,
    intelSpies,
    missionTurns,
    assassinateUnit,
    defenderID,
    toggleModal,
  ]);

  const hasEnoughUnits = useCallback((): boolean => {
    if (currentPanel === 'intelligence') {
      return units.SPY >= intelSpies;
    }
    if (currentPanel === 'assassination') {
      return units.ASSASSIN >= intelSpies;
    }
    if (currentPanel === 'infiltration') {
      return units.INFILTRATOR >= intelSpies;
    }
    return false;
  }, [currentPanel, units, intelSpies]);

  const hasEnoughTurns = useCallback((): boolean => {
    const turnsAvailable = user?.attackTurns ?? 0;
    return turnsAvailable >= missionTurns;
  }, [user, missionTurns]);

  const selectPanel = useCallback((panel: MissionPanelKey) => {
    setCurrentPanel(panel);
    setMissionTurns(MISSION_TURN_LIMITS[panel].min);
  }, []);

  const turnInput = useCallback(
    (panel: MissionPanelKey) => (
      <NumberInput
        label="Turns committed"
        description="More turns increase mission depth and risk."
        max={MISSION_TURN_LIMITS[panel].max}
        min={MISSION_TURN_LIMITS[panel].min}
        value={missionTurns}
        onChange={(value) => setMissionTurns(Number(value))}
        mt="md"
      />
    ),
    [missionTurns],
  );

  /** JSX elements for each specific mission panel within the modal. */
  const MissionPanels = useMemo<Record<MissionPanelKey, JSX.Element>>(
    () => ({
      intelligence: (
        <div>
          <Title ta="center" order={3} fw={700} mb="md">
            Intelligence Gathering
          </Title>
          <Text>How many spies would you like to send?</Text>
          <Group mt="md">
            <NumberInput
              max={10}
              min={1}
              value={intelSpies}
              onChange={(value) => setIntelSpies(Number(value))}
            />
            <Tooltip
              label={
                !hasEnoughUnits()
                  ? `You need at least ${intelSpies} spies`
                  : !hasEnoughTurns()
                    ? `You need at least ${missionTurns} turns`
                    : 'Send spies on an intelligence mission'
              }
              disabled={hasEnoughUnits() && hasEnoughTurns()}
            >
              <span>
                <Button
                  onClick={handleSpyMission}
                  loading={busy}
                  disabled={busy || !hasEnoughUnits() || !hasEnoughTurns()}
                >
                  Send Spies
                </Button>
              </span>
            </Tooltip>
          </Group>
          {turnInput('intelligence')}
          <div className="mt-4">
            <Title ta="center" order={3} fw={700}>
              Intelligence Information
            </Title>
            <Text mt="md">Spies Trained: {units.SPY}</Text>
            <Text>You can send a maximum of 10 spies per mission.</Text>
            <Text>
              Intelligence missions use 1 to 5 attack turns. More turns improve
              report quality.
            </Text>
          </div>
        </div>
      ),
      assassination: (
        <div>
          <Text ta="center" size="lg" fw={700} mb="md">
            Assassination
          </Text>
          <Text mt="md">How many assassins would you like to send?</Text>
          <NumberInput
            max={spyLimits.ASSASS.perMission}
            min={1}
            value={intelSpies}
            onChange={(value) => setIntelSpies(Number(value))}
            mt="md"
          />
          {turnInput('assassination')}
          <Text>What Unit Type would you like to target?</Text>
          <Select
            value={assassinateUnit}
            onChange={(value) => setAssassinateUnit(value ?? 'CITIZEN/WORKERS')}
            data={[
              { value: 'CITIZEN/WORKERS', label: 'Citizen/Workers' },
              { value: 'OFFENSE', label: 'Offense' },
              { value: 'DEFENSE', label: 'Defense' },
            ]}
          />
          <Tooltip
            label={
              !hasEnoughUnits()
                ? `You need at least ${intelSpies} assassins`
                : !hasEnoughTurns()
                  ? `You need at least ${missionTurns} turns`
                  : 'Send assassins on a mission'
            }
            disabled={hasEnoughUnits() && hasEnoughTurns()}
          >
            <span>
              <Button
                onClick={handleSpyMission}
                loading={busy}
                disabled={busy || !hasEnoughUnits() || !hasEnoughTurns()}
                fullWidth
                mt="md"
              >
                Assassinate
              </Button>
            </span>
          </Tooltip>
          <div className="mt-4">
            <Text ta="center" size="lg" fw={700}>
              Assassination Information
            </Text>
            <Text mt="md">Total Assassins: {units.ASSASSIN}</Text>
            <Text>
              You can send a maximum of {spyLimits.ASSASS.perMission} assassins
              per mission.
            </Text>
            <Text mt="md">
              Assassination Attempts Available: {spyLimits.ASSASS.perUser} /{' '}
              {spyLimits.ASSASS.perDay} today
            </Text>
            <Text>
              You can only send {spyLimits.ASSASS.perDay} assassination
              attempt(s) per 24 hours. To increase the number of attempts per
              day, upgrade your spy structure!
            </Text>
            <Text>
              Assassinations use 3 to 10 attack turns. More turns increase
              mission depth and exposure.
            </Text>
          </div>
        </div>
      ),
      infiltration: (
        <div>
          <Text ta="center" size="lg" fw={700} mb="md">
            Infiltration
          </Text>
          <Text>How many spies would you like to send to infiltrate?</Text>
          <Group mt="md">
            <NumberInput
              max={spyLimits.INFIL.perMission}
              min={1}
              value={intelSpies}
              onChange={(value) => setIntelSpies(Number(value))}
            />
            <Tooltip
              label={
                !hasEnoughUnits()
                  ? `You need at least ${intelSpies} infiltrators`
                  : !hasEnoughTurns()
                    ? `You need at least ${missionTurns} turns`
                    : 'Send infiltrators on a mission'
              }
              disabled={hasEnoughUnits() && hasEnoughTurns()}
            >
              <span>
                <Button
                  onClick={handleSpyMission}
                  loading={busy}
                  disabled={busy || !hasEnoughUnits() || !hasEnoughTurns()}
                >
                  Infiltrate
                </Button>
              </span>
            </Tooltip>
          </Group>
          {turnInput('infiltration')}
          <div className="mt-4">
            <Text ta="center" size="lg" fw={700}>
              Infiltration Information
            </Text>
            <Text mt="md">Total Infiltrators: {units.INFILTRATOR}</Text>
            <Text>
              You can send a maximum of {spyLimits.INFIL.perMission} spies per
              infiltration mission.
            </Text>
            <Text mt="md">
              Infiltration Attempts Available: {spyLimits.INFIL.perUser} /{' '}
              {spyLimits.INFIL.perDay} today
            </Text>
            <Text>
              You can only send {spyLimits.INFIL.perDay} infiltration attempt(s)
              per 24 hours. To increase the number of attempts per day, upgrade
              your spy structure!
            </Text>
            <Text>
              Infiltrations use 2 to 10 attack turns. More turns increase
              sabotage depth and exposure.
            </Text>
          </div>
        </div>
      ),
    }),
    [
      units,
      spyLimits,
      intelSpies,
      assassinateUnit,
      missionTurns,
      handleSpyMission,
      busy,
      hasEnoughUnits,
      hasEnoughTurns,
      turnInput,
    ],
  );

  return (
    <CustomModal
      isOpen={isOpen}
      toggleModal={toggleModal}
      busy={busy}
      title={
        targetName ? t('actions.spyTarget', { name: targetName }) : undefined
      }
    >
      {reportUrl ? (
        <Text role="status">
          {t('actions.reportReady')}{' '}
          <Anchor href={reportUrl} target="_blank" rel="noopener noreferrer">
            {t('actions.viewReport')}
          </Anchor>
        </Text>
      ) : (
        <>
          {allowNewTab && (
            <Checkbox
              mb="md"
              checked={newTab}
              disabled={busy}
              onChange={(event) => setNewTab(event.currentTarget.checked)}
              label={t('actions.newTab')}
            />
          )}
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            {!currentPanel ? (
              <div>
                <CustomButton
                  onClick={() => selectPanel('intelligence')}
                  disabled={isIntelDisabled}
                >
                  <span>🔍 Intelligence Gathering</span>
                  <small>Send up to 10 Spies to collect Intel</small>
                </CustomButton>
                <CustomButton
                  onClick={() => selectPanel('infiltration')}
                  disabled={isInfiltrationDisabled}
                >
                  <span>🚧 Infiltration</span>
                  <small>Infiltrate and Destroy the Fort</small>
                  {isInfiltrationDisabled && (
                    <b>
                      {config?.enableInfiltrations === true ? (
                        <small className="text-slate-300">
                          {' '}
                          Requires Upgrade:{' '}
                          {getUpgradeInfo(
                            user?.spyMissions?.infil?.requiredLevel,
                          )}
                        </small>
                      ) : (
                        <small className="text-slate-300">
                          {' '}
                          This mission is disabled by the Administrators
                        </small>
                      )}
                    </b>
                  )}
                </CustomButton>
                <CustomButton
                  onClick={() => selectPanel('assassination')}
                  disabled={isAssassinateDisabled}
                >
                  <span>🗡️ Assassination</span>
                  <small>Attempt to assassinate player&apos;s Defenders</small>
                  {isAssassinateDisabled && (
                    <b>
                      {config?.enableAssassinations === true ? (
                        <small className="text-slate-300">
                          {' '}
                          Requires Upgrade:{' '}
                          {getUpgradeInfo(
                            user?.spyMissions?.assass?.requiredLevel,
                          )}
                        </small>
                      ) : (
                        <small className="text-slate-300">
                          {' '}
                          This mission is disabled by the Administrators
                        </small>
                      )}
                    </b>
                  )}
                </CustomButton>
              </div>
            ) : (
              <>
                <Button
                  leftSection={
                    <FontAwesomeIcon icon={faBackwardStep} size="1x" />
                  }
                  onClick={() => setCurrentPanel('')}
                  mb="md"
                >
                  Back
                </Button>
                {MissionPanels[currentPanel]}
              </>
            )}
          </fieldset>
        </>
      )}
    </CustomModal>
  );
};

export default SpyMissionsModal;
