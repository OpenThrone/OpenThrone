'use client'; // Only required in Next.js projects

/**
 * Whisper
 *
 * A lightweight and customizable React Snackbar (toast) component built with framer-motion and tailwindcss.
 *
 * Github: https://github.com/farzany/whisper
 */

import { motion, AnimatePresence } from 'framer-motion';
import React, { createContext, useContext, useState, ReactNode, useCallback, MouseEventHandler, useRef } from 'react';

const DEFAULT_MAX_SNACKS = 6;
const DEFAULT_DURATION = 6000;
const BASE_Z_INDEX = 1000;

export type SnackType = 'success' | 'warning' | 'error' | 'info' | 'default';
export type Position = 'bottom-left' | 'bottom-center' | 'bottom-right' | 'top-left' | 'top-center' | 'top-right';

const POSITION_CLASSES: Record<Position, string> = {
  'bottom-left': 'bottom-8 sm:left-8 sm:inset-x-auto',
  'bottom-center': 'bottom-8',
  'bottom-right': 'bottom-8 sm:right-8 sm:inset-x-auto',
  'top-left': 'top-8 sm:left-8 sm:inset-x-auto',
  'top-center': 'top-8',
  'top-right': 'top-8 sm:right-8 sm:inset-x-auto',
};

interface Snack {
  id: string;
  message: string;
  type?: SnackType;
  duration: number;
  description?: string;
  icon?: ReactNode;
  dismissable?: boolean;
  action?: { label: string, onClick: MouseEventHandler<HTMLButtonElement> };
}

interface SnackOptions {
  duration?: number;
  description?: string;
  icon?: ReactNode;
  dismissable?: boolean;
  action?: { label: string, onClick: MouseEventHandler<HTMLButtonElement> };
}

interface PromiseSnackOptions {
  loading: { message: string, type?: SnackType, options?: SnackOptions },
  success: { message: string, type?: SnackType, options?: SnackOptions },
  error?: { message?: string, type?: SnackType, options?: SnackOptions },
}

interface SnackbarContextType {
  snackbar: {
    (_message: string, _options?: SnackOptions): string;
    info: (_message: string, _options?: SnackOptions) => string;
    success: (_message: string, _options?: SnackOptions) => string;
    warning: (_message: string, _options?: SnackOptions) => string;
    error: (_message: string, _options?: SnackOptions) => string;
    promise: <T>(_promise: Promise<T>, _options: PromiseSnackOptions) => Promise<T>;
    dismiss: (_ids?: string[]) => void;
  };
}

const SnackbarContext = createContext<SnackbarContextType | undefined>(undefined);

interface SnackbarProviderProps {
  children: ReactNode;
  maxSnacks?: number;
  position?: Position;
}

export const SnackbarProvider = ({ children, maxSnacks = DEFAULT_MAX_SNACKS, position = 'bottom-right' }: SnackbarProviderProps) => {
  const [snacks, setSnacks] = useState<Snack[]>([]);
  const timeoutsRef = useRef<Record<string, NodeJS.Timeout | null>>({});

  const resetTimeout = useCallback((id: string, duration: number) => {
    if (timeoutsRef.current[id]) {
      clearTimeout(timeoutsRef.current[id]!);
    }

    timeoutsRef.current[id] = setTimeout(() => {
      setSnacks((prev) => prev.filter((snack) => snack.id !== id));
      delete timeoutsRef.current[id];
    }, duration);
  }, []);

  const getIcon = (type?: SnackType) => {
    switch (type) {
      case 'success':
        return <SuccessIcon />;
      case 'error':
        return <ErrorIcon />;
      case 'info':
        return <InfoIcon />;
      case 'warning':
        return <WarningIcon />;
      default:
        return <InfoIcon />;
    }
  };

  const createSnack = useCallback(
    (message: string, type: Snack['type'] = 'default', options: SnackOptions = {}) => {
      const { duration = DEFAULT_DURATION, icon = null, description, dismissable = false, action } = options;
      const positionIsTop = position.startsWith('top');
      const id = crypto.randomUUID();

      const newSnack = { id, message, type, duration, description, icon: icon ?? getIcon(type), dismissable, action };

      setSnacks((prev) => positionIsTop ? [...prev, newSnack] : [newSnack, ...prev]);
      resetTimeout(id, duration);

      return id;
    }, [position, resetTimeout]);

  const snackbar = Object.assign(
    (message: string, options?: SnackOptions) => createSnack(message, 'default', options),
    {
      info: (message: string, options?: SnackOptions) => createSnack(message, 'info', options),
      success: (message: string, options?: SnackOptions) => createSnack(message, 'success', options),
      warning: (message: string, options?: SnackOptions) => createSnack(message, 'warning', options),
      error: (message: string, options?: SnackOptions) => createSnack(message, 'error', options),
      promise: async function <T>(promise: Promise<T>, options: PromiseSnackOptions): Promise<T> {
        const { loading, success, error } = options;
        const id = createSnack(loading.message, loading.type ?? 'default', { icon: <Spinner />, ...loading.options, duration: 999999 });
        try {
          const result = await promise;
          const type = success.type ?? 'success';
          setSnacks((prev) => prev.map((snack) => snack.id === id ? { ...snack, message: success.message, type, icon: getIcon(type), duration: DEFAULT_DURATION, ...success.options } : snack));
          resetTimeout(id, success.options?.duration ?? DEFAULT_DURATION);
          return result;
        } catch (err) {
          const type = error?.type ?? 'error';
          setSnacks((prev) => prev.map((snack) => snack.id === id ? { ...snack, message: error?.message ?? 'Something went wrong. Please try again.', type, icon: getIcon(type), duration: DEFAULT_DURATION, ...error?.options } : snack));
          resetTimeout(id, error?.options?.duration ?? DEFAULT_DURATION);
          throw err;
        }
      },
      dismiss: (ids?: string[]) => {
        setSnacks((prev) => ids ? prev.filter((snack) => !ids.includes(snack.id)) : []);
      },
    },
  );

  return (
    <SnackbarContext.Provider value={{ snackbar }}>
      {children}
      <SnackbarContainer key={position} snacks={snacks} setSnacks={setSnacks} position={position} maxSnacks={maxSnacks} />
    </SnackbarContext.Provider>
  );
};

export const useSnackbar = (): SnackbarContextType => {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }
  return context;
};

const getSnackStyles = (type?: SnackType) => {
  switch (type) {
    case 'success':
      return {
        icon: <SuccessIcon />,
        borderColor: 'border-green-500',
        bgColor: 'bg-green-700/20',
        textColor: 'text-green-300',
        iconColor: 'text-green-400',
      };
    case 'error':
      return {
        icon: <ErrorIcon />,
        borderColor: 'border-red-500',
        bgColor: 'bg-red-700/20',
        textColor: 'text-red-300',
        iconColor: 'text-red-400',
      };
    case 'info':
      return {
        icon: <InfoIcon />,
        borderColor: 'border-blue-500',
        bgColor: 'bg-blue-700/20',
        textColor: 'text-blue-300',
        iconColor: 'text-blue-400',
      };
    case 'warning':
      return {
        icon: <WarningIcon />,
        borderColor: 'border-yellow-500',
        bgColor: 'bg-yellow-700/20',
        textColor: 'text-yellow-300',
        iconColor: 'text-yellow-400',
      };
    default:
      return {
        icon: <InfoIcon />,
        borderColor: 'border-gray-500',
        bgColor: 'bg-gray-700/20',
        textColor: 'text-gray-300',
        iconColor: 'text-gray-400',
      };
  }
};

const SnackbarContainer = ({
  snacks,
  setSnacks,
  position,
  maxSnacks,
}: {
  snacks: Snack[];
  setSnacks: React.Dispatch<React.SetStateAction<Snack[]>>;
  position: Position;
  maxSnacks: number;
}) => {
  const positionIsTop = position.startsWith('top');
  const y = positionIsTop ? -50 : 50;

  const getOpacity = (index: number) => {
    if (positionIsTop) {
      return snacks.length - index > maxSnacks ? 0 : 1;
    } else {
      return index >= maxSnacks ? 0 : 1;
    }
  };

  const handleDismiss = useCallback((id: string) => {
    setSnacks((prevSnacks) => prevSnacks.filter((snack) => snack.id !== id));
  }, [setSnacks]);

  const handleAction = (id: string, onClick: MouseEventHandler<HTMLButtonElement>) => (event: React.MouseEvent<HTMLButtonElement>) => {
    if (onClick) { onClick(event); }
    handleDismiss(id);
  };

  return (
    <motion.div layout className={`fixed inset-x-0 mx-auto flex w-[calc(100vw-3rem)] flex-col-reverse space-y-4 space-y-reverse sm:w-[22.25rem] ${POSITION_CLASSES[position]}`} style={{zIndex: 1200}}>
      <AnimatePresence>
        {snacks.map(({ id, message, description, type, icon, dismissable, action }, index) => {
          const styles = getSnackStyles(type);
          return (
            <motion.div
              key={id}
              layout
              initial={{ opacity: 0, y, scale: 0.98, zIndex: BASE_Z_INDEX }}
              animate={{ opacity: getOpacity(index), y: 0, scale: 1.0, zIndex: BASE_Z_INDEX }}
              exit={{ opacity: 0, y, scale: 1.0, zIndex: BASE_Z_INDEX - index }}
              transition={{ type: 'tween', duration: 0.3, ease: 'easeInOut' }}
              className={`relative w-full rounded-lg p-0 text-sm font-medium shadow-lg ${styles.borderColor} transition-all ease-in-out duration-300 shadow-lg hover:shadow-xl`}
              style={{ borderWidth: '2px', background: 'transparent', backdropFilter: 'blur(8px)', overflow: 'visible' }}
            >
              <div className={`p-4 flex items-center gap-3 ${styles.bgColor}`}>
                <span className={`shrink-0 ${styles.iconColor}`}>{styles.icon}</span>
                <div className={`flex grow flex-col gap-0.5`}>
                  <span className={`${styles.textColor} font-medium`}>{message}</span>
                  {description && (<span className="text-xs text-gray-400">{description}</span>)}
                </div>
                {action && (
                  <button className="rounded bg-zinc-800 px-2 py-1 text-white" onClick={handleAction(id, action.onClick)}>
                    {action.label}
                  </button>
                )}
                {dismissable && (
                  <button onClick={() => handleDismiss(id)}>
                    <XIcon className="size-4" />
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
};

const InfoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-5">
    <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
  </svg>
);

const SuccessIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-5">
    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
  </svg>
);

const WarningIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-5">
    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
  </svg>
);

const ErrorIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-5">
    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const Spinner = () => (
  <svg className="size-5 animate-spin p-0.5" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z" />
  </svg>
);