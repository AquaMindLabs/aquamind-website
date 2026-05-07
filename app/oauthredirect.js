import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { useAppTheme } from '@/features/aquarium/context/AppThemeContext';

WebBrowser.maybeCompleteAuthSession();

export default function OAuthRedirectScreen() {
  const { colors } = useAppTheme();

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      router.replace('/');
    }, 900);

    return () => {
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: colors.pageBg,
      }}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text
        style={{
          marginTop: 16,
          color: colors.textPrimary,
          fontSize: 16,
          fontWeight: '700',
          textAlign: 'center',
        }}>
        Konczenie logowania Google...
      </Text>
    </View>
  );
}
