import Alert from "@/components/alert";
import { useLayout } from "@/context/LayoutContext";
import { useUser } from "@/context/users";
import { alertService } from "@/services";
import { Locales, PlayerRace } from "@/types/typings";
import { useEffect, useState } from "react";
import { Modal, Button, TextInput, Select } from '@mantine/core'; // Importing Mantine components

const Settings = (props) => {
  const locales: Locales[] = ['en-US', 'es-ES'];
  const colorSchemes: PlayerRace[] = ['UNDEAD', 'HUMAN', 'GOBLIN', 'ELF'];
  // State for password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { user, forceUpdate } = useUser();
  const { updateOptions } = useLayout();
  const [colorScheme, setColorScheme] = useState(user?.colorScheme || 'UNDEAD');
  const [locale, setLocale] = useState(user?.locale || 'en-US');
  const [passwordsMatch, setPasswordsMatch] = useState(true);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');

  const checkPasswordsMatch = () => {
    setPasswordsMatch(newPassword === confirmPassword);
  }
  useEffect(() => {
    if (user) {
      setColorScheme(user.colorScheme);
      setLocale(user.locale);
    }
  }, [user]);

  // Function to update password
  const updatePassword = async () => {
    checkPasswordsMatch();
    if (!passwordsMatch) return;
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'password',
        password: newPassword,
        password_confirm: confirmPassword,
        currentPassword: currentPassword,
      }),
    });
    const data = await response.json();
    // Handle the response
  };

  // Function to update locale
  const updateLocale = async () => {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'gameoptions',
        locale: locale,
        colorScheme: colorScheme,
      }),
    });
    const data = await response.json();
    // Handle the response
    if (response.ok) {
      alertService.success('Locale updated successfully, please refresh the page to see the changes.');
      forceUpdate();
      updateOptions();
    } else {
      alertService.error(data.error);
    }
  };

  // Function to handle account reset
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
      alertService.success('Account reset successfully.');
      forceUpdate();
    } else {
      alertService.error(data.error);
    }
    setIsResetModalOpen(false);
  };

  // Validate whenever the passwords change
  useEffect(() => {
    checkPasswordsMatch();
  }, [newPassword, confirmPassword]);
  const { raceClasses } = useLayout();

  return (
    <div className="mainArea pb-10">
      <h2>Settings</h2>
      <Alert />
      {/* Change Password Section */}
      <div className="section">
        <h3 className="font-bold">Change Password</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>Enter Current Password</div>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={`w-full rounded-md border border-gray-300 ${raceClasses.bgClass} p-2`}
          />
          <div>New Password</div>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={`w-full rounded-md border border-gray-300 ${raceClasses.bgClass} p-2`}
          />
          <div>Verify Password</div>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={`w-full rounded-md p-2 border border-gray-300 ${!passwordsMatch ? 'bg-red-700' : raceClasses.bgClass}`}
          />
          {!passwordsMatch && (
            <p className="col-span-2 text-xs text-red-500">
              Passwords don&apos;t match.
            </p>
          )}
        </div>
        <button
          type='button'
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={updatePassword}
        >Save</button>
      </div>

      {/* Game Options Section */}
      <div className="section mt-6">
        <h3 className="font-bold">Game Options</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>Locale Formatting</div>
          <Select
            value={locale}
            onChange={(value) => setLocale(value)}
            data={locales.map((locale) => ({ value: locale, label: locale }))}
            className={`w-full rounded-md border border-gray-300 ${raceClasses.bgClass} p-2`}
          />
          <div>Color Scheme</div>
          <Select
            value={colorScheme}
            onChange={(value) => setColorScheme(value)}
            data={colorSchemes.map((color) => ({ value: color, label: color }))}
            className={`w-full rounded-md border border-gray-300 ${raceClasses.bgClass} p-2`}
          />
        </div>
        <button
          type='button'
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={updateLocale}
        >
          Save
        </button>
      </div>

      {/* Reset Account Section */}
      <div className="section mt-6">
        <h3 className="font-bold">Reset Account</h3>
        <button
          type='button'
          className="rounded bg-red-500 px-4 py-2 font-bold text-white hover:bg-red-700"
          onClick={() => setIsResetModalOpen(true)}
        >
          Reset Account
        </button>
      </div>

      <Modal
        opened={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Confirm Account Reset"
      >
        <div>
          <p>Are you sure you want to reset your account? This action cannot be undone.</p>
          <TextInput
            type="password"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            placeholder="Enter your password to confirm"
            className="w-full rounded-md border border-gray-300 p-2 mt-4"
          />
          <div className="mt-4 flex justify-end space-x-4">
            <Button variant="outline" color="gray" onClick={() => setIsResetModalOpen(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={handleResetAccount}>
              Confirm Reset
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Settings;
