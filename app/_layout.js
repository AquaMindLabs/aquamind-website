import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { ThemeProvider } from '@react-navigation/native';
import { Drawer } from 'expo-router/drawer';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { InteractionManager, useColorScheme } from 'react-native';

import CustomDrawer from '@/features/aquarium/components/CustomDrawer';
import {
  AppThemeProvider,
  useAppTheme,
} from '@/features/aquarium/context/AppThemeContext';
import { TankProvider, useTank } from '@/features/aquarium/context/TankContext';
import ObservabilityErrorBoundary from '@/shared/components/ObservabilityErrorBoundary';
import {
  initializeObservability,
  markStartupReady,
} from '@/shared/services/observability';

WebBrowser.maybeCompleteAuthSession();

function RootAppShell() {
  const { navigationTheme, isDarkTheme, colors } = useAppTheme();

  return (
    <ThemeProvider value={navigationTheme}>
      <Drawer
        drawerContent={(props) => <CustomDrawer {...props} />}
        screenOptions={{
          headerShown: false,
          drawerPosition: 'left',
          swipeEdgeWidth: 40,
          sceneStyle: {
            backgroundColor: colors.pageBg,
          },
          drawerType: 'slide',
          overlayColor: colors.overlay,
          drawerStyle: {
            width: 312,
            borderTopRightRadius: 24,
            borderBottomRightRadius: 24,
            overflow: 'hidden',
            backgroundColor: colors.modalBg,
            borderRightWidth: 1,
            borderRightColor: colors.border,
          },
        }}>
        <Drawer.Screen
          name="index"
          options={{
            drawerLabel: 'Home',
            title: 'Home',
          }}
        />
        <Drawer.Screen
          name="oauthredirect"
          options={{
            drawerItemStyle: { display: 'none' },
            title: '',
          }}
        />
      </Drawer>
      <StatusBar style={isDarkTheme ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const { appSettings, settingsLoaded } = useTank();
  const selectedThemeMode =
    appSettings.themeMode === 'light' || appSettings.themeMode === 'dark'
      ? appSettings.themeMode
      : colorScheme === 'light'
        ? 'light'
        : 'dark';

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      markStartupReady({
        settingsLoaded,
      });
    });

    return () => {
      if (typeof handle?.cancel === 'function') {
        handle.cancel();
      }
    };
  }, [settingsLoaded]);

  return (
    <AppThemeProvider mode={selectedThemeMode}>
      <RootAppShell />
    </AppThemeProvider>
  );
}

export default function RootLayout() {
  useEffect(() => {
    initializeObservability({
      appVersion: Constants.expoConfig?.version ?? null,
      runtimeVersion:
        Constants.expoConfig?.runtimeVersion ??
        Constants.expoRuntimeVersion ??
        null,
    });
  }, []);

  return (
    <ObservabilityErrorBoundary>
      <TankProvider>
        <RootLayoutContent />
      </TankProvider>
    </ObservabilityErrorBoundary>
  );
}
