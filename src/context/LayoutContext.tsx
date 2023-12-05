import type { ReactNode } from 'react';
import React, { createContext, useContext, useEffect, useState } from 'react';
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
}

interface LayoutContextProps {
  title?: string;
  description?: string;
  setMeta?: (meta: { title?: string; description?: string }) => void;
  raceClasses: RaceColors;
}

// Create Context
const LayoutContext = createContext<LayoutContextProps>({});

// Hook to use context
export const useLayout = () => useContext(LayoutContext);

interface LayoutProviderProps {
  children: ReactNode;
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
    borderBottomClass: `${race}-double-border-down`
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

// LayoutProvider Component
export const LayoutProvider: React.FC<LayoutProviderProps> = ({ children }) => {
  const [meta, setMeta] = useState({ title: '', description: '' });
  const { user } = useUser();
  const [derivedRaceClasses, setDerivedRaceClasses] = useState<RaceColors>(raceClasses['ELF']);

  const updateOptions = () => {
    // Determine the race and corresponding classes
    const race = user?.colorScheme || user?.race || 'ELF';
    setDerivedRaceClasses(raceClasses[race]);
  }
  
  useEffect(() => {
    updateOptions();
  }, [user]);

  return (
    <LayoutContext.Provider value={{ ...meta, setMeta, raceClasses: derivedRaceClasses, updateOptions }}>
      <div className="hidden">
        {/* Link Classes */}
        <div className="text-elf-link-current hover:text-elf-link-hover text-elf-link-link"></div>
        <div className="text-goblin-link-current hover:text-goblin-link-hover text-goblin-link-link"></div>
        <div className="text-human-link-current hover:text-human-link-hover text-human-link-link"></div>
        <div className="text-undead-link-current hover:text-undead-link-hover text-undead-link-link"></div>

        {/* Background Classes */}
        <div className="bg-elf-header-bgcolor bg-elf-menu-primary bg-elf-menu-secondary bg-elf-sidebar-bgcolor bg-elf-bodyBg bg-elf-footer"></div>
        <div className="bg-goblin-header-bgcolor bg-goblin-menu-primary bg-goblin-menu-secondary bg-goblin-sidebar-bgcolor bg-goblin-bodyBg bg-goblin-footer"></div>
        <div className="bg-human-header-bgcolor bg-human-menu-primary bg-human-menu-secondary bg-human-sidebar-bgcolor bg-human-bodyBg bg-human-footer"></div>
        <div className="bg-undead-header-bgcolor bg-undead-menu-primary bg-undead-menu-secondary bg-undead-sidebar-bgcolor bg-undead-bodyBg bg-undead-footer"></div>

        {/* Border Classes */}
        <div className="border-elf"></div>
        <div className="border-goblin"></div>
        <div className="border-human"></div>
        <div className="border-undead"></div>
      </div>
      {children}
    </LayoutContext.Provider>
  );
};

export { raceClasses };
