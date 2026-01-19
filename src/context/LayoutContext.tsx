import { useLocalStorage } from '@mantine/hooks';
import { useRouter } from 'next/router';
import type { ReactNode } from 'react';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { logDebug } from '@/utils/logger';

import { useUser } from './users';

// Define interfaces for typing
interface RaceColors {
  navActiveClass: string;
  navHoverClass: string;
  navLinkClass: string;
  bgClass: string;
  menuPrimaryClass: string;
  menuSecondaryClass: string;
  sidebarBgClass: string;
  headingClass: string;
  bodyBgClass: string;
  footerClass: string;
  borderClass: string;
  borderBottomClass: string;
  race: string;
}

interface LayoutContextProps {
  title?: string;
  description?: string;
  setMeta?: (meta: { title?: string; description?: string }) => void;
  raceClasses: RaceColors;
  meta: { title: string; description: string };
  updateOptions?: () => void;
  authorized: boolean;
  userLoading: boolean; // Add the userLoading state prop
}

// Function to generate color classes based on race
function generateRaceColors(race: string): RaceColors {
  const colors = {
    navActiveClass: `text-${race}-link-current`,
    navHoverClass: `hover:text-${race}-link-hover`,
    navLinkClass: `text-${race}-link-link`,
    bgClass: `bg-${race}-header-bgcolor`,
    menuPrimaryClass: `bg-${race}-menu-primary`,
    menuSecondaryClass: `bg-${race}-menu-secondary`,
    sidebarBgClass: `bg-${race}-sidebar-bgcolor`,
    headingClass: `bg-${race}-header-bgcolor`,
    bodyBgClass: `bg-${race}-bodyBg`,
    footerClass: `bg-${race}-footer`,
    borderClass: `${race}-double-border border-${race}`,
    borderBottomClass: `${race}-double-border-down`,
    race: race.toUpperCase(),
  };
  return colors;
}

// Predefined classes for races
const raceClasses = {
  ELF: generateRaceColors('elf'),
  GOBLIN: generateRaceColors('goblin'),
  HUMAN: generateRaceColors('human'),
  UNDEAD: generateRaceColors('undead'),
};

// Default race classes (assuming 'ELF' as the default race)
const defaultRaceClasses = generateRaceColors('ELF');

// Default context value
const defaultLayoutContextProps: LayoutContextProps = {
  raceClasses: defaultRaceClasses,
  title: undefined,
  description: undefined,
  setMeta: undefined,
  meta: { title: '', description: '' },
  authorized: false,
  userLoading: true,
};

// Create Context with default value
const LayoutContext = createContext<LayoutContextProps>(
  defaultLayoutContextProps,
);

// Hook to use context
export const useLayout = () => useContext(LayoutContext);

interface LayoutProviderProps {
  children: ReactNode;
}

// LayoutProvider Component
export const LayoutProvider: React.FC<LayoutProviderProps> = ({ children }) => {
  const [meta, setMetaState] = useState({ title: '', description: '' });
  const { user, loading: userLoading } = useUser(); // Access user and loading state from useUser
  const router = useRouter();
  const [previewScheme] = useLocalStorage<string>({
    key: 'colorSchemePreview',
    defaultValue: '',
  });

  const [authorized, setAuthorized] = useState(false);
  const [derivedRaceClasses, setDerivedRaceClasses] = useState<RaceColors>(
    raceClasses.ELF,
  );

  const setMeta = useCallback(
    (newMeta: { title?: string; description?: string }) => {
      setMetaState((prevMeta) => ({
        ...prevMeta,
        ...newMeta,
      }));
    },
    [setMetaState],
  );

  const updateOptions = useCallback(() => {
    let race = user?.colorScheme || user?.race || 'ELF';
    const isPreviewPage =
      router.pathname === '/test' || router.pathname === '/home/settings';
    if (
      isPreviewPage &&
      previewScheme &&
      Object.prototype.hasOwnProperty.call(raceClasses, previewScheme)
    ) {
      race = previewScheme;
    }
    // Ensure race is a valid key of raceClasses
    if (!Object.prototype.hasOwnProperty.call(raceClasses, race)) {
      race = 'ELF'; // Default to 'ELF' if race is not a valid key
    }
    logDebug(
      'settings Derived Race Classes',
      race,
      raceClasses[race as keyof typeof raceClasses],
    );
    setDerivedRaceClasses(raceClasses[race as keyof typeof raceClasses]);
  }, [previewScheme, router.pathname, user]);

  useEffect(() => {
    if (user) {
      setAuthorized(true);
    } else {
      setAuthorized(false);
    }
  }, [user]);

  useEffect(() => {
    updateOptions();
  }, [user, updateOptions]);

  const providerValue = useMemo(
    () => ({
      ...meta,
      setMeta,
      raceClasses: derivedRaceClasses,
      updateOptions,
      meta,
      authorized,
      userLoading, // Pass the loading prop to the context
    }),
    [meta, setMeta, derivedRaceClasses, updateOptions, authorized, userLoading],
  );

  return (
    <LayoutContext.Provider value={providerValue}>
      <div className="hidden">
        {/* Link Classes */}
        <div className="text-elf-link-current text-elf-link-link hover:text-elf-link-hover" />
        <div className="text-goblin-link-current text-goblin-link-link hover:text-goblin-link-hover" />
        <div className="text-human-link-current text-human-link-link hover:text-human-link-hover" />
        <div className="text-undead-link-current text-undead-link-link hover:text-undead-link-hover" />

        {/* Background Classes */}
        <div className="bg-elf-bodyBg" />
        <div className="bg-elf-footer" />
        <div className="bg-elf-header-bgcolor" />
        <div className="bg-elf-menu-primary" />
        <div className="bg-elf-menu-secondary" />
        <div className="bg-elf-sidebar-bgcolor" />
        <div className="bg-goblin-bodyBg" />
        <div className="bg-goblin-footer" />
        <div className="bg-goblin-header-bgcolor" />
        <div className="bg-goblin-menu-primary" />
        <div className="bg-goblin-menu-secondary" />
        <div className="bg-goblin-sidebar-bgcolor" />
        <div className="bg-human-bodyBg" />
        <div className="bg-human-footer" />
        <div className="bg-human-header-bgcolor" />
        <div className="bg-human-menu-primary" />
        <div className="bg-human-menu-secondary" />
        <div className="bg-human-sidebar-bgcolor" />
        <div className="bg-undead-bodyBg" />
        <div className="bg-undead-footer" />
        <div className="bg-undead-header-bgcolor" />
        <div className="bg-undead-menu-primary" />
        <div className="bg-undead-menu-secondary" />
        <div className="bg-undead-sidebar-bgcolor" />

        {/* Border Classes */}
        {/* eslint-disable tailwindcss/no-custom-classname */}
        <div className="border-elf" />
        <div className="border-goblin" />
        <div className="border-human" />
        <div className="border-undead" />
        {/* eslint-enable tailwindcss/no-custom-classname */}
      </div>
      {children}
    </LayoutContext.Provider>
  );
};

export { raceClasses };
