import { faEllipsis } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Modal,
  Text,
  Tooltip,
} from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useRef, useState } from 'react';

import AttackModal from '@/components/modal';
import NewMessageModal from '@/components/NewMessageModal';
import actionClasses from '@/components/ProfileActions.module.css';
import RecruitmentFlow from '@/components/RecruitmentFlow';
import RpgAwesomeIcon from '@/components/RpgAwesomeIcon';
import SpyMissionsModal from '@/components/spyMissionsModal';
import { useUser } from '@/context/users';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';
import {
  recruitBlockMessage,
  type RecruitmentStatus,
} from '@/utils/recruitmentStatus';

import classes from './PlayerActions.module.css';

export type PlayerAction =
  | 'attack'
  | 'spy'
  | 'message'
  | 'recruit'
  | 'friend'
  | 'enemy';
export interface ActionTarget {
  id: number;
  name: string;
  level: number;
  recruitLink: string;
  avatar?: string | null;
  race?: string;
  class?: string;
  isFriend: boolean;
  isEnemy: boolean;
}
export interface SelectedPlayerAction {
  action: PlayerAction;
  target: ActionTarget;
}

export function PlayerActions({
  target,
  onSelect,
  recruitStatus,
}: {
  target: ActionTarget;
  onSelect: (selection: SelectedPlayerAction) => void;
  recruitStatus?: RecruitmentStatus | null;
}) {
  const { t } = useTranslation('battle');
  const { t: common } = useTranslation('common');
  const { user } = useUser();
  const { config, error } = useRuntimeConfig();
  if (!user || target.id === user.id) return null;
  const range = config?.attackLevelRange;
  const reason = !config
    ? common(error ? 'profileActions.configError' : 'profileActions.loading')
    : range !== undefined && Math.abs(user.level - target.level) > range
      ? common('profileActions.outOfRange', { range })
      : null;
  const attackReason =
    reason ??
    (config?.enableAttacking
      ? null
      : common('profileActions.attackingDisabled'));
  const spyReason =
    reason ??
    (config?.enableIntel ||
    config?.enableInfiltrations ||
    config?.enableAssassinations
      ? null
      : common('profileActions.spyDisabled'));
  const messageReason =
    user.id !== 1 && user.id !== 2 ? t('actions.messagingUnavailable') : null;
  const recruitReason = !target.recruitLink
    ? t('actions.recruitUnavailable')
    : recruitBlockMessage(common, recruitStatus, target.id, target.name);
  const buttons = [
    {
      action: 'attack',
      icon: 'crossed-swords',
      reason: attackReason,
      tone: 'danger',
    },
    { action: 'spy', icon: 'hood', reason: spyReason, tone: 'arcane' },
    { action: 'message', icon: 'quill-ink', reason: messageReason },
    {
      action: 'recruit',
      icon: 'double-team',
      reason: recruitReason,
    },
  ] as const;
  return (
    <Group
      gap={6}
      wrap="nowrap"
      className={classes.actions}
      data-player-actions-id={target.id}
    >
      {buttons.map(({ action, icon, reason: disabledReason, ...tone }) => (
        <Tooltip
          key={action}
          label={disabledReason ?? t(`actions.${action}`)}
          events={{ hover: true, focus: true, touch: false }}
        >
          <Button
            size="compact-xs"
            styles={{ inner: { gap: 0 } }}
            className={`${actionClasses.action} ${classes.button}`}
            data-tone={'tone' in tone ? tone.tone : undefined}
            data-disabled={disabledReason ? true : undefined}
            aria-disabled={!!disabledReason}
            aria-label={`${t(`actions.${action}Target`, { name: target.name })}${disabledReason ? `: ${disabledReason}` : ''}`}
            leftSection={<RpgAwesomeIcon icon={icon} aria-hidden />}
            onClick={() => {
              if (!disabledReason) onSelect({ action, target });
            }}
          >
            {t(`actions.${action}`)}
          </Button>
        </Tooltip>
      ))}
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon
            variant="default"
            aria-label={t('actions.moreTarget', { name: target.name })}
          >
            <FontAwesomeIcon icon={faEllipsis} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item component={Link} href={`/userprofile/${target.id}`}>
            {t('actions.viewProfile')}
          </Menu.Item>
          {config?.enableSocial && (
            <>
              <Menu.Item
                disabled={target.isFriend}
                onClick={() => onSelect({ action: 'friend', target })}
              >
                {t(
                  target.isFriend
                    ? 'actions.alreadyFriend'
                    : 'actions.addFriend',
                )}
              </Menu.Item>
              {config.enableEnemies && (
                <Menu.Item
                  onClick={() => onSelect({ action: 'enemy', target })}
                >
                  {t(
                    target.isEnemy ? 'actions.removeEnemy' : 'actions.addEnemy',
                  )}
                </Menu.Item>
              )}
            </>
          )}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

export function PlayerActionDialogs({
  selection,
  onClose,
  onSocialChange,
  onRecruited,
}: {
  selection: SelectedPlayerAction | null;
  onClose: () => void;
  onSocialChange: (target: ActionTarget, action: 'friend' | 'enemy') => void;
  onRecruited?: () => void;
}) {
  const { t } = useTranslation('battle');
  const { forceUpdate } = useUser();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  if (!selection) return null;
  const { target, action } = selection;
  if (action === 'attack')
    return (
      <AttackModal
        isOpen
        toggleModal={onClose}
        profileID={target.id}
        targetName={target.name}
        allowNewTab
      />
    );
  if (action === 'spy')
    return (
      <SpyMissionsModal
        isOpen
        toggleModal={onClose}
        defenderID={target.id}
        targetName={target.name}
        allowNewTab
      />
    );
  if (action === 'message')
    return (
      <NewMessageModal
        opened
        onClose={onClose}
        onRoomCreated={() => alertService.success(t('actions.messageSent'))}
        prefillRecipient={{
          id: target.id,
          label: target.name,
          image: target.avatar,
          race: target.race,
          class: target.class,
        }}
      />
    );
  if (action === 'recruit')
    return (
      <Modal
        opened
        onClose={() => {
          if (!busy) onClose();
        }}
        closeOnEscape={!busy}
        closeOnClickOutside={!busy}
        withCloseButton={!busy}
        title={t('actions.recruitTarget', { name: target.name })}
        centered
      >
        <RecruitmentFlow
          recruitLink={target.recruitLink}
          targetId={target.id}
          targetName={target.name}
          onRecruited={onRecruited}
          embedded
          onBusyChange={setBusy}
        />
      </Modal>
    );
  const socialAction = action;
  const remove = socialAction === 'enemy' && target.isEnemy;
  const submit = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/social/${remove ? 'remove' : 'add'}`, {
        method: remove ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendId: target.id,
          relationshipType: socialAction === 'friend' ? 'FRIEND' : 'ENEMY',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          typeof data.error === 'string'
            ? data.error
            : t('actions.socialFailed'),
        );
        return;
      }
      onSocialChange(target, socialAction);
      forceUpdate();
      alertService.success(t('actions.socialUpdated'));
      onClose();
    } catch (error) {
      logError(error, 'Player social action failed');
      setError(t('actions.socialFailed'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      opened
      onClose={() => {
        if (!busy) onClose();
      }}
      closeOnEscape={!busy}
      closeOnClickOutside={!busy}
      withCloseButton={!busy}
      title={t(
        remove
          ? 'actions.removeEnemy'
          : socialAction === 'friend'
            ? 'actions.addFriend'
            : 'actions.addEnemy',
      )}
      centered
    >
      <Text mb="md">{target.name}</Text>
      {error && (
        <Text role="alert" mb="md">
          {error}
        </Text>
      )}
      <Button onClick={submit} loading={busy}>
        {t('actions.confirm')}
      </Button>
    </Modal>
  );
}
