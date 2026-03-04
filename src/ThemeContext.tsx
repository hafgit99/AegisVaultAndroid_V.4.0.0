import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import RNFS from 'react-native-fs';
import { getTheme, ColorPalette, ThemeMode } from './theme';

const THEME_FILE = `${RNFS.DocumentDirectoryPath}/aegis_theme.json`;

interface ThemeContextType {
  colors: ColorPalette;
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  colors: getTheme(false),
  isDark: false,
  themeMode: 'system',
  setThemeMode: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  // Load saved theme preference on mount
  useEffect(() => {
    (async () => {
      try {
        const exists = await RNFS.exists(THEME_FILE);
        if (exists) {
          const data = JSON.parse(await RNFS.readFile(THEME_FILE, 'utf8'));
          if (data.mode) setThemeModeState(data.mode);
        }
      } catch {}
    })();
  }, []);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await RNFS.writeFile(THEME_FILE, JSON.stringify({ mode }), 'utf8');
    } catch {}
  }, []);

  const isDark =
    themeMode === 'dark' ? true :
    themeMode === 'light' ? false :
    systemScheme === 'dark';

  const colors = getTheme(isDark);

  return (
    <ThemeContext.Provider value={{ colors, isDark, themeMode, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};
