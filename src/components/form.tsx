import { zodResolver } from '@hookform/resolvers/zod';
import {
  Box,
  Button,
  Center,
  Flex,
  Modal,
  Paper,
  PasswordInput,
  Select,
  Space,
  Text,
  TextInput,
  Title,
  useMantineTheme,
} from '@mantine/core';
import { Turnstile } from '@marsidev/react-turnstile';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signIn } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import { useRef, useState } from 'react';
import type { FieldErrorsImpl, Merge } from 'react-hook-form';
import { Controller, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';

import LoadingDots from '@/components/loading-dots';
import { logError } from '@/utils/logger';

/**
 * Zod schema for user registration data validation.
 */
const registerSchema = z
  .object({
    /** User's chosen display name (min 3 characters). */
    display_name: z.string().min(3, 'auth.displayNameMin'),
    /** User's email address. */
    email: z.string().email('auth.invalidEmail'),
    /** User's password (min 8 characters). */
    password: z.string().min(8, 'auth.passwordMin'),
    /** Password confirmation field. */
    password_confirm: z.string(),
    /** Selected player race. */
    race: z.enum(['HUMAN', 'UNDEAD', 'GOBLIN', 'ELF']),
    /** Selected player class. */
    class: z.enum(['FIGHTER', 'CLERIC', 'ASSASSIN', 'THIEF']),
  })
  .refine((data) => data.password === data.password_confirm, {
    message: 'auth.passwordsDontMatch',
    path: ['password_confirm'], // Specify the field for the error message
  });

/**
 * Zod schema for user login data validation.
 */
const loginSchema = z.object({
  /** User's email address. */
  email: z.string().email('auth.invalidEmail'),
  /** User's password. */
  password: z.string().min(1, 'auth.passwordRequired'),
});

/** Maps stable server error codes from /api/auth/register to locale keys. */
const AUTH_ERROR_KEYS: Record<string, string> = {
  email_taken: 'auth.errorEmailTaken',
  registrations_disabled: 'auth.errorRegistrationsDisabled',
  captcha_failed: 'auth.errorCaptcha',
  invalid_input: 'auth.errorInvalidInput',
};

/** Type inferred from the registerSchema. */
type RegisterFormData = z.infer<typeof registerSchema>;
/** Type inferred from the loginSchema. */
type LoginFormData = z.infer<typeof loginSchema>;

/** Combined type for potential form errors (login or register). */
type FormErrors = Merge<
  FieldErrorsImpl<RegisterFormData>,
  FieldErrorsImpl<LoginFormData>
>;

/**
 * Props for the Form component.
 */
interface FormProps {
  /** Specifies whether the form is for 'login' or 'register'. */
  type: 'login' | 'register';
  /** Callback function to set an error message to be displayed outside the form. */
  setErrorMessage: (msg: string) => void;
  /** Controls the outer container styling. */
  layout?: 'paper' | 'bare';
}

/**
 * A reusable form component for user login and registration.
 * Handles input validation using Zod and react-hook-form,
 * integrates with Cloudflare Turnstile for bot protection,
 * and manages API interactions for login/registration, including vacation mode handling.
 */
const Form: React.FC<FormProps> = ({
  type,
  setErrorMessage,
  layout = 'paper',
}) => {
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation('account');
  const [showVacationModal, setShowVacationModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const router = useRouter();
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnsTileRef = useRef<any>();
  const theme = useMantineTheme();

  const captchaDisabled =
    process.env.NEXT_PUBLIC_USE_CAPTCHA === 'false' ||
    process.env.NEXT_PUBLIC_DISABLE_TURNSTILE === 'true';
  const captchaEnabled =
    !captchaDisabled && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_ID;

  const form = useForm<RegisterFormData | LoginFormData>({
    resolver: zodResolver(type === 'register' ? registerSchema : loginSchema),
    defaultValues:
      type === 'register'
        ? {
            display_name: '',
            email: '',
            password: '',
            password_confirm: '',
            race: 'HUMAN',
            class: 'FIGHTER',
          }
        : {
            email: '',
            password: '',
          },
  });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = form;

  // Zod messages are locale keys; resolve them for display
  const fieldError = (err?: { message?: string }) =>
    err?.message ? t(err.message) : undefined;

  /**
   * Callback function executed when Turnstile verification is successful.
   * @param token - The verification token provided by Turnstile.
   */
  const handleTurnstileSuccess = (token: string) => {
    setTurnstileToken(token);
  };

  const inputStyles = {
    label: {
      color: 'var(--mantine-color-dimmed)',
      fontWeight: 'bolder',
    },
    input: {
      minHeight: 48,
      height: 48,
      '&:focus': {
        borderColor: 'var(--ot-accent)',
        boxShadow: '0 0 0 2px var(--ot-accent)',
      },
    },
    innerInput: {
      minHeight: 48,
      height: 48,
      '&:focus': {
        borderColor: 'var(--ot-accent)',
        boxShadow: '0 0 0 2px var(--ot-accent)',
      },
    },
  };

  const handleInvalid = (
    invalidErrors: Record<string, { message?: string }>,
  ) => {
    const message =
      invalidErrors.email?.message ||
      invalidErrors.password?.message ||
      invalidErrors.display_name?.message ||
      invalidErrors.password_confirm?.message ||
      invalidErrors.race?.message ||
      invalidErrors.class?.message;

    if (message) {
      setErrorMessage(t(message));
    }

    const firstErrorField = (
      [
        'email',
        'password',
        'display_name',
        'password_confirm',
        'race',
        'class',
      ] as const
    ).find((field) => invalidErrors[field]);
    if (firstErrorField) {
      // setFocus is typed per form; the field is a validated key of either schema
      form.setFocus(firstErrorField as 'email');
    }
  };

  /**
   * Handles the action when a user confirms they want to end vacation mode.
   * Sends a request to the API and attempts to log the user in upon success.
   */
  const handleVacationOverride = async () => {
    try {
      const res = await fetch('/api/account/end-vacation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setShowVacationModal(false);
        toast.success(t('auth.vacationEnded'));
        const loginValues = form.getValues() as LoginFormData;
        await handleLogin(loginValues.email, loginValues.password);
      } else {
        throw new Error('Failed to end vacation mode');
      }
    } catch (error) {
      logError(error);
      setErrorMessage(t('auth.vacationEndFailed'));
    }
  };

  /**
   * Attempts to log the user in using NextAuth credentials provider.
   * Handles successful login, vacation mode detection, and other errors.
   * @param email - The user's email.
   * @param password - The user's password.
   */
  const handleLogin = async (email: string, password: string) => {
    try {
      const res = await signIn('credentials', {
        redirect: false,
        email,
        password,
        ...(captchaEnabled ? { turnstileToken } : {}),
      });

      if (res?.ok) {
        router.push('/home/overview');
      } else {
        const error = res?.error;
        try {
          const errorObj = JSON.parse(error || '{}');
          if (errorObj.message?.includes('on vacation')) {
            setShowVacationModal(true);
            setUserId(errorObj.userID);
          } else {
            setErrorMessage(errorObj.message || t('auth.invalidCredentials'));
          }
        } catch {
          setErrorMessage(error || t('auth.invalidCredentials'));
        }
      }
    } catch (error) {
      logError(error);
      setErrorMessage(t('auth.loginFailedGeneric'));
    } finally {
      turnsTileRef.current?.reset();
      setLoading(false); // Ensure loading is set to false after login attempt
    }
  };

  /**
   * Handles the form submission for both login and registration.
   * Validates data, interacts with the appropriate API endpoint,
   * and manages loading state and error messages.
   * @param data - The validated form data (either RegisterFormData or LoginFormData).
   */
  const onSubmit = async (data: RegisterFormData | LoginFormData) => {
    setLoading(true);
    setErrorMessage('');
    try {
      if (type === 'login') {
        const loginData = data as LoginFormData;
        await handleLogin(loginData.email, loginData.password);
      } else {
        const registerData = data as RegisterFormData;
        const { password_confirm: _passwordConfirm, ...apiData } = registerData;
        const res = await fetch('/api/auth/register/route', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...apiData,
            ...(captchaEnabled ? { turnstileToken } : {}),
          }),
        });

        if (res.status === 200) {
          setRegistrationSuccess(true);
        } else {
          const message = await res.json();
          const code: string = message.error;
          setErrorMessage(
            code in AUTH_ERROR_KEYS
              ? t(AUTH_ERROR_KEYS[code])
              : code || t('auth.registrationFailedGeneric'),
          );
          turnsTileRef.current?.reset(); // Reset turnstile on registration failure
        }
        setLoading(false); // Set loading false after registration attempt
      }
    } catch (error) {
      logError(error);
      setErrorMessage(t('auth.somethingWentWrong'));
      setLoading(false); // Ensure loading is false on catch
      turnsTileRef.current?.reset(); // Reset turnstile on error
    }
  };

  // Cast errors to the helper type for safe access
  const formErrors = errors as FormErrors;
  const validationMessage =
    fieldError(formErrors.email) ||
    fieldError(formErrors.password) ||
    fieldError(formErrors.display_name) ||
    fieldError(formErrors.password_confirm) ||
    fieldError(formErrors.race) ||
    fieldError(formErrors.class);

  const titleColor = layout === 'bare' ? theme.colors.gray[1] : 'gray';
  const bodyColor = layout === 'bare' ? theme.colors.gray[3] : 'gray';

  const formBody = registrationSuccess ? (
    <>
      <Title order={2} ta="center" mb="md" c={titleColor}>
        {t('auth.registrationSuccess')}
      </Title>
      <Text ta="center" size="sm" c={bodyColor}>
        {t('auth.accountCreated')}{' '}
        <Link href="/account/login">
          <Text component="span" color="blue" inherit>
            {t('auth.signInHere')}
          </Text>
        </Link>
        .
      </Text>
    </>
  ) : (
    <>
      <Title order={2} ta="center" mb="md" c={titleColor}>
        {type === 'login' ? t('auth.signIn') : t('auth.signUp')}
      </Title>
      <form onSubmit={handleSubmit(onSubmit, handleInvalid)}>
        <Flex direction="column" gap="md">
          {validationMessage ? (
            <Text
              role="alert"
              data-testid="error-message"
              c="red.5"
              size="sm"
              ta="center"
            >
              {validationMessage}
              <span className="sr-only">{t('auth.reviewFields')}</span>
            </Text>
          ) : null}
          {type === 'login' ? (
            <>
              <TextInput
                id="email"
                type="email"
                label={t('auth.emailLabel')}
                placeholder={t('auth.emailPlaceholder')}
                autoComplete="email"
                required
                size="md"
                styles={inputStyles}
                {...register('email')}
                error={fieldError(formErrors.email)}
                data-testid="email-input"
              />
              <PasswordInput
                id="password"
                label={t('auth.passwordLabel')}
                placeholder={t('auth.passwordPlaceholder')}
                autoComplete="current-password"
                required
                size="md"
                styles={inputStyles}
                {...register('password')}
                error={fieldError(formErrors.password)}
                data-testid="password-input"
              />
            </>
          ) : (
            <>
              <TextInput
                id="display_name"
                label={t('auth.userNameLabel')}
                placeholder={t('auth.userNamePlaceholder')}
                autoComplete="username"
                required
                size="md"
                styles={inputStyles}
                {...register('display_name')}
                error={fieldError(formErrors.display_name)}
              />
              <TextInput
                id="email"
                type="email"
                label={t('auth.emailLabel')}
                placeholder={t('auth.emailPlaceholder')}
                autoComplete="email"
                required
                size="md"
                styles={inputStyles}
                {...register('email')}
                error={fieldError(formErrors.email)}
              />
              <PasswordInput
                id="password"
                label={t('auth.passwordLabel')}
                placeholder={t('auth.passwordPlaceholder')}
                autoComplete="new-password"
                required
                size="md"
                styles={inputStyles}
                {...register('password')}
                error={fieldError(formErrors.password)}
              />
              <PasswordInput
                id="password_confirm"
                label={t('auth.confirmPasswordLabel')}
                placeholder={t('auth.confirmPasswordPlaceholder')}
                autoComplete="new-password"
                required
                size="md"
                styles={inputStyles}
                {...register('password_confirm')}
                error={fieldError(formErrors.password_confirm)}
              />
              <Controller
                name="race"
                control={control}
                render={({ field, fieldState }) => (
                  <Select
                    id="race-select"
                    label={t('auth.raceLabel')}
                    placeholder={t('auth.pickOne')}
                    required
                    data={[
                      { value: 'HUMAN', label: 'HUMAN' },
                      { value: 'UNDEAD', label: 'UNDEAD' },
                      { value: 'GOBLIN', label: 'GOBLIN' },
                      { value: 'ELF', label: 'ELF' },
                    ]}
                    size="md"
                    styles={inputStyles}
                    {...field}
                    error={fieldError(fieldState.error)}
                  />
                )}
              />
              <Controller
                name="class"
                control={control}
                render={({ field, fieldState }) => (
                  <Select
                    id="class-select"
                    label={t('auth.classLabel')}
                    placeholder={t('auth.pickOne')}
                    required
                    data={[
                      { value: 'FIGHTER', label: 'FIGHTER' },
                      { value: 'CLERIC', label: 'CLERIC' },
                      { value: 'ASSASSIN', label: 'ASSASSIN' },
                      { value: 'THIEF', label: 'THIEF' },
                    ]}
                    size="md"
                    styles={inputStyles}
                    {...field}
                    error={fieldError(fieldState.error)}
                  />
                )}
              />
            </>
          )}
          <Space h="md" />
          {captchaEnabled && (
            <>
              <label
                htmlFor="captcha"
                className="text-[1.05rem] font-bold text-gray-400"
                data-size="md"
              >
                {t('auth.captcha')}
              </label>
              <Turnstile
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_ID || ''}
                onSuccess={handleTurnstileSuccess}
                ref={turnsTileRef}
                style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}
              />
            </>
          )}
          <Button
            disabled={
              loading || isSubmitting || (captchaEnabled && !turnstileToken)
            }
            type="submit"
            fullWidth
            size="md"
            id="submit-button"
            data-testid="submit-button"
            styles={{ root: { minHeight: 48 } }}
          >
            {loading || isSubmitting ? (
              <LoadingDots color="#808080" />
            ) : (
              <Text>
                {type === 'login' ? t('auth.signIn') : t('auth.signUp')}
              </Text>
            )}
          </Button>
          <Space h="md" />
          {type === 'login' ? (
            <Text ta="center" size="sm" c={bodyColor}>
              {t('auth.noAccountPrompt')}{' '}
              <Link href="/account/register">
                <Text component="span" color="blue" inherit>
                  {t('auth.signUpFree')}
                </Text>
              </Link>{' '}
              {t('auth.forFree')}
            </Text>
          ) : (
            <Text ta="center" size="sm" c={bodyColor}>
              {t('auth.haveAccountPrompt')}{' '}
              <Link href="/account/login">
                <Text component="span" color="blue" inherit>
                  {t('auth.signInInstead')}
                </Text>
              </Link>{' '}
              {t('auth.instead')}
            </Text>
          )}
        </Flex>
      </form>
    </>
  );

  return (
    <Center>
      {layout === 'paper' ? (
        <Paper
          withBorder
          shadow="md"
          p={30}
          radius="md"
          style={{ width: '100%', maxWidth: 400 }}
        >
          {formBody}
        </Paper>
      ) : (
        <Box style={{ width: '100%', maxWidth: 420 }}>{formBody}</Box>
      )}

      <Modal
        opened={showVacationModal}
        onClose={() => setShowVacationModal(false)}
        title={t('auth.vacationTitle')}
      >
        <Text>{t('auth.vacationBody')}</Text>
        <Button onClick={handleVacationOverride} mt="md" fullWidth>
          {t('auth.endVacation')}
        </Button>
      </Modal>
    </Center>
  );
};

export default Form;
