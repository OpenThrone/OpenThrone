import React, { useEffect, useState, useCallback } from "react";
import Alert from "@/components/alert";
import { raceClasses, useLayout } from "@/context/LayoutContext";
import { useUser } from "@/context/users";
import { alertService } from "@/services";
import { Locales, PlayerRace } from "@/types/typings";
import {
  Modal,
  Button,
  TextInput,
  Select,
  Collapse,
  Group,
  PasswordInput,
  Space,
  Card,
  Text,
  Grid
} from "@mantine/core";
import { useDisclosure, useDebouncedValue } from "@mantine/hooks";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faMinus } from "@fortawesome/free-solid-svg-icons";

const Settings = (props) => {
  const locales: Locales[] = ["en-US", "es-ES"];
  const colorSchemes: PlayerRace[] = ["UNDEAD", "HUMAN", "GOBLIN", "ELF"];
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { user, forceUpdate } = useUser();
  const { updateOptions } = useLayout();
  const [colorScheme, setColorScheme] = useState(user?.colorScheme || "UNDEAD");
  const [locale, setLocale] = useState(user?.locale || "en-US");
  const [userEmail, setUserEmail] = useState(user?.email || "");
  const [passwordsMatch, setPasswordsMatch] = useState(true);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isVacationModalOpen, setIsVacationModalOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [opened, { toggle }] = useDisclosure(false);
  const [debouncedNewPassword] = useDebouncedValue(newPassword, 300);
  const [debouncedConfirmPassword] = useDebouncedValue(confirmPassword, 300);
  const [newEmail, setNewEmail] = useState("");
  const [debouncedEmail] = useDebouncedValue(newEmail, 300);

  const checkPasswordsMatch = useCallback(() => {
    setPasswordsMatch(debouncedNewPassword === debouncedConfirmPassword);
  }, [debouncedNewPassword, debouncedConfirmPassword]);

  useEffect(() => {
    if (user) {
      setColorScheme(user.colorScheme);
      setLocale(user.locale);
      setUserEmail(user.email);
    }
  }, [user]);

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
      alertService.success("Password updated successfully.");
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
    // Handle the response
    if (response.ok) {
      alertService.success(
        "Email request sent successfully. Follow the instructions in the email to complete the process."
      );
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
    // Handle the response
    if (response.ok) {
      alertService.success(
        "Locale updated successfully, please refresh the page to see the changes."
      );
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
    // Handle the response
    if (response.ok) {
      alertService.success("Vacation mode started successfully.");
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
      alertService.success("Account reset successfully.");
      forceUpdate();
    } else {
      alertService.error(data.error);
    }
    setIsResetModalOpen(false);
  };

  return (
    <div className="mainArea pb-10">
      <Text
        style={{
          background: 'linear-gradient(360deg, orange, darkorange)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontSize: '1.5rem',
          fontWeight: 'bold',
        }}
      >
        Settings
      </Text>
      <Alert />
      <Grid gutter="lg">
        <Grid.Col span={6}>
          <Card shadow="sm" padding="lg" style={{ backgroundColor: '#1A1B1E' }}>
            <Text size="xl" fw='bolder'>Change Password</Text>
            <Text>Enter Current Password</Text>
            <PasswordInput
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={raceClasses.bgClass}
            />
            <Text>New Password</Text>
            <PasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={raceClasses.bgClass}
            />
            <Text>Verify Password</Text>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={!passwordsMatch ? 'bg-red-700' : raceClasses.bgClass}
            />
            {!passwordsMatch && (
              <Text color="red" size="xs">
                Passwords don't match.
              </Text>
            )}
              <Space h="md" />
              <Button
                className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
                onClick={updatePassword}
              >
                Save
              </Button>
          </Card>
        </Grid.Col>

        <Grid.Col span={6}>
          <Card shadow="sm" padding="lg" style={{ backgroundColor: '#1A1B1E' }}>
            <Text size="xl" fw='bolder'>Game Options</Text>
            
              <Text>Locale Formatting</Text>
              <Select
                value={locale}
                onChange={setLocale}
                data={locales.map((locale) => ({
                  value: locale,
                  label: locale,
                }))}
                className={raceClasses.bgClass}
              />
              <Text>Color Scheme</Text>
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
                Save
              </Button>
          </Card>
        </Grid.Col>

        <Grid.Col span={6}>
          <Card shadow="sm" padding="lg" style={{ backgroundColor: '#1A1B1E' }}>
            <Text size="xl" fw='bolder'>Change Email</Text>
            <Text>Current Email</Text>
            <Text c="dimmed" size="md">{userEmail}</Text>
            <Text>New Email</Text>
            <TextInput
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className={raceClasses.bgClass}
            />
            <Text size="sm" c="dimmed">An email confirmation will be sent out to confirm this change.</Text>
            <Space h="md" />
            <Button
              className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
              onClick={updateEmail}
            >
              Save
            </Button>
          </Card>
        </Grid.Col>
        <Grid.Col span={6}>
          <Card shadow="sm" padding="lg" style={{ backgroundColor: '#1A1B1E' }}>
            <Text size="xl" fw='bolder'>Vacation Mode</Text>
            <Text c="dimmed">Vacation mode allows you to temporarily disable your account.</Text>
            <Text c="dimmed">While in vacation mode, your account will be protected from attacks.</Text>
            <Text c="dimmed">You will not be able to perform any actions while in vacation mode.</Text>
            <Text c="dimmed">Vacations are limited to once every quarter and last for 2 weeks.</Text>
            <Text c="dimmed">You can end your vacation early by logging in.</Text>
            <Button
              className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
              onClick={() => setIsVacationModalOpen(true)}
            >
              Start Vacation
            </Button>
          </Card>
        </Grid.Col>
        <Grid.Col span={6}>
          <Card shadow="sm" padding="lg" style={{ backgroundColor: '#1A1B1E' }}>
            <Group>
              <Text size="xl" fw='bolder'>Reset Account</Text>
              <FontAwesomeIcon
                icon={opened ? faMinus : faPlus}
                size="xs"
                onClick={toggle}
              />
            </Group>
            <Collapse in={opened}>
              <Button
                className="rounded bg-red-500 px-4 py-2 font-bold text-white hover:bg-red-700"
                onClick={() => setIsResetModalOpen(true)}
              >
                Reset Account
              </Button>
            </Collapse>
          </Card>
        </Grid.Col>
      </Grid>

      <Modal
        opened={isVacationModalOpen}
        onClose={() => setIsVacationModalOpen(false)}
        title="Confirm Vacation Mode"
      >
        <div>
          <Text>Are you sure you want to start vacation mode?</Text>
          <Group mt="md">
            <Button variant="outline" color="gray" onClick={() => setIsVacationModalOpen(false)}>
              Cancel
            </Button>
            <Button color="blue" onClick={handleVacationMode}>
              Confirm Vacation
            </Button>
          </Group>
        </div>
      </Modal>

      <Modal
        opened={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Confirm Account Reset"
      >
        <div>
          <Text>Are you sure you want to reset your account? This action cannot be undone.</Text>
          <TextInput
            type="password"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            placeholder="Enter your password to confirm"
            className="w-full rounded-md border p-2 mt-4"
          />
          <Group align="right" mt="md">
            <Button variant="outline" color="gray" onClick={() => setIsResetModalOpen(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={handleResetAccount}>
              Confirm Reset
            </Button>
          </Group>
        </div>
      </Modal>
    </div>
  );

};

export default Settings;
