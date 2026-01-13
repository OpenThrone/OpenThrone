import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

import { useLayout } from "@/context/LayoutContext";
import { useUser } from "@/context/users";
import { alertService } from "@/services/Alert.service";
import { logInfo, logError } from "@/utils/logger";
import { Locales, PlayerRace } from "@/types/typings";
import {
  Modal,
  Button,
  TextInput,
  Textarea,
  Tooltip,
  Select,
  Collapse,
  Group,
  PasswordInput,
  Space,
  Text,
  Grid
} from "@mantine/core";
import { useDisclosure, useDebouncedValue, useLocalStorage } from "@mantine/hooks";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faMinus } from "@fortawesome/free-solid-svg-icons";
import Image from "next/image";
import MainArea from "@/components/MainArea";
import { GameCard } from "@/components/game/GameCard";

const Settings = (props) => {
  const { t } = useTranslation('home');
  const locales: Locales[] = ["en-US", "es-ES"];
  const colorSchemes: PlayerRace[] = ["UNDEAD", "HUMAN", "GOBLIN", "ELF"];
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { user, forceUpdate } = useUser();
  const { updateOptions, raceClasses } = useLayout();
  
  // Add logging for debugging
  logInfo('Settings page - user object:', user);
  logInfo('Settings page - user.twoFactorSecret:', user?.twoFactorSecret);
  
  const [colorScheme, setColorScheme] = useState(user?.colorScheme || "ELF");
  const [locale, setLocale] = useState(user?.locale || "en-US");
  const [userEmail, setUserEmail] = useState(user?.email || "");
  const [passwordsMatch, setPasswordsMatch] = useState(true);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
  const [isForgetModalOpen, setIsForgetModalOpen] = useState(false);
  const [isVacationModalOpen, setIsVacationModalOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [forgetPassword, setForgetPassword] = useState("");
  const [forgetReason, setForgetReason] = useState("");
  const [opened, { toggle }] = useDisclosure(false);
  const [debouncedNewPassword] = useDebouncedValue(newPassword, 300);
  const [debouncedConfirmPassword] = useDebouncedValue(confirmPassword, 300);
  const [newEmail, setNewEmail] = useState("");
  const [debouncedEmail] = useDebouncedValue(newEmail, 300);
  const [showQR, setShowQR] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [totpToken, setTotpToken] = useState('');

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

  const updatePassword = async () => {
    checkPasswordsMatch();
    if (!passwordsMatch) return;
    const response = await fetch("/api/account/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "password",
        password: newPassword,
        password_confirm: confirmPassword,
        currentPassword: currentPassword,
      }),
    });
    const data = await response.json();
    if(response.ok) {
      alertService.success(t('settings.passwordUpdatedSuccessfully'));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      alertService.error(data.error);
    }
  };

  const updateEmail = async () => {
    const response = await fetch("/api/account/emailChange", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ newEmail, userEmail }),
    });

    const data = await response.json();
    // Handle response
    if (response.ok) {
      alertService.success(t('settings.emailRequestSent'));
      //forceUpdate();
      updateOptions();
    } else {
      alertService.error(data.error);
    }
  }

  const updateLocale = async () => {
    const response = await fetch("/api/account/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "gameoptions",
        locale: locale,
        colorScheme: colorScheme,
      }),
    });
    const data = await response.json();
    // Handle response
    if (response.ok) {
      alertService.success(t('settings.localeUpdatedSuccessfully'));
      forceUpdate();
      updateOptions();
    } else {
      alertService.error(data.error);
    }
  };

  const handleVacationMode = async () => {
    const response = await fetch("/api/account/start-vacation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
  }

  const handleResetAccount = async () => {
    const response = await fetch("/api/account/resetAccount", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
    const response = await fetch("/api/account/disable", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
    setDisablePassword("");
  };

  const handleForgetAccount = async () => {
    const response = await fetch("/api/account/forget", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
    setForgetPassword("");
    setForgetReason("");
  };

  const handleToggle2FA = async () => {
    logInfo('handleToggle2FA called with user:', user);
    logInfo('handleToggle2FA - user.twoFactorSecret:', user?.twoFactorSecret);
    
    if (!user) {
      logError('handleToggle2FA - user object is null');
      alertService.error(t('settings.userNotLoaded'));
      return;
    }
    
    if (user.twoFactorSecret) {
      // Disable 2FA
      const response = await fetch('/api/account/disable-2fa', {
        method: 'POST',
      });
      if (response.ok) {
        alertService.success(t('settings.failedToDisable2FA'));
        forceUpdate();
      } else {
        alertService.error(t('settings.failedToDisable2FA'));
      }
    } else {
      // Enable 2FA
      const response = await fetch('/api/account/enable-2fa', {
        method: 'POST',
      });
      const data = await response.json();
      if (response.ok) {
        setQrCode(data.qrCode);
        setShowQR(true);
      } else {
        alertService.error(t('settings.failedToGenerate2FASecret'));
      }
    }
  };

  const handleVerify2FA = async () => {
    const response = await fetch('/api/account/verify-2fa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: totpToken }),
    });
    if (response.ok) {
      alertService.success(t('settings.2FAEnabled'));
      setShowQR(false);
      setTotpToken('');
      forceUpdate();
    } else {
      alertService.error(t('settings.invalidToken'));
    }
  };

  // Show loading state while user is loading
  if (!user) {
    return (
      <MainArea title={t('settings.title')}>
        <GameCard title={t('settings.title')}>
          <div>{t('settings.loadingSettings')}</div>
        </GameCard>
      </MainArea>
    );
  }

  return (
    <MainArea title={t('settings.title')}>
      <Grid gutter="lg">
        <Grid.Col span={6}>
          <GameCard title={t('settings.changePassword')}>
            <Text>{t('settings.enterCurrentPassword')}</Text>
            <PasswordInput
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={raceClasses.bgClass}
            />
            <Text>{t('settings.newPassword')}</Text>
            <PasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={raceClasses.bgClass}
            />
            <Text>{t('settings.verifyPassword')}</Text>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={!passwordsMatch ? 'bg-red-700' : raceClasses.bgClass}
            />
            {!passwordsMatch && (
              <Text color="red" size="xs">
                {t('settings.passwordsDontMatch')}
              </Text>
            )}
              <Space h="md" />
              <Button
                className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
                onClick={updatePassword}
              >
                {t('settings.save')}
              </Button>
          </GameCard>
        </Grid.Col>

        <Grid.Col span={6}>
          <GameCard title={t('settings.gameOptions')}>
              <Text>{t('settings.localeFormatting')}</Text>
              <Select
                value={locale}
                onChange={setLocale}
                data={locales.map((locale) => ({
                  value: locale,
                  label: locale,
                }))}
                className={raceClasses.bgClass}
              />
              <Text>{t('settings.colorScheme')}</Text>
              <Select
                value={colorScheme}
                onChange={setColorScheme}
                data={colorSchemes.map((color) => ({
                  value: color,
                  label: color,
                }))}
                className={raceClasses.bgClass}
            />
            <Space h="md" />
            <Button
              className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
              onClick={updateLocale}
            >
              {t('settings.save')}
            </Button>
          </GameCard>
        </Grid.Col>

        <Grid.Col span={6}>
          <GameCard title={t('settings.changeEmail')}>
            <Text>{t('settings.currentEmail')}</Text>
            <Text c="dimmed" size="md">{userEmail}</Text>
            <Text>{t('settings.newEmail')}</Text>
            <TextInput
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className={raceClasses.bgClass}
            />
            <Text size="sm" c="dimmed">{t('settings.emailConfirmation')}</Text>
            <Space h="md" />
            <Button
              className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
              onClick={updateEmail}
            >
              {t('settings.save')}
            </Button>
          </GameCard>
        </Grid.Col>
        <Grid.Col span={6}>
          <GameCard title={t('settings.vacationMode')}>
            <Text c="dimmed">{t('settings.vacationDescription')}</Text>
            <Text c="dimmed">{t('settings.vacationProtected')}</Text>
            <Text c="dimmed">{t('settings.vacationNoActions')}</Text>
            <Text c="dimmed">{t('settings.vacationLimited')}</Text>
            <Text c="dimmed">{t('settings.vacationEndEarly')}</Text>
            <Button
              className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
              onClick={() => setIsVacationModalOpen(true)}
            >
              {t('settings.startVacation')}
            </Button>
          </GameCard>
        </Grid.Col>
        <Grid.Col span={6}>
          <GameCard title={t('settings.twoFactorAuthentication')}>
            <Space h="md" />
            <Button
              className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
              onClick={handleToggle2FA}
            >
              {user?.twoFactorSecret ? t('settings.disable2FA') : t('settings.enable2FA')}
            </Button>
            {showQR && (
              <div>
                <Space h="md" />
                <Image src={qrCode} alt="QR Code" width={200} height={200} unoptimized />
                <Space h="md" />
                <TextInput
                  placeholder={t('settings.enter6DigitCode')}
                  value={totpToken}
                  onChange={(e) => setTotpToken(e.target.value)}
                />
                <Button onClick={handleVerify2FA}>
                  {t('settings.verify')}
                </Button>
              </div>
            )}
          </GameCard>
        </Grid.Col>
        <Grid.Col span={6}>
          <GameCard
            title={t('settings.accountActions')}
            action={(
              <FontAwesomeIcon
                icon={opened ? faMinus : faPlus}
                size="xs"
                onClick={toggle}
              />
            )}
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
                    color="orange"
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

      <Modal
        opened={isVacationModalOpen}
        onClose={() => setIsVacationModalOpen(false)}
        title={t('settings.confirmVacationMode')}
      >
        <div>
          <Text>{t('settings.areYouSureStartVacation')}</Text>
          <Group mt="md">
            <Button variant="outline" color="gray" onClick={() => setIsVacationModalOpen(false)}>
              {t('settings.cancel')}
            </Button>
            <Button color="blue" onClick={handleVacationMode}>
              {t('settings.confirmVacation')}
            </Button>
          </Group>
        </div>
      </Modal>

      <Modal
        opened={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title={t('settings.confirmAccountReset')}
      >
        <div>
          <Text>{t('settings.areYouSureResetAccount')}</Text>
          <TextInput
            type="password"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            placeholder={t('settings.enterPasswordConfirm')}
            className="w-full rounded-md border p-2 mt-4"
          />
          <Group align="right" mt="md">
            <Button variant="outline" color="gray" onClick={() => setIsResetModalOpen(false)}>
              {t('settings.cancel')}
            </Button>
            <Button color="red" onClick={handleResetAccount}>
              {t('settings.confirmReset')}
            </Button>
          </Group>
        </div>
      </Modal>

      <Modal
        opened={isDisableModalOpen}
        onClose={() => setIsDisableModalOpen(false)}
        title={t('settings.confirmAccountDisable')}
      >
        <div>
          <Text>{t('settings.accountWillBeClosed')}</Text>
          <TextInput
            type="password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
            placeholder={t('settings.enterPasswordConfirm')}
            className="w-full rounded-md border p-2 mt-4"
          />
          <Group align="right" mt="md">
            <Button variant="outline" color="gray" onClick={() => setIsDisableModalOpen(false)}>
              {t('settings.cancel')}
            </Button>
            <Button color="orange" onClick={handleDisableAccount}>
              {t('settings.confirmDisable')}
            </Button>
          </Group>
        </div>
      </Modal>

      <Modal
        opened={isForgetModalOpen}
        onClose={() => setIsForgetModalOpen(false)}
        title={t('settings.confirmAccountDeletion')}
      >
        <div>
          <Text>
            {t('settings.removeDataWarning')}
          </Text>
          <TextInput
            type="password"
            value={forgetPassword}
            onChange={(e) => setForgetPassword(e.target.value)}
            placeholder={t('settings.enterPasswordConfirm')}
            className="w-full rounded-md border p-2 mt-4"
          />
          <Textarea
            value={forgetReason}
            onChange={(e) => setForgetReason(e.target.value)}
            placeholder={t('settings.optionalReason')}
            className="w-full rounded-md border p-2 mt-4"
            minRows={3}
          />
          <Group align="right" mt="md">
            <Button variant="outline" color="gray" onClick={() => setIsForgetModalOpen(false)}>
              {t('settings.cancel')}
            </Button>
            <Button color="red" onClick={handleForgetAccount}>
              {t('settings.confirmDelete')}
            </Button>
          </Group>
        </div>
      </Modal>
    </MainArea>
  );

};

export default Settings;
