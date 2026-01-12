import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { signIn } from 'next-auth/react';
import {
  Paper,
  PasswordInput,
  TextInput,
  Text,
  Select,
  Button,
  Modal,
  Title,
  Center,
  Flex,
  Space,
  Box,
  useMantineTheme,
} from '@mantine/core';
import toast from 'react-hot-toast';
import { Turnstile } from '@marsidev/react-turnstile';
import { useForm, Controller, FieldErrorsImpl, Merge } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import LoadingDots from '@/components/loading-dots';
import { logError } from '@/utils/logger';

/**
 * Zod schema for user registration data validation.
 */
const registerSchema = z.object({
  /** User's chosen display name (min 3 characters). */
  display_name: z.string().min(3, 'Display name must be at least 3 characters long.'),
  /** User's email address. */
  email: z.string().email('Invalid email address.'),
  /** User's password (min 8 characters). */
  password: z.string().min(8, 'Password must be at least 8 characters long.'),
  /** Password confirmation field. */
  password_confirm: z.string(),
  /** Selected player race. */
  race: z.enum(['HUMAN', 'UNDEAD', 'GOBLIN', 'ELF']),
  /** Selected player class. */
  class: z.enum(['FIGHTER', 'CLERIC', 'ASSASSIN', 'THIEF']),
}).refine(data => data.password === data.password_confirm, {
  message: "Passwords don't match",
  path: ["password_confirm"], // Specify the field for the error message
});

/**
 * Zod schema for user login data validation.
 */
const loginSchema = z.object({
    /** User's email address. */
    email: z.string().email('Invalid email address.'),
    /** User's password. */
    password: z.string().min(1, 'Password is required.'),
});

/** Type inferred from the registerSchema. */
type RegisterFormData = z.infer<typeof registerSchema>;
/** Type inferred from the loginSchema. */
type LoginFormData = z.infer<typeof loginSchema>;

/** Combined type for potential form errors (login or register). */
type FormErrors = Merge<FieldErrorsImpl<RegisterFormData>, FieldErrorsImpl<LoginFormData>>;

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
const Form: React.FC<FormProps> = ({ type, setErrorMessage, layout = 'paper' }) => {
  const [loading, setLoading] = useState(false);
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
  const captchaEnabled = !captchaDisabled && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_ID;

  const form = useForm<RegisterFormData | LoginFormData>({
    resolver: zodResolver(type === 'register' ? registerSchema : loginSchema),
    defaultValues: type === 'register' ? {
        display_name: '',
        email: '',
        password: '',
        password_confirm: '',
        race: 'HUMAN',
        class: 'FIGHTER',
    } : {
        email: '',
        password: '',
    },
  });

  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = form;

  /**
   * Callback function executed when Turnstile verification is successful.
   * @param token - The verification token provided by Turnstile.
   */
  const handleTurnstileSuccess = (token: string) => {
    setTurnstileToken(token);
  };

  const inputStyles = {
    label: {
      color: 'darkgray',
      fontWeight: 'bolder',
      shadow: 'md',
    },
    input: {
      minHeight: 48,
      height: 48,
    },
    innerInput: {
      minHeight: 48,
      height: 48,
    },
  };

  const handleInvalid = (invalidErrors: FormErrors) => {
    const message =
      invalidErrors.email?.message ||
      invalidErrors.password?.message ||
      invalidErrors.display_name?.message ||
      invalidErrors.password_confirm?.message ||
      invalidErrors.race?.message ||
      invalidErrors.class?.message;

    if (message) {
      setErrorMessage(message);
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
         toast.success('Vacation mode ended. Logging in...');
         const loginValues = form.getValues() as LoginFormData;
         await handleLogin(loginValues.email, loginValues.password);
       } else {
         throw new Error('Failed to end vacation mode');
       }
     } catch (error) {
       logError(error);
       setErrorMessage('Could not end vacation mode');
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
             setErrorMessage(errorObj.message || 'Invalid credentials or server error.');
           }
         } catch (parseError) {
           setErrorMessage(error || 'Invalid credentials or server error.');
         }
       }
     } catch (error) {
       logError(error);
       setErrorMessage('Something went wrong during login!');
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
        const { password_confirm, ...apiData } = registerData;
        const res = await fetch('/api/auth/register/route', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...apiData, ...(captchaEnabled ? { turnstileToken } : {}) }),
        });

        if (res.status === 200) {
          setRegistrationSuccess(true);
        } else {
          const message = await res.json();
          setErrorMessage(message.error || 'Registration failed.');
          turnsTileRef.current?.reset(); // Reset turnstile on registration failure
        }
         setLoading(false); // Set loading false after registration attempt
      }
    } catch (error) {
      logError(error);
      setErrorMessage('Something went wrong!');
      setLoading(false); // Ensure loading is false on catch
      turnsTileRef.current?.reset(); // Reset turnstile on error
    }
  };

  // Cast errors to the helper type for safe access
  const formErrors = errors as FormErrors;
  const errorHelpId = `${type}-form-error-help`;
  const validationMessage =
    formErrors.email?.message ||
    formErrors.password?.message ||
    formErrors.display_name?.message ||
    formErrors.password_confirm?.message ||
    formErrors.race?.message ||
    formErrors.class?.message;

  const titleColor = layout === 'bare' ? theme.colors.gray[1] : 'gray';
  const bodyColor = layout === 'bare' ? theme.colors.gray[3] : 'gray';

  const formBody = registrationSuccess ? (
    <>
      <Title order={2} ta="center" mb="md" c={titleColor}>
        Registration Successful!
      </Title>
      <Text ta="center" size="sm" c={bodyColor}>
        Your account has been created. You can now{' '}
        <Link href="/account/login">
          <Text component="span" color="blue" inherit>
            sign in
          </Text>
        </Link>
        .
      </Text>
    </>
  ) : (
    <>
      <Title order={2} ta="center" mb="md" c={titleColor}>
        {type === 'login' ? 'Sign In' : 'Sign Up'}
      </Title>
      <form onSubmit={handleSubmit(onSubmit, handleInvalid)}>
        <Flex direction="column" gap="md">
          {validationMessage ? (
            <Text
              role="alert"
              aria-describedby={errorHelpId}
              data-testid="error-message"
              c="red.5"
              size="sm"
              ta="center"
            >
              {validationMessage}
              <span id={errorHelpId} className="sr-only">
                Review the highlighted fields for details.
              </span>
            </Text>
          ) : null}
          {type === 'login' ? (
            <>
              <TextInput
                id="email"
                label="Email Address"
                placeholder="username@email.com"
                autoComplete="email"
                required
                size="md"
                styles={inputStyles}
                {...register('email')}
                error={formErrors.email?.message}
                data-testid="email-input"
                inputProps={{ 'aria-label': 'Email address' }}
              />
              <PasswordInput
                id="password"
                label="Password"
                placeholder="Password"
                required
                size="md"
                styles={inputStyles}
                {...register('password')}
                error={formErrors.password?.message}
                data-testid="password-input"
                inputProps={{
                  'aria-label': 'Password',
                  'aria-describedby': 'login-password-help',
                }}
              />
              <Text id="login-password-help" className="sr-only">
                Enter your password to sign in.
              </Text>
            </>
          ) : (
            <>
              <TextInput
                id="display_name"
                label="User Name"
                placeholder="DisplayName"
                autoComplete="username"
                required
                size="md"
                styles={inputStyles}
                {...register('display_name')}
                error={formErrors.display_name?.message}
                inputProps={{ 'aria-label': 'User name' }}
              />
              <TextInput
                id="email"
                type="email"
                label="Email Address"
                placeholder="username@email.com"
                autoComplete="email"
                required
                size="md"
                styles={inputStyles}
                {...register('email')}
                error={formErrors.email?.message}
                inputProps={{ 'aria-label': 'Email address' }}
              />
              <PasswordInput
                id="password"
                label="Password"
                placeholder="Password"
                required
                size="md"
                styles={inputStyles}
                {...register('password')}
                error={formErrors.password?.message}
                inputProps={{
                  'aria-label': 'Password',
                  'aria-describedby': 'register-password-help',
                }}
              />
              <Text id="register-password-help" className="sr-only">
                Use at least 8 characters for your password.
              </Text>
              <PasswordInput
                id="password_confirm"
                label="Confirm Password"
                placeholder="Confirm Password"
                required
                size="md"
                styles={inputStyles}
                {...register('password_confirm')}
                error={formErrors.password_confirm?.message}
                inputProps={{
                  'aria-label': 'Confirm password',
                  'aria-describedby': 'register-password-confirm-help',
                }}
              />
              <Text id="register-password-confirm-help" className="sr-only">
                Repeat your password to confirm it.
              </Text>
              <Controller
                name="race"
                control={control}
                render={({ field, fieldState }) => (
                  <Select
                    id="race-select"
                    label="Race"
                    placeholder="Pick one"
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
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                name="class"
                control={control}
                render={({ field, fieldState }) => (
                  <Select
                    id="class-select"
                    label="Class"
                    placeholder="Pick one"
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
                    error={fieldState.error?.message}
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
                className="mantine-InputWrapper-label"
                data-size="md"
                style={{ color: 'darkgray', fontWeight: 'bolder', fontSize: '1.05rem' }}
              >
                Captcha
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
              loading ||
              isSubmitting ||
              (captchaEnabled && !turnstileToken)
            }
            type="submit"
            fullWidth
            size="md"
            id="submit-button"
            data-testid="submit-button"
            styles={{ root: { minHeight: 48 } }}
          >
            {loading || isSubmitting ? <LoadingDots color="#808080" /> : <Text>{type === 'login' ? 'Sign In' : 'Sign Up'}</Text>}
          </Button>
          <Space h="md" />
          {type === 'login' ? (
            <Text ta="center" size="sm" c={bodyColor}>
              Don&apos;t have an account?{' '}
              <Link href="/account/register">
                <Text component="span" color="blue" inherit>
                  Sign up
                </Text>
              </Link>{' '}
              for free.
            </Text>
          ) : (
            <Text ta="center" size="sm" c={bodyColor}>
              Already have an account?{' '}
              <Link href="/account/login">
                <Text component="span" color="blue" inherit>
                  Sign in
                </Text>
              </Link>{' '}
              instead.
            </Text>
          )}
        </Flex>
      </form>
    </>
  );

  return (
    <Center>
      {layout === 'paper' ? (
        <Paper withBorder shadow="md" p={30} radius="md" style={{ width: '100%', maxWidth: 400 }}>
          {formBody}
        </Paper>
      ) : (
        <Box style={{ width: '100%', maxWidth: 420 }}>
          {formBody}
        </Box>
      )}

      <Modal
        opened={showVacationModal}
        onClose={() => setShowVacationModal(false)}
        title="Vacation Mode Active"
      >
        <Text>
          Your account is currently in vacation mode. Do you want to end vacation mode and log in?
        </Text>
        <Button onClick={handleVacationOverride} mt="md" fullWidth>
          End Vacation Mode
        </Button>
      </Modal>
    </Center>
  );
};

export default Form;
