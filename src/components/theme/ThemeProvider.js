'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import {
  applyTheme,
  resolveTheme,
  storeTheme,
  THEMES,
} from '@/lib/theme';

const ThemeContext = createContext({
  theme: THEMES.DARK,
  toggleTheme: () => {},
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(THEMES.DARK);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initialTheme = resolveTheme();
    setThemeState(initialTheme);
    applyTheme(initialTheme);
    setReady(true);
  }, []);

  const setTheme = (nextTheme) => {
    setThemeState(nextTheme);
    applyTheme(nextTheme);
    storeTheme(nextTheme);
  };

  const toggleTheme = () => {
    setTheme(theme === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, ready }}>
      {children}
    </ThemeContext.Provider>
  );
}
