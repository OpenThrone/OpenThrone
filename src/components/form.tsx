import { useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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
  ComboboxItem,
} from '@mantine/core';
import toast from 'react-hot-toast';
import LoadingDots from '@/components/loading-dots';
import Link from 'next/link';
import { Turnstile } from '@marsidev/react-turnstile';
import { useForm, Controller, FieldErrors, FieldErrorsImpl, Merge } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
}

/**
 * A reusable form component for user login and registration.
 * Handles input validation using Zod and react-hook-form,
 * integrates with Cloudflare Turnstile for bot protection,
 * and manages API interactions for login/registration, including vacation mode handling.
 */
const Form: React.FC<FormProps> = ({ type, setErrorMessage }) => {
  const [loading, setLoading] = useState(false);
  const [showVacationModal, setShowVacationModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnsTileRef = useRef<any>();

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
         turnstileToken,
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
          body: JSON.stringify({ ...apiData, turnstileToken }),
        });

        if (res.status === 200) {
          toast.success('Account created! Redirecting to login...');
          setTimeout(() => {
            router.push('/account/login');
          }, 2000);
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

  return (
    <Center>
      <Paper withBorder shadow="md" p={30} radius="md" style={{ width: '100%', maxWidth: 400 }}>
        <Title order={2} ta="center" mb="md" c={'gray'}>
          {type === 'login' ? 'Sign In' : 'Sign Up'}
        </Title>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Flex direction="column" gap="md">
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
                />
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
                />
                <PasswordInput
                  id="password_confirm"
                  label="Confirm Password"
                  placeholder="Confirm Password"
                  required
                  size="md"
                  styles={inputStyles}
                  {...register('password_confirm')}
                  error={formErrors.password_confirm?.message}
                />
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
            {/* Disable button while loading, submitting, or if Turnstile is enabled and not yet successful */}
            <Button
              disabled={
                loading ||
                isSubmitting ||
                (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_ID && !turnstileToken)
              }
              type="submit"
              fullWidth
              size="md"
            >
              {loading || isSubmitting ? <LoadingDots color="#808080" /> : <Text>{type === 'login' ? 'Sign In' : 'Sign Up'}</Text>}
            </Button>
            <Space h="md" />
            {type === 'login' ? (
              <Text ta="center" size="sm" c={'gray'}>
                Don&apos;t have an account?{' '}
                <Link href="/account/register">
                  <Text component="span" color="blue" inherit>
                    Sign up
                  </Text>
                </Link>{' '}
                for free.
              </Text>
            ) : (
              <Text ta="center" size="sm" c={'gray'}>
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
      </Paper>
    </Center>
  );
};

export default Form;
