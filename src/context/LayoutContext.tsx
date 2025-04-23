import type { ReactNode } from 'react';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { IMetaProps } from '@/types/typings';

import { useUser } from './users';
import { logDebug } from '@/utils/logger';

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
    race: race.toUpperCase()
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
  defaultLayoutContextProps
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

  const [authorized, setAuthorized] = useState(false);
  const [derivedRaceClasses, setDerivedRaceClasses] = useState<RaceColors>(
    raceClasses.ELF
  );

  const setMeta = useCallback((newMeta: { title?: string; description?: string }) => {
    setMetaState((prevMeta) => ({
      ...prevMeta,
      ...newMeta,
    }));
  }, [setMetaState]);

  const updateOptions = useCallback(() => {
    let race = user?.colorScheme || user?.race || 'ELF';
    // Ensure race is a valid key of raceClasses
    if (!Object.prototype.hasOwnProperty.call(raceClasses, race)) {
      race = 'ELF'; // Default to 'ELF' if race is not a valid key
    }
    logDebug('settings Derived Race Classes', race, raceClasses[race as keyof typeof raceClasses]);
    setDerivedRaceClasses(raceClasses[race as keyof typeof raceClasses]);
  }, [user]);

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
      userLoading // Pass the loading prop to the context
    }),
    [meta, setMeta, derivedRaceClasses, updateOptions, authorized, userLoading]
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
        <div className="bg-elf-bodyBg bg-elf-footer bg-elf-header-bgcolor bg-elf-menu-primary bg-elf-menu-secondary bg-elf-sidebar-bgcolor" />
        <div className="bg-goblin-bodyBg bg-goblin-footer bg-goblin-header-bgcolor bg-goblin-menu-primary bg-goblin-menu-secondary bg-goblin-sidebar-bgcolor" />
        <div className="bg-human-bodyBg bg-human-footer bg-human-header-bgcolor bg-human-menu-primary bg-human-menu-secondary bg-human-sidebar-bgcolor" />
        <div className="bg-undead-bodyBg bg-undead-footer bg-undead-header-bgcolor bg-undead-menu-primary bg-undead-menu-secondary bg-undead-sidebar-bgcolor" />

        {/* Border Classes */}
        <div className="border-elf" />
        <div className="border-goblin" />
        <div className="border-human" />
        <div className="border-undead" />
      </div>
      {children}
    </LayoutContext.Provider>
  );
};

export { raceClasses };