import { useState } from 'react';
import type { ReactNode } from 'react';
import { Alert as NativeAlert, Pressable, View } from 'react-native';

import { translateInlineText } from '@/constants/inlineTranslations';
import { Text } from '@/features/aquarium/components/LocalizedText';
import { useTank } from '@/features/aquarium/context/TankContext';

type OnboardingRow = {
  id: string;
  dayStart: number;
  dayEnd: number;
  level?: string;
  text?: string;
  status?: string;
  dueAtMs?: number;
};

type OnboardingPlan = {
  mode?: string;
  modeLabel?: string;
  statusText?: string;
  dayNumber?: number;
  targetEndDay?: number;
  activeStep?: { title?: string; status?: string } | null;
  nextStep?: { title?: string; recommendedDay?: number } | null;
  delayReason?: string;
  requiredTestsNow?: string[];
  actionsToday?: string[];
  checklistStart?: string[];
  firstMeasurements?: string[];
};

type ThemePalette = {
  border: string;
  cardBg: string;
  cardBgAlt: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
};

type OnboardingPanelProps = {
  isVisible: boolean;
  onboardingPlan: OnboardingPlan;
  sectionSeverity: string;
  visibleOnboardingRows: OnboardingRow[];
  completedOnboardingRows: OnboardingRow[];
  selectedTaskChecks: Record<string, boolean>;
  onboardingToggleBusy: boolean;
  onboardingTaskBusy: boolean;
  hasTaskChecklistAccess: boolean;
  subscriptionTasksPlanLockedText: string;
  isLightTheme: boolean;
  theme: ThemePalette;
  formatDateOnly: (value: unknown) => string;
  onDisableOnboarding: () => void;
  onToggleTaskCheck: (rowId: string, checked: boolean) => void;
  renderSectionTitle: (title: string, severity: string) => ReactNode;
};

export function OnboardingPanel({
  isVisible,
  onboardingPlan,
  sectionSeverity,
  visibleOnboardingRows,
  completedOnboardingRows,
  selectedTaskChecks,
  onboardingToggleBusy,
  onboardingTaskBusy,
  hasTaskChecklistAccess,
  subscriptionTasksPlanLockedText,
  isLightTheme,
  theme,
  formatDateOnly,
  onDisableOnboarding,
  onToggleTaskCheck,
  renderSectionTitle,
}: OnboardingPanelProps) {
  const [isCompletedOnboardingVisible, setIsCompletedOnboardingVisible] =
    useState(false);
  const { appSettings } = useTank();
  const alertTitle = translateInlineText('Wy??czyc onboarding?', appSettings.language);
  const alertMessage = translateInlineText(
    'Ta opcja jest nieodwracalna. Po potwierdzeniu sekcja onboardingu zniknie dla tego akwarium.',
    appSettings.language
  );

  if (!isVisible) {
    return null;
  }

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 10,
        padding: 12,
        marginBottom: 18,
        backgroundColor: theme.cardBg,
      }}>
      {renderSectionTitle('Onboarding akwarium', sectionSeverity)}
      <Text style={{ color: theme.textSecondary, marginTop: 6 }}>
        {onboardingPlan.statusText}
      </Text>
      <Text style={{ color: theme.textSecondary, marginTop: 4, fontSize: 12 }}>
        Tryb: {onboardingPlan.modeLabel || onboardingPlan.mode}
      </Text>
      <Text style={{ color: theme.textSecondary, marginTop: 4, fontSize: 12 }}>
        Aktualny dzień od startu: {onboardingPlan.dayNumber}
      </Text>
      {onboardingPlan.activeStep ? (
        <Text style={{ color: theme.textSecondary, marginTop: 4, fontSize: 12 }}>
          Aktywny krok: {onboardingPlan.activeStep.title} (
          {onboardingPlan.activeStep.status})
        </Text>
      ) : null}
      {onboardingPlan.nextStep ? (
        <Text style={{ color: theme.textSecondary, marginTop: 4, fontSize: 12 }}>
          Następny krok: {onboardingPlan.nextStep.title} (dzień{' '}
          {onboardingPlan.nextStep.recommendedDay})
        </Text>
      ) : null}
      {onboardingPlan.delayReason ? (
        <Text style={{ color: theme.textSecondary, marginTop: 4, fontSize: 12 }}>
          Powod opoznienia: {onboardingPlan.delayReason}
        </Text>
      ) : null}
      {Array.isArray(onboardingPlan.requiredTestsNow) &&
      onboardingPlan.requiredTestsNow.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: theme.textPrimary, fontWeight: '700', fontSize: 12 }}>
            Wymagane testy teraz
          </Text>
          {onboardingPlan.requiredTestsNow.map((item, index) => (
            <Text
              key={`onboarding-required-test-${index}`}
              style={{ color: theme.textSecondary, marginTop: 3, fontSize: 12 }}>
              - {item}
            </Text>
          ))}
        </View>
      ) : null}
      {Array.isArray(onboardingPlan.actionsToday) &&
      onboardingPlan.actionsToday.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: theme.textPrimary, fontWeight: '700', fontSize: 12 }}>
            Akcje na dzis
          </Text>
          {onboardingPlan.actionsToday.map((item, index) => (
            <Text
              key={`onboarding-action-today-${index}`}
              style={{ color: theme.textSecondary, marginTop: 3, fontSize: 12 }}>
              - {item}
            </Text>
          ))}
        </View>
      ) : null}
      <Pressable
        onPress={() =>
          NativeAlert.alert(
            alertTitle,
            alertMessage,
            [
              { text: 'Anuluj', style: 'cancel' },
              {
                text: 'Wyłącz',
                style: 'destructive',
                onPress: onDisableOnboarding,
              },
            ]
          )
        }
        disabled={onboardingToggleBusy}
        style={{
          marginTop: 10,
          borderWidth: 1,
          borderColor: theme.borderStrong,
          borderRadius: 8,
          paddingVertical: 8,
          paddingHorizontal: 10,
          backgroundColor: theme.cardBgAlt,
          opacity: onboardingToggleBusy ? 0.7 : 1,
        }}>
        <Text
          style={{
            color: theme.textPrimary,
            fontSize: 12,
            fontWeight: '700',
            textAlign: 'center',
          }}>
          {onboardingToggleBusy ? 'Zapisywanie...' : 'Wyłącz onboarding'}
        </Text>
      </Pressable>
      {Array.isArray(onboardingPlan.checklistStart) &&
      onboardingPlan.checklistStart.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: theme.textPrimary, fontWeight: '700', fontSize: 12 }}>
            Checklista startowa
          </Text>
          {onboardingPlan.checklistStart.slice(0, 4).map((item, index) => (
            <Text
              key={`onboarding-checklist-${index}`}
              style={{ color: theme.textSecondary, marginTop: 3, fontSize: 12 }}>
              - {item}
            </Text>
          ))}
        </View>
      ) : null}
      {Array.isArray(onboardingPlan.firstMeasurements) &&
      onboardingPlan.firstMeasurements.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: theme.textPrimary, fontWeight: '700', fontSize: 12 }}>
            Pierwsze pomiary
          </Text>
          {onboardingPlan.firstMeasurements.slice(0, 4).map((item, index) => (
            <Text
              key={`onboarding-first-measure-${index}`}
              style={{ color: theme.textSecondary, marginTop: 3, fontSize: 12 }}>
              - {item}
            </Text>
          ))}
        </View>
      ) : null}
      {!hasTaskChecklistAccess ? (
        <Text style={{ color: theme.textSecondary, marginTop: 8, fontSize: 12 }}>
          {subscriptionTasksPlanLockedText}
        </Text>
      ) : (
        <>
          <Text style={{ color: theme.textSecondary, marginTop: 4, fontSize: 12 }}>
            Dzień {onboardingPlan.dayNumber} / cel: dzień {onboardingPlan.targetEndDay}
          </Text>
          <Text style={{ color: theme.textSecondary, marginTop: 4, fontSize: 12 }}>
            Zadanie oznacza sie jako zróbione dopiero po zaznaczeniu checkboxa.
          </Text>

          <View style={{ marginTop: 10 }}>
            {visibleOnboardingRows.length === 0 ? (
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                Na dzisiaj nie ma zadan. Wróć jutro po kolejne kroki.
              </Text>
            ) : (
              visibleOnboardingRows.map((row) => {
                const isChecked = Boolean(selectedTaskChecks[row.id]);
                const isOverdue = row.status === 'overdue' && !isChecked;
                const rowTimeLabel =
                  row.status === 'current'
                    ? 'teraz'
                    : row.status === 'overdue'
                      ? 'po terminie'
                      : 'nastepne';

                return (
                  <View
                    key={`onboarding-row-top-${row.id}`}
                    style={{
                      borderWidth: 1,
                      borderColor: isChecked
                        ? isLightTheme
                          ? '#86cf9d'
                          : '#2f9e44'
                        : isOverdue
                          ? isLightTheme
                            ? '#e57373'
                            : '#b02a37'
                          : row.level === 'warning'
                            ? isLightTheme
                              ? '#e8cb85'
                              : '#8a6a16'
                            : row.status === 'current'
                              ? isLightTheme
                                ? '#c9d9ef'
                                : '#335'
                              : theme.border,
                      backgroundColor: isChecked
                        ? isLightTheme
                          ? '#eefaf0'
                          : '#102515'
                        : isOverdue
                          ? isLightTheme
                            ? '#fff1f1'
                            : '#3a1518'
                          : row.level === 'warning'
                            ? isLightTheme
                              ? '#fff9ec'
                              : '#2b2615'
                            : row.status === 'current'
                              ? isLightTheme
                                ? '#eef5ff'
                                : '#0f1e31'
                              : theme.cardBgAlt,
                      borderRadius: 8,
                      padding: 8,
                      marginTop: 8,
                    }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        gap: 8,
                      }}>
                      <Pressable
                        onPress={(event) => {
                          event?.stopPropagation?.();
                          onToggleTaskCheck(row.id, !isChecked);
                        }}
                        disabled={onboardingTaskBusy}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: isChecked
                            ? isLightTheme
                              ? '#1f7a3a'
                              : '#9be7a3'
                            : theme.borderStrong,
                          backgroundColor: isChecked
                            ? isLightTheme
                              ? '#e1f5e8'
                              : '#1a3521'
                            : theme.cardBg,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: 1,
                          opacity: onboardingTaskBusy ? 0.7 : 1,
                        }}>
                        <Text
                          style={{
                            color: isChecked
                              ? isLightTheme
                                ? '#1f7a3a'
                                : '#9be7a3'
                              : 'transparent',
                            fontWeight: '700',
                            fontSize: 13,
                          }}>
                          {isChecked ? 'X' : ''}
                        </Text>
                      </Pressable>

                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: theme.textPrimary,
                            fontWeight: '700',
                            fontSize: 12,
                          }}>
                          Dzień {row.dayStart}
                          {row.dayEnd > row.dayStart ? `-${row.dayEnd}` : ''} |{' '}
                          {formatDateOnly(row.dueAtMs)} | {isChecked ? 'zróbione' : rowTimeLabel}
                        </Text>
                        <Text style={{ color: theme.textSecondary, marginTop: 3 }}>
                          {row.text}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {completedOnboardingRows.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Pressable
                onPress={() => setIsCompletedOnboardingVisible((prev) => !prev)}
                style={{
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  backgroundColor: theme.cardBgAlt,
                }}>
                <Text
                  style={{
                    color: theme.textPrimary,
                    fontSize: 12,
                    fontWeight: '700',
                  }}>
                  {isCompletedOnboardingVisible
                    ? `Ukryj zróbione (${completedOnboardingRows.length})`
                    : `Pokaz zróbione (${completedOnboardingRows.length})`}
                </Text>
              </Pressable>

              {isCompletedOnboardingVisible &&
                completedOnboardingRows.map((row) => (
                  <View
                    key={`onboarding-row-completed-${row.id}`}
                    style={{
                      borderWidth: 1,
                      borderColor: isLightTheme ? '#86cf9d' : '#2f9e44',
                      backgroundColor: isLightTheme ? '#eefaf0' : '#102515',
                      borderRadius: 8,
                      padding: 8,
                      marginTop: 8,
                    }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        gap: 8,
                      }}>
                      <Pressable
                        onPress={(event) => {
                          event?.stopPropagation?.();
                          onToggleTaskCheck(row.id, false);
                        }}
                        disabled={onboardingTaskBusy}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: isLightTheme ? '#1f7a3a' : '#9be7a3',
                          backgroundColor: isLightTheme ? '#e1f5e8' : '#1a3521',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: 1,
                          opacity: onboardingTaskBusy ? 0.7 : 1,
                        }}>
                        <Text
                          style={{
                            color: isLightTheme ? '#1f7a3a' : '#9be7a3',
                            fontWeight: '700',
                            fontSize: 13,
                          }}>
                          X
                        </Text>
                      </Pressable>

                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: theme.textPrimary,
                            fontWeight: '700',
                            fontSize: 12,
                          }}>
                          Dzień {row.dayStart}
                          {row.dayEnd > row.dayStart ? `-${row.dayEnd}` : ''} |{' '}
                          {formatDateOnly(row.dueAtMs)} | zróbione
                        </Text>
                        <Text style={{ color: theme.textSecondary, marginTop: 3 }}>
                          {row.text}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}
