import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  type Theme as NavigationTheme,
} from '@react-navigation/native';

type ThemeMode = 'light' | 'dark';

type ThemeColors = {
  pageBg: string;
  modalBg: string;
  cardBg: string;
  cardBgAlt: string;
  chartBg: string;
  chartGrid: string;
  chartPointBorder: string;
  chartAxis: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderStrong: string;
  chipBg: string;
  chipText: string;
  inputBorder: string;
  inputText: string;
  inputBg: string;
  placeholder: string;
  accent: string;
  accentStrongBg: string;
  accentSoftBg: string;
  accentText: string;
  accentOnStrong: string;
  success: string;
  successBg: string;
  successSoftBg: string;
  successText: string;
  warning: string;
  warningBg: string;
  warningSoftBg: string;
  warningText: string;
  danger: string;
  dangerBg: string;
  dangerSoftBg: string;
  dangerText: string;
  overlay: string;
  dragHandle: string;
};

type AppThemeContextValue = {
  mode: ThemeMode;
  isLightTheme: boolean;
  isDarkTheme: boolean;
  colors: ThemeColors;
  navigationTheme: NavigationTheme;
};

const LIGHT_COLORS: ThemeColors = {
  pageBg: '#edf3f8',
  modalBg: '#e8f0f7',
  cardBg: '#fdfefe',
  cardBgAlt: '#f4f9fc',
  chartBg: '#fdfefe',
  chartGrid: '#cddceb',
  chartPointBorder: '#d8e5f1',
  chartAxis: '#5a6f85',
  textPrimary: '#122034',
  textSecondary: '#41556a',
  textMuted: '#607488',
  border: '#c7d8e7',
  borderStrong: '#8ea9c0',
  chipBg: '#f8fbfe',
  chipText: '#17304a',
  inputBorder: '#bad0e2',
  inputText: '#122034',
  inputBg: '#f8fbfe',
  placeholder: '#6b8197',
  accent: '#0f766e',
  accentStrongBg: '#0d615a',
  accentSoftBg: '#dff4f1',
  accentText: '#0c524c',
  accentOnStrong: '#f6fffd',
  success: '#1f8a4c',
  successBg: '#18703f',
  successSoftBg: '#e4f7ed',
  successText: '#17633a',
  warning: '#b46a0f',
  warningBg: '#94540d',
  warningSoftBg: '#fff3df',
  warningText: '#7f4308',
  danger: '#cc4a2a',
  dangerBg: '#a83a21',
  dangerSoftBg: '#ffede8',
  dangerText: '#8e301b',
  overlay: 'rgba(5, 14, 27, 0.34)',
  dragHandle: '#9db4c9',
};

const DARK_COLORS: ThemeColors = {
  pageBg: '#050b12',
  modalBg: '#071019',
  cardBg: '#0d1621',
  cardBgAlt: '#111f2e',
  chartBg: '#0a111b',
  chartGrid: '#233548',
  chartPointBorder: '#10202f',
  chartAxis: '#95abc0',
  textPrimary: '#edf6ff',
  textSecondary: '#b0c2d4',
  textMuted: '#8fa4b9',
  border: '#213447',
  borderStrong: '#34506a',
  chipBg: '#101c29',
  chipText: '#e6f1fb',
  inputBorder: '#2f475f',
  inputText: '#edf6ff',
  inputBg: '#0b1723',
  placeholder: '#7f95ab',
  accent: '#5dd4c0',
  accentStrongBg: '#0f4e47',
  accentSoftBg: '#153c39',
  accentText: '#c7fff6',
  accentOnStrong: '#edfffb',
  success: '#89e7b5',
  successBg: '#21784a',
  successSoftBg: '#133929',
  successText: '#aef5cc',
  warning: '#ffd089',
  warningBg: '#996324',
  warningSoftBg: '#332312',
  warningText: '#ffdca7',
  danger: '#ffae94',
  dangerBg: '#8f311f',
  dangerSoftBg: '#311813',
  dangerText: '#ffcabd',
  overlay: 'rgba(1, 8, 16, 0.62)',
  dragHandle: '#48627a',
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

type AppThemeProviderProps = {
  children: ReactNode;
  mode: ThemeMode;
};

export function AppThemeProvider({
  children,
  mode,
}: AppThemeProviderProps) {
  const isLightTheme = mode === 'light';
  const colors = isLightTheme ? LIGHT_COLORS : DARK_COLORS;

  const navigationTheme = useMemo<NavigationTheme>(() => {
    const baseTheme = isLightTheme
      ? NavigationDefaultTheme
      : NavigationDarkTheme;

    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: colors.pageBg,
        card: colors.cardBg,
        border: colors.border,
        primary: colors.accent,
        text: colors.textPrimary,
        notification: colors.dangerBg,
      },
    };
  }, [colors, isLightTheme]);

  const value = useMemo<AppThemeContextValue>(
    () => ({
      mode,
      isLightTheme,
      isDarkTheme: !isLightTheme,
      colors,
      navigationTheme,
    }),
    [colors, isLightTheme, mode, navigationTheme]
  );

  return (
    <AppThemeContext.Provider value={value}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);

  if (!context) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }

  return context;
}
