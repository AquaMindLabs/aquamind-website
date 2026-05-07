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
  pageBg: '#f1f3f5',
  modalBg: '#f4f6f8',
  cardBg: '#ffffff',
  cardBgAlt: '#f8fafc',
  chartBg: '#ffffff',
  chartGrid: '#d9e4f2',
  chartPointBorder: '#dce6f3',
  chartAxis: '#64748b',
  textPrimary: '#111827',
  textSecondary: '#4b5563',
  textMuted: '#6b7280',
  border: '#d0d7de',
  borderStrong: '#94a3b8',
  chipBg: '#ffffff',
  chipText: '#111827',
  inputBorder: '#c7ced6',
  inputText: '#111827',
  inputBg: '#ffffff',
  placeholder: '#6b7280',
  accent: '#2563eb',
  accentStrongBg: '#e5eef9',
  accentSoftBg: '#eef5ff',
  accentText: '#1f4e79',
  accentOnStrong: '#ffffff',
  success: '#2f9e44',
  successBg: '#2b8a3e',
  successSoftBg: '#eaf8ee',
  successText: '#1f7a3a',
  warning: '#b45309',
  warningBg: '#8a6a16',
  warningSoftBg: '#fff7e6',
  warningText: '#8a5a12',
  danger: '#d9480f',
  dangerBg: '#b42318',
  dangerSoftBg: '#fff1ed',
  dangerText: '#b45309',
  overlay: 'rgba(15, 23, 42, 0.28)',
  dragHandle: '#cbd5e1',
};

const DARK_COLORS: ThemeColors = {
  pageBg: '#000000',
  modalBg: '#000000',
  cardBg: '#151515',
  cardBgAlt: '#121212',
  chartBg: '#0d1117',
  chartGrid: '#223045',
  chartPointBorder: '#0b1016',
  chartAxis: '#9da3af',
  textPrimary: '#ffffff',
  textSecondary: '#9da3af',
  textMuted: '#9da3af',
  border: '#333333',
  borderStrong: '#666666',
  chipBg: '#111111',
  chipText: '#ffffff',
  inputBorder: '#6b7280',
  inputText: '#ffffff',
  inputBg: '#0f0f0f',
  placeholder: '#9ca3af',
  accent: '#6cb6ff',
  accentStrongBg: '#102235',
  accentSoftBg: '#17304a',
  accentText: '#c7f7ff',
  accentOnStrong: '#d8ecff',
  success: '#9be7a3',
  successBg: '#2b8a3e',
  successSoftBg: '#12391f',
  successText: '#9be7a3',
  warning: '#ffdd99',
  warningBg: '#8a6a16',
  warningSoftBg: '#2f240f',
  warningText: '#ffdd99',
  danger: '#ffb3b3',
  dangerBg: '#7a1e1e',
  dangerSoftBg: '#2a1212',
  dangerText: '#ffb3b3',
  overlay: 'rgba(0, 0, 0, 0.48)',
  dragHandle: '#4b5563',
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
