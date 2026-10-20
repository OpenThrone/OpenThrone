import { faBackwardStep } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Anchor,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import router from 'next/router';
import { useTranslation } from 'next-i18next';
import type { FC } from 'react';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import QuantitySlider from '@/components/battle/QuantitySlider';
import { SpyUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';
import { clampMissionQuantity } from '@/utils/missionQuantity';
import { CITIZEN_WORKERS_TARGET } from '@/utils/spy/results';

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
      size={560}
      opened={isOpen}
      onClose={() => {
        if (!busy) toggleModal();
      }}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header p="lg">
          <Modal.Title>{title}</Modal.Title>
          <Modal.CloseButton
            size="lg"
            disabled={busy}
            aria-label={t('buttons.close')}
          />
        </Modal.Header>
        <Divider my="xs" />
        <Modal.Body p="lg">{children}</Modal.Body>
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
    py="sm"
    styles={{
      root: { height: 'auto' },
      inner: { minWidth: 0 },
      label: {
        width: '100%',
        minWidth: 0,
        height: 'auto',
        whiteSpace: 'normal',
        overflowWrap: 'anywhere',
      },
    }}
  >
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
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
  const [requestedSpies, setIntelSpies] = useState(1);
  const [requestedTurns, setMissionTurns] = useState(1);
  const [assassinateUnit, setAssassinateUnit] = useState(
    CITIZEN_WORKERS_TARGET,
  ); // Target for assassination

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

  const panel = currentPanel || 'intelligence';
  const missionConfig = {
    intelligence: {
      translation: 'intel',
      units: units.SPY,
      limit: 10,
      label: 'spiesLabel',
      countKey: 'spyCount',
    },
    infiltration: {
      translation: 'infiltration',
      units: units.INFILTRATOR,
      limit: spyLimits.INFIL.perMission,
      label: 'infiltratorsLabel',
      countKey: 'infiltratorCount',
    },
    assassination: {
      translation: 'assassination',
      units: units.ASSASSIN,
      limit: spyLimits.ASSASS.perMission,
      label: 'assassinsLabel',
      countKey: 'assassinCount',
    },
  }[panel];
  const availableTurns = Math.max(0, Math.floor(user?.attackTurns ?? 0));
  const maxSpies = Math.max(
    0,
    Math.min(missionConfig.units, missionConfig.limit),
  );
  const turnLimits = MISSION_TURN_LIMITS[panel];
  const maxTurns = Math.min(turnLimits.max, availableTurns);
  const intelSpies = clampMissionQuantity(requestedSpies, 1, maxSpies);
  const missionTurns = clampMissionQuantity(
    requestedTurns,
    turnLimits.min,
    maxTurns,
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

  const getUpgradeInfo = useCallback(
    (level = 1): string => {
      const validLevel = Math.max(0, Math.min(level, SpyUpgrades.length - 1));
      return SpyUpgrades[validLevel]?.name ?? t('spyMissions.unknownUpgrade');
    },
    [t],
  );

  const handleSpyMission = useCallback(async () => {
    const missionEnabled =
      (currentPanel === 'intelligence' && config?.enableIntel === true) ||
      (currentPanel === 'assassination' &&
        config?.enableAssassinations === true) ||
      (currentPanel === 'infiltration' && config?.enableInfiltrations === true);
    if (!missionEnabled) {
      alertService.error(t('spyMissions.unavailable'));
      return;
    }

    if (!intelSpies || !missionTurns) {
      alertService.error(t('spyMissions.unavailable'));
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
        alertService.error(results?.message ?? t('actions.spyFailed'));
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
        currentPanel === 'assassination'
          ? t('spyMissions.sentAssassins', { count: intelSpies })
          : currentPanel === 'infiltration'
            ? t('spyMissions.sentInfiltrators', { count: intelSpies })
            : t('spyMissions.sentSpies', { count: intelSpies }),
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

  const selectPanel = useCallback((nextPanel: MissionPanelKey) => {
    setCurrentPanel(nextPanel);
    setIntelSpies(1);
    setMissionTurns(MISSION_TURN_LIMITS[nextPanel].min);
  }, []);

  const canSend = intelSpies > 0 && missionTurns > 0;
  const missionPanel = (
    <Stack gap="lg">
      <div>
        <Title order={3} mb={6}>
          {t(`spyMissions.${missionConfig.translation}.title`)}
        </Title>
        <Text size="sm" c="var(--ot-muted)">
          {t('commitment.missionDescription')}
        </Text>
      </div>
      <QuantitySlider
        label={t(`commitment.${missionConfig.label}`)}
        description={
          maxSpies > 0
            ? t('commitment.availableUnits', {
                count: missionConfig.units,
                max: missionConfig.limit,
              })
            : t('commitment.noUnits')
        }
        min={1}
        max={maxSpies}
        value={intelSpies}
        onChange={setIntelSpies}
        disabled={busy}
      />
      <QuantitySlider
        label={t('spyMissions.turnsCommitted')}
        description={
          maxTurns >= turnLimits.min
            ? t(`spyMissions.${missionConfig.translation}.turnsInfo`)
            : t('commitment.notEnoughTurns', { count: turnLimits.min })
        }
        min={turnLimits.min}
        max={maxTurns}
        value={missionTurns}
        onChange={setMissionTurns}
        disabled={busy}
      />
      {currentPanel === 'assassination' && (
        <Select
          label={t('spyMissions.assassination.targetQuestion')}
          disabled={busy}
          value={assassinateUnit}
          onChange={(value) =>
            setAssassinateUnit(value ?? CITIZEN_WORKERS_TARGET)
          }
          data={[
            {
              value: CITIZEN_WORKERS_TARGET,
              label: t('spyMissions.assassination.targets.citizens'),
            },
            {
              value: 'OFFENSE',
              label: t('spyMissions.assassination.targets.offense'),
            },
            {
              value: 'DEFENSE',
              label: t('spyMissions.assassination.targets.defense'),
            },
          ]}
        />
      )}
      {currentPanel !== 'intelligence' && (
        <Text size="xs" c="var(--ot-muted)">
          {t(`spyMissions.${missionConfig.translation}.attemptsAvailable`, {
            available:
              panel === 'infiltration'
                ? spyLimits.INFIL.perUser
                : spyLimits.ASSASS.perUser,
            perDay:
              panel === 'infiltration'
                ? spyLimits.INFIL.perDay
                : spyLimits.ASSASS.perDay,
          })}
        </Text>
      )}
      <Divider />
      <Stack gap="sm">
        <Group justify="space-between" gap="xs">
          <Text size="sm" c="var(--ot-muted)">
            {t('commitment.mission')}
          </Text>
          <Text size="sm" fw={600} c="var(--ot-heading)">
            {t('commitment.unitsAndTurns', {
              units: t(`commitment.${missionConfig.countKey}`, {
                count: intelSpies,
              }),
              turns: t('commitment.turnCount', { count: missionTurns }),
            })}
          </Text>
        </Group>
        <Group justify="space-between" gap="xs">
          <Text size="xs" c="var(--ot-muted)">
            {t('commitment.remainingTurns')}
          </Text>
          <Text size="xs" c="var(--ot-muted)">
            {Math.max(0, availableTurns - missionTurns)}
          </Text>
        </Group>
        <Button
          onClick={handleSpyMission}
          loading={busy}
          disabled={busy || !canSend}
          fullWidth
          styles={{
            root: { height: 'auto', minHeight: 42 },
            label: { whiteSpace: 'normal', height: 'auto', paddingBlock: 10 },
          }}
        >
          {t(`spyMissions.${missionConfig.translation}.send`)}
        </Button>
      </Stack>
    </Stack>
  );

  return (
    <CustomModal
      isOpen={isOpen}
      toggleModal={toggleModal}
      busy={busy}
      title={
        targetName
          ? t('actions.spyTarget', { name: targetName })
          : t('spyMissions.title')
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
          {(currentPanel || allowNewTab) && (
            <Group justify="space-between" gap="sm" mb="lg">
              {currentPanel && (
                <Button
                  variant="subtle"
                  size="xs"
                  px={0}
                  leftSection={
                    <FontAwesomeIcon icon={faBackwardStep} size="1x" />
                  }
                  onClick={() => setCurrentPanel('')}
                  disabled={busy}
                >
                  {t('spyMissions.back')}
                </Button>
              )}
              {allowNewTab && (
                <Checkbox
                  size="xs"
                  checked={newTab}
                  disabled={busy}
                  onChange={(event) => setNewTab(event.currentTarget.checked)}
                  label={t('actions.newTab')}
                />
              )}
            </Group>
          )}
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            {!currentPanel ? (
              <div>
                <CustomButton
                  onClick={() => selectPanel('intelligence')}
                  disabled={isIntelDisabled}
                >
                  <span>🔍 {t('spyMissions.intel.title')}</span>
                  <small>{t('spyMissions.intel.menuDescription')}</small>
                </CustomButton>
                <CustomButton
                  onClick={() => selectPanel('infiltration')}
                  disabled={isInfiltrationDisabled}
                >
                  <span>🚧 {t('spyMissions.infiltration.title')}</span>
                  <small>{t('spyMissions.infiltration.menuDescription')}</small>
                  {isInfiltrationDisabled && (
                    <b>
                      {config?.enableInfiltrations === true ? (
                        <small className="text-slate-300">
                          {' '}
                          {t('spyMissions.requiresUpgrade', {
                            upgrade: getUpgradeInfo(
                              user?.spyMissions?.infil?.requiredLevel,
                            ),
                          })}
                        </small>
                      ) : (
                        <small className="text-slate-300">
                          {' '}
                          {t('spyMissions.disabledByAdmins')}
                        </small>
                      )}
                    </b>
                  )}
                </CustomButton>
                <CustomButton
                  onClick={() => selectPanel('assassination')}
                  disabled={isAssassinateDisabled}
                >
                  <span>🗡️ {t('spyMissions.assassination.title')}</span>
                  <small>
                    {t('spyMissions.assassination.menuDescription')}
                  </small>
                  {isAssassinateDisabled && (
                    <b>
                      {config?.enableAssassinations === true ? (
                        <small className="text-slate-300">
                          {' '}
                          {t('spyMissions.requiresUpgrade', {
                            upgrade: getUpgradeInfo(
                              user?.spyMissions?.assass?.requiredLevel,
                            ),
                          })}
                        </small>
                      ) : (
                        <small className="text-slate-300">
                          {' '}
                          {t('spyMissions.disabledByAdmins')}
                        </small>
                      )}
                    </b>
                  )}
                </CustomButton>
              </div>
            ) : (
              missionPanel
            )}
          </fieldset>
        </>
      )}
    </CustomModal>
  );
};

export default SpyMissionsModal;
