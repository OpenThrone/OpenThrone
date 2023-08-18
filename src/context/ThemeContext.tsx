import Error from 'next/error';
import React, { createContext, useContext } from 'react';

const navLinkColor = "rgb(253, 226, 101)";
const titleColor = "rgb(221, 149, 63)";

function generateRaceColorsBasedOnRace(race) {
  // ... Your generateRaceColors function here ...
}

const ThemeContext = createContext();

export function ThemeProvider({ children, race }) {
  const theme = generateRaceColorsBasedOnRace(race);

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
