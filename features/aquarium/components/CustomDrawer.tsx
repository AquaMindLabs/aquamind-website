import { signOut } from 'firebase/auth';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createTranslator } from '@/constants/translations';
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
  { id: 'history', labelKey: 'sectionHistory' },
  { id: 'disease', labelKey: 'sectionDiseasesCatalog' },
  { id: 'plantDisease', labelKey: 'sectionPlantDiseasesCatalog' },
  { id: 'algae', labelKey: 'sectionAlgaeCatalog' },
] as const;

export default function CustomDrawer({ navigation }: CustomDrawerProps) {
  const { activeSection, setActiveSection, appSettings } = useTank();
  const isLightTheme = appSettings.themeMode === 'light';
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
        backgroundColor: isLightTheme ? '#f4f6f8' : 'black',
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 20,
      }}>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: isLightTheme ? '#111' : 'white',
            fontSize: 22,
            fontWeight: '700',
            marginBottom: 18,
          }}>
          {t('menu')}
        </Text>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: '#333',
            paddingTop: 14,
          }}>
          <Text
            style={{
              color: isLightTheme ? '#5b6470' : '#9da3af',
              fontSize: 13,
              marginBottom: 10,
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
                borderColor:
                  isSectionActive(section.id) ? '#6cb6ff' : '#444',
                borderRadius: 8,
                marginBottom: 8,
                backgroundColor:
                  isSectionActive(section.id)
                    ? '#102235'
                    : isLightTheme
                      ? '#ffffff'
                      : '#101010',
              }}>
              <Text
                style={{
                  color: isLightTheme && !isSectionActive(section.id) ? '#111' : 'white',
                  fontSize: 15,
                  textAlign: 'center',
                  fontWeight:
                    isSectionActive(section.id) ? '700' : '400',
                }}>
                {t(section.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text
        style={{
          color: isLightTheme ? '#2f6fb8' : '#8dc7ff',
          fontSize: 12,
          marginBottom: 8,
        }}>
        {t('loggedInAs', {
          value: auth.currentUser?.email ?? auth.currentUser?.uid ?? '-',
        })}
      </Text>

      <Pressable
        onPress={() => handleSelectSection('settings')}
        style={{
          borderWidth: 1,
          borderColor: activeSection === 'settings' ? '#6cb6ff' : '#444',
          borderRadius: 8,
          paddingVertical: 12,
          paddingHorizontal: 12,
          backgroundColor:
            activeSection === 'settings'
              ? '#102235'
              : isLightTheme
                ? '#ffffff'
                : '#101010',
          marginBottom: 10,
        }}>
        <Text
          style={{
            color: isLightTheme && activeSection !== 'settings' ? '#111' : 'white',
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
          borderColor: '#7a1e1e',
          borderRadius: 8,
          paddingVertical: 12,
          paddingHorizontal: 12,
          backgroundColor: '#2a1212',
        }}>
        <Text
          style={{
            color: '#ffb3b3',
            textAlign: 'center',
            fontWeight: '700',
          }}>
          {t('logout')}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}
