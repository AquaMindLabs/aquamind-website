import { signOut } from 'firebase/auth';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createTranslator } from '@/constants/translations';
import { useAppTheme } from '@/features/aquarium/context/AppThemeContext';
import { useTank } from '@/features/aquarium/context/TankContext';
import { auth } from '@/shared/services/firebase';

type DrawerNavigation = {
  closeDrawer: () => void;
};

type CustomDrawerProps = {
  navigation: DrawerNavigation;
};

const SECTION_ITEMS = [
  { id: 'home', labelKey: 'sectionHome' },
  { id: 'review', labelKey: 'sectionAquarium' },
  { id: 'fish', labelKey: 'sectionFish' },
  { id: 'plant', labelKey: 'sectionPlants' },
  { id: 'history', labelKey: 'sectionHistory' },
  { id: 'disease', labelKey: 'sectionDiseasesCatalog' },
  { id: 'plantDisease', labelKey: 'sectionPlantDiseasesCatalog' },
  { id: 'algae', labelKey: 'sectionAlgaeCatalog' },
] as const;

export default function CustomDrawer({ navigation }: CustomDrawerProps) {
  const { activeSection, setActiveSection, appSettings } = useTank();
  const { colors, isLightTheme } = useAppTheme();
  const t = createTranslator(appSettings.language);

  const handleSelectSection = (sectionId: string) => {
    setActiveSection(sectionId, 'menu');
    navigation.closeDrawer();
  };
  const isSectionActive = (sectionId: string) => {
    return activeSection === sectionId;
  };

  const handleLogout = async () => {
    navigation.closeDrawer();

    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });

    try {
      await signOut(auth);
    } catch (error) {
      alert(
        t('logoutError', {
          value: error instanceof Error ? error.message : '',
        })
      );
    }
  };

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.modalBg,
        paddingHorizontal: 18,
        paddingTop: 8,
        paddingBottom: 20,
      }}>
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 18,
          backgroundColor: colors.cardBg,
          paddingVertical: 14,
          paddingHorizontal: 14,
          marginBottom: 16,
        }}>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 1.3,
            textTransform: 'uppercase',
            marginBottom: 6,
          }}>
          {t('menu')}
        </Text>
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: 22,
            fontWeight: '700',
            marginBottom: 2,
          }}>
          AquaMind
        </Text>
        <Text
          numberOfLines={2}
          style={{
            color: colors.textMuted,
            fontSize: 12,
            lineHeight: 18,
          }}>
          {t('loggedInAs', {
            value: auth.currentUser?.email ?? auth.currentUser?.uid ?? '-',
          })}
        </Text>
      </View>

      <View style={{ flex: 1 }}>
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: 10,
          }}>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 12,
              fontWeight: '600',
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}>
              {t('appSections')}
          </Text>

          {SECTION_ITEMS.map((section) => (
            <Pressable
              key={section.id}
              onPress={() => handleSelectSection(section.id)}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderWidth: 1,
                borderColor: isSectionActive(section.id)
                  ? colors.accent
                  : colors.border,
                borderRadius: 12,
                marginBottom: 8,
                backgroundColor: isSectionActive(section.id)
                  ? colors.accentStrongBg
                  : colors.cardBgAlt,
                shadowColor: isSectionActive(section.id)
                  ? colors.accent
                  : '#000000',
                shadowOpacity: isSectionActive(section.id)
                  ? (isLightTheme ? 0.2 : 0.32)
                  : 0,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 5 },
                elevation: isSectionActive(section.id) ? 3 : 0,
              }}>
              <Text
                style={{
                  color: isSectionActive(section.id)
                    ? colors.accentOnStrong
                    : colors.textPrimary,
                  fontSize: 15,
                  textAlign: 'left',
                  fontWeight: isSectionActive(section.id) ? '700' : '500',
                }}>
                {t(section.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable
        onPress={() => handleSelectSection('settings')}
        style={{
          borderWidth: 1,
          borderColor: activeSection === 'settings'
            ? colors.accent
            : colors.border,
          borderRadius: 12,
          paddingVertical: 12,
          paddingHorizontal: 12,
          backgroundColor: activeSection === 'settings'
            ? colors.accentStrongBg
            : colors.cardBgAlt,
          marginBottom: 10,
        }}>
        <Text
          style={{
            color: activeSection === 'settings'
              ? colors.accentOnStrong
              : colors.textPrimary,
            textAlign: 'center',
            fontWeight: '700',
          }}>
          {t('sectionSettings')}
        </Text>
      </Pressable>

      <Pressable
        onPress={handleLogout}
        style={{
          borderWidth: 1,
          borderColor: colors.dangerBg,
          borderRadius: 12,
          paddingVertical: 12,
          paddingHorizontal: 12,
          backgroundColor: colors.dangerSoftBg,
        }}>
        <Text
          style={{
            color: colors.dangerText,
            textAlign: 'center',
            fontWeight: '700',
          }}>
          {t('logout')}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}
