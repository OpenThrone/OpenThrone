import {
  faEnvelope,
  faGear,
  faKey,
  faMinus,
  faPlus,
  faShieldHalved,
  faUmbrellaBeach,
  faUserGear,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Button,
  Collapse,
  Grid,
  Group,
  List,
  PasswordInput,
  Select,
  Space,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  useDebouncedValue,
  useDisclosure,
  useLocalStorage,
} from '@mantine/hooks';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { Trans, useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useState } from 'react';

import ConfirmationModal from '@/components/ConfirmationModal';
import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import TwoFactorSettings from '@/components/TwoFactorSettings';
import { useLayout } from '@/context/LayoutContext';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import type { Locales, PlayerRace } from '@/types/typings';
import { logError } from '@/utils/logger';
import { toLocale } from '@/utils/numberFormatting';

/** Native endonyms for locale codes; intentionally not translated per-locale. */
const LOCALE_LABELS: Record<Locales, string> = {
  'en-US': 'English (US)',
  'es-ES': 'Español (ES)',
  'de-DE': 'Deutsch (DE)',
};

interface PasswordErrors {
  current?: string;
  new?: string;
  confirm?: string;
}

const Settings = () => {
  const { t, i18n } = useTranslation('home');
  const { t: tLore } = useTranslation('how-to-play');
  const router = useRouter();
  const locales: Locales[] = ['en-US', 'es-ES', 'de-DE'];
  const colorSchemes: PlayerRace[] = ['UNDEAD', 'HUMAN', 'GOBLIN', 'ELF'];
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { user, forceUpdate } = useUser();
  const { data: sessionData } = useSession();
  // /api/general/getUser strips email; the auth session carries it instead
  const sessionEmail = (sessionData?.user?.email as string) ?? '';
  const { updateOptions, raceClasses } = useLayout();

  const [colorScheme, setColorScheme] = useState(user?.colorScheme || 'ELF');
  const [locale, setLocale] = useState(user?.locale || 'en-US');
  const [userEmail, setUserEmail] = useState(user?.email || '');
  const [passwordsMatch, setPasswordsMatch] = useState(true);
  const [savingForm, setSavingForm] = useState<
    'password' | 'email' | 'options' | null
  >(null);
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({});
  const [emailError, setEmailError] = useState('');
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
  const [isForgetModalOpen, setIsForgetModalOpen] = useState(false);
  const [isVacationModalOpen, setIsVacationModalOpen] = useState(false);
  const [accountActionBusy, setAccountActionBusy] = useState(false);
  const [vacationAvailability, setVacationAvailability] = useState<{
    limit: number;
    remaining: number;
  } | null>(null);
  const [vacationAvailabilityError, setVacationAvailabilityError] =
    useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [forgetPassword, setForgetPassword] = useState('');
  const [forgetReason, setForgetReason] = useState('');
  const [opened, { toggle, open: openAccountActions }] = useDisclosure(false);
  useEffect(() => {
    if (router.asPath.includes('#forget-account')) openAccountActions();
  }, [router.asPath, openAccountActions]);
  const [debouncedNewPassword] = useDebouncedValue(newPassword, 300);
  const [debouncedConfirmPassword] = useDebouncedValue(confirmPassword, 300);
  const [newEmail, setNewEmail] = useState('');
  const [, setPreviewScheme] = useLocalStorage<PlayerRace | ''>({
    key: 'colorSchemePreview',
    defaultValue: '',
  });

  const [emailPreferences, setEmailPreferences] = useState<{
    newsEmails: boolean;
    announcementEmails: boolean;
    attackNotificationEmails: boolean;
    unsubscribedAll: boolean;
  } | null>(null);
  const [emailPreferencesError, setEmailPreferencesError] = useState(false);
  const [emailPreferencesBusy, setEmailPreferencesBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [preferencesReload, setPreferencesReload] = useState(0);
  useEffect(() => {
    if (!user?.id) return;
    const controller = new AbortController();
    setEmailPreferences(null);
    setEmailPreferencesError(false);
    const load = async () => {
      try {
        const response = await fetch('/api/account/email-preferences', {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Failed to load preferences');
        const data = await response.json();
        if (
          typeof data.newsEmails !== 'boolean' ||
          typeof data.announcementEmails !== 'boolean' ||
          typeof data.attackNotificationEmails !== 'boolean' ||
          typeof data.unsubscribedAll !== 'boolean'
        )
          throw new Error('Invalid preferences');
        if (!controller.signal.aborted) {
          setEmailPreferences({
            newsEmails: data.newsEmails,
            announcementEmails: data.announcementEmails,
            attackNotificationEmails: data.attackNotificationEmails,
            unsubscribedAll: data.unsubscribedAll,
          });
        }
      } catch {
        if (!controller.signal.aborted) setEmailPreferencesError(true);
      }
    };
    load();
    return () => controller.abort();
  }, [user?.id, preferencesReload]);

  const saveEmailPreferences = async () => {
    if (!emailPreferences || emailPreferencesBusy) return;
    setEmailPreferencesBusy(true);
    setEmailPreferencesError(false);
    try {
      const response = await fetch('/api/account/email-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailPreferences),
      });
      if (!response.ok) throw new Error('Failed to save preferences');
      alertService.success(t('settings.emailNotifications.saved'));
    } catch {
      setEmailPreferencesError(true);
    } finally {
      setEmailPreferencesBusy(false);
    }
  };
  const downloadData = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    setExportError(false);
    try {
      const response = await fetch('/api/account/export');
      if (!response.ok) throw new Error('Failed to export data');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'openthrone-data.json';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError(true);
    } finally {
      setExportBusy(false);
    }
  };

  const previewNumber = 1234567.89;

  useEffect(() => {
    if (!user?.id) return;
    const controller = new AbortController();
    setVacationAvailability(null);
    setVacationAvailabilityError(false);
    const loadAvailability = async () => {
      try {
        const response = await fetch('/api/account/vacation-availability', {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error('Failed to load vacation availability');
        const data = await response.json();
        if (
          !Number.isInteger(data.limit) ||
          !Number.isInteger(data.remaining) ||
          data.limit < 0 ||
          data.remaining < 0 ||
          data.remaining > data.limit
        ) {
          throw new Error('Invalid vacation availability');
        }
        if (!controller.signal.aborted) setVacationAvailability(data);
      } catch (error) {
        if (controller.signal.aborted) return;
        logError(error, {}, 'Error loading vacation availability');
        setVacationAvailabilityError(true);
      }
    };
    loadAvailability();
    return () => controller.abort();
  }, [user?.id]);

  const checkPasswordsMatch = useCallback(() => {
    setPasswordsMatch(debouncedNewPassword === debouncedConfirmPassword);
  }, [debouncedNewPassword, debouncedConfirmPassword]);

  useEffect(() => {
    if (user) {
      setColorScheme(user.colorScheme);
      setLocale(user.locale);
      setUserEmail(user.email);
    }
  }, [setColorScheme, setLocale, user]);

  useEffect(() => {
    checkPasswordsMatch();
  }, [debouncedNewPassword, debouncedConfirmPassword, checkPasswordsMatch]);

  useEffect(() => {
    setPreviewScheme('');
    return () => {
      setPreviewScheme('');
    };
  }, [setPreviewScheme]);

  const handleLocaleChange = (value: string | null) => {
    if (!value) return;
    setLocale(value as Locales);
  };

  const handleColorSchemeChange = (value: string | null) => {
    if (!value) return;
    const selected = value as PlayerRace;
    setColorScheme(selected);
    setPreviewScheme(selected);
    updateOptions?.();
  };

  const getLanguageFromLocale = (selectedLocale: Locales) => {
    if (selectedLocale === 'es-ES') return 'es';
    if (selectedLocale === 'de-DE') return 'de';
    return 'en';
  };

  const updatePassword = async () => {
    checkPasswordsMatch();
    const nextErrors: PasswordErrors = {};
    if (!currentPassword) nextErrors.current = t('settings.requiredField');
    if (!newPassword) nextErrors.new = t('settings.requiredField');
    if (!confirmPassword) nextErrors.confirm = t('settings.requiredField');
    else if (newPassword !== confirmPassword)
      nextErrors.confirm = t('settings.passwordsDontMatch');
    setPasswordErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSavingForm('password');
    try {
      const response = await fetch('/api/account/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'password',
          password: newPassword,
          password_confirm: confirmPassword,
          currentPassword,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        alertService.success(t('settings.passwordUpdatedSuccessfully'));
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        alertService.error(data.error);
      }
    } finally {
      setSavingForm(null);
    }
  };

  const updateEmail = async () => {
    if (!newEmail.trim()) {
      setEmailError(t('settings.requiredField'));
      return;
    }
    setEmailError('');
    setSavingForm('email');
    try {
      const response = await fetch('/api/account/emailChange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newEmail, userEmail }),
      });

      const data = await response.json();
      // Handle response
      if (response.ok) {
        alertService.success(t('settings.emailRequestSent'));
        // forceUpdate();
        updateOptions();
      } else {
        alertService.error(data.error);
      }
    } finally {
      setSavingForm(null);
    }
  };

  const updateLocale = async () => {
    setSavingForm('options');
    try {
      const response = await fetch('/api/account/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'gameoptions',
          locale,
          colorScheme,
        }),
      });
      const data = await response.json();
      // Handle response
      if (response.ok) {
        alertService.success(t('settings.localeUpdatedSuccessfully'));
        const nextLanguage = getLanguageFromLocale(locale);
        if (router.locale !== nextLanguage) {
          await router.push(
            { pathname: router.pathname, query: router.query },
            router.asPath,
            { locale: nextLanguage },
          );
        }
        if (i18n?.language !== nextLanguage) {
          await i18n?.changeLanguage(nextLanguage);
        }
        setPreviewScheme('');
        forceUpdate();
        updateOptions();
      } else {
        alertService.error(data.error);
      }
    } finally {
      setSavingForm(null);
    }
  };

  // Locks the account confirmation dialogs while a request is in flight.
  const runAccountAction = (action: () => Promise<void>) => async () => {
    if (accountActionBusy) return;
    setAccountActionBusy(true);
    try {
      await action();
    } catch (error) {
      logError(error, {}, 'Account action failed');
      alertService.error(t('settings.unexpectedError'));
    } finally {
      setAccountActionBusy(false);
    }
  };

  const handleVacationMode = async () => {
    const response = await fetch('/api/account/start-vacation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    // Handle response
    if (response.ok) {
      alertService.success(t('settings.vacationStartedSuccessfully'));
      forceUpdate();
    } else {
      alertService.error(data.error);
    }
    setIsVacationModalOpen(false);
  };

  const handleResetAccount = async () => {
    const response = await fetch('/api/account/resetAccount', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        password: resetPassword,
      }),
    });
    const data = await response.json();
    if (response.ok) {
      alertService.success(t('settings.accountResetSuccessfully'));
      forceUpdate();
    } else {
      alertService.error(data.error);
    }
    setIsResetModalOpen(false);
  };

  const handleDisableAccount = async () => {
    const response = await fetch('/api/account/disable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        password: disablePassword,
      }),
    });
    const data = await response.json();
    if (response.ok) {
      alertService.success(t('settings.accountDisabledSuccessfully'));
      forceUpdate();
    } else {
      alertService.error(data.error);
    }
    setIsDisableModalOpen(false);
    setDisablePassword('');
  };

  const handleForgetAccount = async () => {
    const response = await fetch('/api/account/forget', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        password: forgetPassword,
        reason: forgetReason,
      }),
    });
    const data = await response.json();
    if (response.ok) {
      alertService.success(t('settings.accountDataRemovedSuccessfully'));
      forceUpdate();
    } else {
      alertService.error(data.error);
    }
    setIsForgetModalOpen(false);
    setForgetPassword('');
    setForgetReason('');
  };

  // Show loading state while user is loading
  if (!user) {
    return (
      <MainArea
        title={t('settings.title')}
        icon={<FontAwesomeIcon icon={faGear} />}
      >
        <GameCard title={t('settings.title')}>
          <div>{t('settings.loadingSettings')}</div>
        </GameCard>
      </MainArea>
    );
  }

  return (
    <MainArea
      title={t('settings.title')}
      icon={<FontAwesomeIcon icon={faGear} />}
    >
      <Grid gutter="lg">
        <Grid.Col span={12}>
          <section
            id="email"
            aria-label={t('settings.emailNotifications.title')}
          >
            <GameCard
              title={t('settings.emailNotifications.title')}
              icon={faEnvelope}
            >
              <Stack>
                <Text>{t('settings.emailNotifications.essential')}</Text>
                {emailPreferencesError && (
                  <Text role="alert">
                    {t('settings.emailNotifications.error')}
                  </Text>
                )}
                {!emailPreferences && !emailPreferencesError && (
                  <Text role="status">{t('settings.loadingSettings')}</Text>
                )}
                {!emailPreferences && emailPreferencesError && (
                  <Button
                    onClick={() => setPreferencesReload((value) => value + 1)}
                  >
                    {t('settings.emailNotifications.retry')}
                  </Button>
                )}
                {emailPreferences && (
                  <>
                    <Switch
                      label={t('settings.emailNotifications.news')}
                      checked={emailPreferences.newsEmails}
                      disabled={
                        emailPreferencesBusy || emailPreferences.unsubscribedAll
                      }
                      onChange={(event) =>
                        setEmailPreferences({
                          ...emailPreferences,
                          newsEmails: event.currentTarget.checked,
                        })
                      }
                    />
                    <Switch
                      label={t('settings.emailNotifications.announcements')}
                      checked={emailPreferences.announcementEmails}
                      disabled={
                        emailPreferencesBusy || emailPreferences.unsubscribedAll
                      }
                      onChange={(event) =>
                        setEmailPreferences({
                          ...emailPreferences,
                          announcementEmails: event.currentTarget.checked,
                        })
                      }
                    />
                    <Switch
                      label={t('settings.emailNotifications.attackAlerts')}
                      checked={emailPreferences.attackNotificationEmails}
                      disabled={
                        emailPreferencesBusy || emailPreferences.unsubscribedAll
                      }
                      onChange={(event) =>
                        setEmailPreferences({
                          ...emailPreferences,
                          attackNotificationEmails: event.currentTarget.checked,
                        })
                      }
                    />
                    <Switch
                      label={t('settings.emailNotifications.all')}
                      checked={emailPreferences.unsubscribedAll}
                      disabled={emailPreferencesBusy}
                      onChange={(event) =>
                        setEmailPreferences({
                          ...emailPreferences,
                          unsubscribedAll: event.currentTarget.checked,
                        })
                      }
                    />
                    <Group>
                      <Button
                        loading={emailPreferencesBusy}
                        onClick={saveEmailPreferences}
                      >
                        {t('settings.emailNotifications.save')}
                      </Button>
                    </Group>
                  </>
                )}
                <Group>
                  <Button
                    variant="outline"
                    loading={exportBusy}
                    onClick={downloadData}
                  >
                    {t('settings.emailNotifications.export')}
                  </Button>
                </Group>
                {exportError && (
                  <Text role="alert">
                    {t('settings.emailNotifications.exportError')}
                  </Text>
                )}
              </Stack>
            </GameCard>
          </section>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <GameCard title={t('settings.changePassword')} icon={faKey}>
            <PasswordInput
              label={t('settings.enterCurrentPassword')}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              error={passwordErrors.current}
              className={raceClasses.bgClass}
            />
            <PasswordInput
              label={t('settings.newPassword')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              error={passwordErrors.new}
              className={raceClasses.bgClass}
            />
            <PasswordInput
              label={t('settings.verifyPassword')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              error={
                passwordErrors.confirm ??
                (!passwordsMatch ? t('settings.passwordsDontMatch') : undefined)
              }
              className={raceClasses.bgClass}
            />
            <Space h="md" />
            <Button
              onClick={updatePassword}
              loading={savingForm === 'password'}
              disabled={savingForm !== null}
            >
              {t('settings.save')}
            </Button>
          </GameCard>
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 6 }}>
          <GameCard title={t('settings.gameOptions')} icon={faGear}>
            <Text>{t('settings.localeFormatting')}</Text>
            <Select
              value={locale}
              onChange={handleLocaleChange}
              data={locales.map((locale) => ({
                value: locale,
                label: LOCALE_LABELS[locale],
              }))}
              className={raceClasses.bgClass}
            />
            <Text size="sm" c="dimmed">
              {t('settings.localePreview', {
                value: toLocale(previewNumber, locale),
              })}
            </Text>
            <Text>{t('settings.colorScheme')}</Text>
            <Select
              value={colorScheme}
              onChange={handleColorSchemeChange}
              data={colorSchemes.map((color) => ({
                value: color,
                label: tLore(`races.${color.toLowerCase()}.name`),
              }))}
              className={raceClasses.bgClass}
            />
            <Text size="sm" c="dimmed">
              {t('settings.colorSchemePreview')}
            </Text>
            <Space h="md" />
            <Button
              onClick={updateLocale}
              loading={savingForm === 'options'}
              disabled={savingForm !== null}
            >
              {t('settings.save')}
            </Button>
          </GameCard>
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 6 }}>
          <GameCard title={t('settings.changeEmail')} icon={faEnvelope}>
            <Stack gap={4} component="dl" m={0}>
              <Text component="dt" size="sm" c="dimmed" fw={500}>
                {t('settings.currentEmail')}
              </Text>
              <Text
                component="dd"
                size="lg"
                fw={600}
                m={0}
                style={{ overflowWrap: 'anywhere' }}
              >
                {userEmail || sessionEmail}
              </Text>
            </Stack>
            <TextInput
              mt="lg"
              label={t('settings.newEmail')}
              description={t('settings.emailConfirmation')}
              inputWrapperOrder={['label', 'input', 'description', 'error']}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              type="email"
              autoComplete="email"
              error={emailError}
              className={raceClasses.bgClass}
            />
            <Space h="md" />
            <Button
              onClick={updateEmail}
              loading={savingForm === 'email'}
              disabled={savingForm !== null}
            >
              {t('settings.save')}
            </Button>
          </GameCard>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <GameCard title={t('settings.vacationMode')} icon={faUmbrellaBeach}>
            <Text size="sm" c="var(--ot-muted)" mb="md">
              {t('settings.vacationDescription')}
            </Text>
            <List
              spacing="sm"
              size="md"
              styles={{
                root: {
                  paddingInlineStart: '1.25rem',
                  listStyleType: 'disc',
                  listStylePosition: 'outside',
                  color: 'var(--ot-body)',
                },
                item: { whiteSpace: 'normal', listStyleType: 'disc' },
                itemWrapper: { display: 'inline' },
              }}
            >
              {[
                'vacationProtected',
                'vacationNoActions',
                'vacationLimited',
                'vacationEndEarly',
                'vacationGold',
                vacationAvailability
                  ? 'vacationAvailable'
                  : vacationAvailabilityError
                    ? 'vacationAvailabilityFailed'
                    : 'vacationAvailabilityLoading',
              ].map((key) => (
                <List.Item key={key}>
                  <Trans
                    t={t}
                    i18nKey={`settings.${key}`}
                    count={
                      key === 'vacationAvailable'
                        ? vacationAvailability?.remaining
                        : undefined
                    }
                    values={
                      key === 'vacationAvailable'
                        ? {
                            available: toLocale(
                              vacationAvailability.remaining,
                              locale,
                            ),
                          }
                        : undefined
                    }
                    components={{
                      strong: <Text component="strong" inherit fw={600} />,
                    }}
                  />
                </List.Item>
              ))}
            </List>
            <Button
              mt="lg"
              disabled={
                !vacationAvailability || vacationAvailability.remaining === 0
              }
              onClick={() => setIsVacationModalOpen(true)}
            >
              {t('settings.startVacation')}
            </Button>
          </GameCard>
        </Grid.Col>
        <Grid.Col id="two-factor" span={{ base: 12, sm: 6 }}>
          <GameCard
            title={t('settings.twoFactorAuthentication')}
            icon={faShieldHalved}
          >
            <TwoFactorSettings
              enabled={user.twoFactorEnabled}
              onChange={forceUpdate}
              recommended={router.query.setup2fa === '1'}
            />
          </GameCard>
        </Grid.Col>
        <Grid.Col id="forget-account" span={{ base: 12, sm: 6 }}>
          <GameCard
            title={t('settings.accountActions')}
            icon={faUserGear}
            action={
              <FontAwesomeIcon
                icon={opened ? faMinus : faPlus}
                size="xs"
                onClick={toggle}
              />
            }
          >
            <Collapse in={opened}>
              <Group mt="md" gap="md" wrap="wrap">
                <Tooltip label={t('settings.resetAccountTooltip')} withArrow>
                  <Button
                    color="red"
                    className="rounded px-4 py-2 font-bold"
                    onClick={() => setIsResetModalOpen(true)}
                  >
                    {t('settings.resetAccount')}
                  </Button>
                </Tooltip>
                <Tooltip label={t('settings.disableAccountTooltip')} withArrow>
                  <Button
                    color="red"
                    className="rounded px-4 py-2 font-bold"
                    onClick={() => setIsDisableModalOpen(true)}
                  >
                    {t('settings.disableAccount')}
                  </Button>
                </Tooltip>
                <Tooltip label={t('settings.forgetMeTooltip')} withArrow>
                  <Button
                    color="red"
                    className="rounded px-4 py-2 font-bold"
                    onClick={() => setIsForgetModalOpen(true)}
                  >
                    {t('settings.forgetMe')}
                  </Button>
                </Tooltip>
              </Group>
            </Collapse>
          </GameCard>
        </Grid.Col>
      </Grid>

      <ConfirmationModal
        isOpen={isVacationModalOpen}
        onClose={() => !accountActionBusy && setIsVacationModalOpen(false)}
        onConfirm={runAccountAction(handleVacationMode)}
        title={t('settings.confirmVacationMode')}
        message={t('settings.areYouSureStartVacation')}
        type="primary"
        confirmText={t('settings.confirmVacation')}
        cancelText={t('settings.cancel')}
        isLoading={accountActionBusy}
      />

      <ConfirmationModal
        isOpen={isResetModalOpen}
        onClose={() => !accountActionBusy && setIsResetModalOpen(false)}
        onConfirm={runAccountAction(handleResetAccount)}
        title={t('settings.confirmAccountReset')}
        message={t('settings.areYouSureResetAccount')}
        type="destructive"
        confirmText={t('settings.confirmReset')}
        cancelText={t('settings.cancel')}
        isLoading={accountActionBusy}
        confirmDisabled={!resetPassword}
      >
        <PasswordInput
          value={resetPassword}
          onChange={(e) => setResetPassword(e.currentTarget.value)}
          placeholder={t('settings.enterPasswordConfirm')}
          aria-label={t('settings.enterPasswordConfirm')}
          autoComplete="current-password"
          disabled={accountActionBusy}
          data-autofocus
        />
      </ConfirmationModal>

      <ConfirmationModal
        isOpen={isDisableModalOpen}
        onClose={() => !accountActionBusy && setIsDisableModalOpen(false)}
        onConfirm={runAccountAction(handleDisableAccount)}
        title={t('settings.confirmAccountDisable')}
        message={t('settings.accountWillBeClosed')}
        type="destructive"
        confirmText={t('settings.confirmDisable')}
        cancelText={t('settings.cancel')}
        isLoading={accountActionBusy}
        confirmDisabled={!disablePassword}
      >
        <PasswordInput
          value={disablePassword}
          onChange={(e) => setDisablePassword(e.currentTarget.value)}
          placeholder={t('settings.enterPasswordConfirm')}
          aria-label={t('settings.enterPasswordConfirm')}
          autoComplete="current-password"
          disabled={accountActionBusy}
          data-autofocus
        />
      </ConfirmationModal>

      <ConfirmationModal
        isOpen={isForgetModalOpen}
        onClose={() => !accountActionBusy && setIsForgetModalOpen(false)}
        onConfirm={runAccountAction(handleForgetAccount)}
        title={t('settings.confirmAccountDeletion')}
        message={t('settings.removeDataWarning')}
        type="destructive"
        confirmText={t('settings.confirmDelete')}
        cancelText={t('settings.cancel')}
        isLoading={accountActionBusy}
        confirmDisabled={!forgetPassword}
      >
        <PasswordInput
          value={forgetPassword}
          onChange={(e) => setForgetPassword(e.currentTarget.value)}
          placeholder={t('settings.enterPasswordConfirm')}
          aria-label={t('settings.enterPasswordConfirm')}
          autoComplete="current-password"
          disabled={accountActionBusy}
          data-autofocus
        />
        <Textarea
          value={forgetReason}
          onChange={(e) => setForgetReason(e.currentTarget.value)}
          placeholder={t('settings.optionalReason')}
          aria-label={t('settings.optionalReason')}
          disabled={accountActionBusy}
          minRows={3}
          autosize
        />
      </ConfirmationModal>
    </MainArea>
  );
};

export default Settings;
