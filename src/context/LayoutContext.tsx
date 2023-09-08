import type { ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';

interface LayoutContextProps {
  title?: string;
  description?: string;
  setMeta?: (meta: { title?: string; description?: string }) => void;
  raceClasses: typeof raceClasses;
}

const LayoutContext = createContext<LayoutContextProps>({});

export const useLayout = () => useContext(LayoutContext);

interface LayoutProviderProps {
  children: ReactNode;
}

export const LayoutProvider: React.FC<LayoutProviderProps> = ({ children }) => {
  const [meta, setMeta] = useState({ title: '', description: '' });

  return (
    <LayoutContext.Provider
      value={{
        ...meta,
        setMeta,
        raceClasses,
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
};

function generateRaceColors(
  navActive,
  navHover,
  bg,
  menuPrimary,
  menuSecondary,
  sidebarBg,
  heading,
  bodyBg,
  footer
) {
  return {
    navActiveClass: `text-${navActive}`,
    navHoverClass: `hover:text-${navHover}`,
    bgClass: `bg-${bg}`,
    menuPrimaryClass: `bg-${menuPrimary}`,
    menuSecondaryClass: `bg-${menuSecondary}`,
    sidebarBgClass: `bg-${sidebarBg}`,
    headingClass: `bg-${heading}`,
    bodyBgClass: `bg-${bodyBg}`,
    footerClass: `bg-${footer}`,
  };
}

const raceClasses = {
  ELF: generateRaceColors(
    'elf-link-current', // navActive
    'elf-link-hover', // navHover
    'elf-bg', // bg
    'elf-menu-primary', // menuPrimary
    'elf-menu-secondary', // menuSecondary
    'elf-sidebar-bgcolor', // sidebarBg
    'elf-header-bgcolor', // heading
    'elf-bodyBg', // bodyBg
    'elf-footer' // footer
  ),
  GOBLIN: generateRaceColors(
    'goblin-link-current', // navActive
    'goblin-link-hover', // navHover
    'goblin-bg', // bg
    'goblin-menu-primary', // menuPrimary
    'goblin-menu-secondary', // menuSecondary
    'goblin-sidebar-bgcolor', // sidebarBg
    'goblin-header-bgcolor', // heading
    'goblin-bodyBg', // bodyBg
    'goblin-footer' // footer
  ),
  HUMAN: generateRaceColors(
    'human-link-current', // navActive
    'human-link-hover', // navHover
    'human-bg', // bg
    'human-menu-primary', // menuPrimary
    'human-menu-secondary', // menuSecondary
    'human-sidebar-bgcolor', // sidebarBg
    'human-header-bgcolor', // heading
    'human-bodyBg', // bodyBg
    'human-footer' // footer
  ),
  UNDEAD: generateRaceColors(
    'undead-link-current', // navActive
    'undead-link-hover', // navHover
    'undead-bg', // bg
    'undead-menu-primary', // menuPrimary
    'undead-menu-secondary', // menuSecondary
    'undead-sidebar-bgcolor', // sidebarBg
    'undead-header-bgcolor', // heading
    'undead-bodyBg', // bodyBg
    'undead-footer' // footer
  ),
};

export { raceClasses };
