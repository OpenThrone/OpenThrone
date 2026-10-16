import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useTranslation } from 'next-i18next';
import { useRef, useState } from 'react';

import {
  formatEraResetLocalTime,
  formatEraResetTime,
  useEraResetSchedule,
} from '@/hooks/useEraResetSchedule';
import { resolveEraStartSettings } from '@/utils/eraStartSettings';
import {
  formatOTTime,
  getOTDayKey,
  otWallClockToDate,
} from '@/utils/timefunctions';

import EraStartSettingsFields, {
  type EraStartSettingsDraft,
  parseDraft,
  toDraft,
} from './EraStartSettingsFields';

/** 24-hour clock, seconds optional: 18:30 or 18:30:00. */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const pad = (part: number) => String(part).padStart(2, '0');

interface Props {
  era: { id: number; startDate: string; startSettings?: unknown };
  canSchedule: boolean;
}

export default function ScheduleEraReset({ era, canSchedule }: Props) {
  const { t } = useTranslation('admin-game');
  const { data, error: loadError, isLoading, mutate } = useEraResetSchedule();
  const schedule = data?.eraId === era.id ? data : null;
  const [resetDate, setResetDate] = useState<Date | null>(null);
  const [resetTime, setResetTime] = useState('');
  const [enableLogins, setEnableLogins] = useState(true);
  const [confirmation, setConfirmation] = useState('');
  const [draft, setDraft] = useState<EraStartSettingsDraft>(() =>
    toDraft(resolveEraStartSettings(era.startSettings)),
  );
  const startSettings = parseDraft(draft);
  const [opened, setOpened] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const expectedScheduleId = useRef<string | null>(null);
  const timeMatch = TIME_PATTERN.exec(resetTime.trim());
  // The typed date and time are OT Time (the sidebar clock), not the admin's zone.
  const parsedDate =
    resetDate && timeMatch
      ? otWallClockToDate(
          resetDate.getFullYear(),
          resetDate.getMonth() + 1,
          resetDate.getDate(),
          Number(timeMatch[1]),
          Number(timeMatch[2]),
          Number(timeMatch[3] ?? 0),
        )
      : null;
  const validDate = !!parsedDate && parsedDate.getTime() >= Date.now() + 60_000;
  const timeError =
    resetTime.trim() && !timeMatch ? t('eraSchedule.timeInvalid') : null;
  const dateError =
    parsedDate && !validDate ? t('eraSchedule.dateTooSoon') : null;
  const phrase = `RESET ERA ${era.id}`;

  const submit = async (action: 'schedule' | 'cancel') => {
    if (busy.current || !canSchedule) return;
    if (
      action === 'schedule' &&
      (!validDate || confirmation !== phrase || !startSettings)
    )
      return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/game/era-reset-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'cancel'
            ? { action, scheduleId: schedule?.id }
            : {
                action,
                eraId: era.id,
                expectedEraStartDate: era.startDate,
                resetAt: parsedDate?.toISOString(),
                enableLogins,
                startSettings,
                confirmation,
                expectedScheduleId: expectedScheduleId.current,
              },
        ),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          typeof result.error === 'string'
            ? result.error
            : t('eraSchedule.requestError'),
        );
      setOpened(false);
      setConfirmation('');
      await mutate();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('eraSchedule.requestError'),
      );
      await mutate();
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <Stack gap="sm" mt="lg">
      <Text fw={700}>{t('eraSchedule.title')}</Text>
      <Text size="sm" c="dimmed">
        {t('eraSchedule.description')}
      </Text>
      {loadError && (
        <Alert color="red" role="alert">
          {t('eraSchedule.loadError')}{' '}
          <Button size="xs" variant="light" onClick={() => mutate()}>
            {t('retry')}
          </Button>
        </Alert>
      )}
      {schedule && (
        <Alert color="yellow">
          {t(
            schedule.state === 'closing'
              ? 'eraSchedule.started'
              : 'eraSchedule.current',
            { time: formatEraResetTime(schedule.resetAt) },
          )}
        </Alert>
      )}
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      {canSchedule && (
        <Group>
          <Button
            disabled={
              isLoading ||
              !!loadError ||
              pending ||
              schedule?.state === 'closing'
            }
            onClick={() => {
              expectedScheduleId.current = schedule?.id ?? null;
              const existing = schedule ? new Date(schedule.resetAt) : null;
              const [y, m, d] = existing
                ? getOTDayKey(existing).split('-').map(Number)
                : [0, 0, 0];
              setResetDate(existing ? new Date(y!, m! - 1, d!) : null);
              setResetTime(
                existing
                  ? formatOTTime(existing, {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : '',
              );
              setEnableLogins(schedule?.enableLogins ?? true);
              setDraft(toDraft(resolveEraStartSettings(era.startSettings)));
              setConfirmation('');
              setError(null);
              setOpened(true);
            }}
          >
            {t(schedule ? 'eraSchedule.change' : 'eraSchedule.open')}
          </Button>
          {schedule?.state === 'pending' && (
            <Button
              variant="default"
              disabled={pending}
              onClick={() => submit('cancel')}
            >
              {t('eraSchedule.cancelSchedule')}
            </Button>
          )}
        </Group>
      )}
      <Modal
        opened={opened}
        onClose={() => {
          if (!busy.current) setOpened(false);
        }}
        title={t('eraSchedule.title')}
        centered
        closeButtonProps={{ 'aria-label': t('cancel') }}
        closeOnEscape={!pending}
        closeOnClickOutside={!pending}
        withCloseButton={!pending}
      >
        <Stack>
          <Text size="sm">{t('eraReset.losses')}</Text>
          <Text size="sm" c="dimmed">
            {t('eraReset.retained')}
          </Text>
          <Group grow align="flex-start">
            <DatePickerInput
              label={t('eraSchedule.date')}
              placeholder={t('eraSchedule.datePlaceholder')}
              value={resetDate}
              onChange={setResetDate}
              valueFormat="DD/MM/YYYY"
              minDate={new Date()}
              clearable
              error={dateError}
              disabled={pending}
              popoverProps={{ withinPortal: true }}
            />
            <TextInput
              label={t('eraSchedule.time')}
              placeholder="HH:mm:ss"
              value={resetTime}
              onChange={(event) => setResetTime(event.currentTarget.value)}
              inputMode="numeric"
              autoComplete="off"
              error={timeError}
              disabled={pending}
            />
          </Group>
          <Text size="xs" c="dimmed">
            {t('eraSchedule.dateHelp')}
          </Text>
          {validDate && parsedDate && (
            <Text size="sm">
              {t('eraSchedule.preview', {
                local: formatEraResetLocalTime(parsedDate.toISOString()),
                utc: formatEraResetTime(parsedDate.toISOString()),
              })}
            </Text>
          )}
          <EraStartSettingsFields
            value={draft}
            onChange={setDraft}
            disabled={pending}
          />
          <Checkbox
            label={t('eraReset.enableLogins')}
            checked={enableLogins}
            onChange={(event) => setEnableLogins(event.currentTarget.checked)}
            disabled={pending}
          />
          <TextInput
            label={t('eraReset.confirmLabel', { phrase })}
            value={confirmation}
            onChange={(event) => setConfirmation(event.currentTarget.value)}
            autoComplete="off"
            disabled={pending}
          />
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={pending}
              onClick={() => setOpened(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              color="red"
              loading={pending}
              disabled={!validDate || confirmation !== phrase}
              onClick={() => submit('schedule')}
            >
              {t('eraSchedule.confirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
