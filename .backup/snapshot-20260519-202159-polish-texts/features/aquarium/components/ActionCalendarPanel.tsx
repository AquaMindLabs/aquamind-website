import { Pressable, Text, View } from 'react-native';

import type { MaintenanceActionMode } from '@/features/aquarium/services/actionStateService';
import type { WaterActionCalendar } from '@/features/aquarium/services/actionCalendarService';

type ActionCalendarPanelProps = {
  isVisible: boolean;
  isExpanded: boolean;
  hasTaskReminderAccess: boolean;
  waterActionCalendar: WaterActionCalendar;
  waterTestingReason: string;
  requiresPostWaterChangeTest: boolean;
  maintenanceActionBusyId: string;
  isLightTheme: boolean;
  theme: {
    border: string;
    cardBg: string;
    cardBgAlt: string;
    borderStrong: string;
    textPrimary: string;
    textSecondary: string;
    actionText: string;
  };
  labels: {
    show: string;
    hide: string;
    premium: string;
    tasksLocked: string;
  };
  onToggleExpanded: () => void;
  onAction: (
    action: { stateKey?: string; stateKeys?: string[]; sourceDueDayBucketMs?: number },
    mode: MaintenanceActionMode
  ) => void;
};

export function ActionCalendarPanel({
  isVisible,
  isExpanded,
  hasTaskReminderAccess,
  waterActionCalendar,
  waterTestingReason,
  requiresPostWaterChangeTest,
  maintenanceActionBusyId,
  isLightTheme,
  theme,
  labels,
  onToggleExpanded,
  onAction,
}: ActionCalendarPanelProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor:
          waterActionCalendar.overdueCount > 0
            ? isLightTheme
              ? '#e8a08c'
              : '#d9480f'
            : theme.border,
        borderRadius: 10,
        padding: 12,
        marginBottom: 18,
        backgroundColor:
          waterActionCalendar.overdueCount > 0
            ? isLightTheme
              ? '#fff4f0'
              : '#2b1410'
            : theme.cardBg,
      }}>
      <Pressable
        onPress={onToggleExpanded}
        disabled={!hasTaskReminderAccess}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: hasTaskReminderAccess ? 1 : 0.75,
        }}>
        <Text
          style={{
            color: theme.textPrimary,
            fontWeight: '700',
            fontSize: 16,
          }}>
          Kalendarz akcji (14 dni)
        </Text>
        <Text style={{ color: theme.actionText, fontWeight: '700' }}>
          {hasTaskReminderAccess
            ? isExpanded
              ? labels.hide
              : labels.show
            : labels.premium}
        </Text>
      </Pressable>

      {!hasTaskReminderAccess ? (
        <Text style={{ color: theme.textSecondary, marginTop: 8, fontSize: 12 }}>
          {labels.tasksLocked}
        </Text>
      ) : !isExpanded ? null : (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
            Plan obejmuje najbliższe {waterActionCalendar.windowDays} dni i łączy podmiany,
            testy, odmulanie oraz serwis filtra.
          </Text>
          <Text style={{ color: theme.textSecondary, marginTop: 4, fontSize: 12 }}>
            {waterTestingReason}
          </Text>

          <View
            style={{
              marginTop: 10,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
            }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 999,
                paddingVertical: 5,
                paddingHorizontal: 10,
                backgroundColor: theme.cardBg,
              }}>
              <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                Podmiana: co {waterActionCalendar.waterChangeIntervalDays} dni
              </Text>
            </View>
            <View
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 999,
                paddingVertical: 5,
                paddingHorizontal: 10,
                backgroundColor: theme.cardBg,
              }}>
              <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                Odmulanie: co {waterActionCalendar.gravelVacuumIntervalDays} dni
              </Text>
            </View>
            <View
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 999,
                paddingVertical: 5,
                paddingHorizontal: 10,
                backgroundColor: theme.cardBg,
              }}>
              <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                Filtr: co {waterActionCalendar.filterServiceIntervalDays} dni
              </Text>
            </View>
          </View>

          {requiresPostWaterChangeTest ? (
            <Text
              style={{
                color: isLightTheme ? '#9a3412' : '#ffdd99',
                marginTop: 10,
                fontSize: 12,
              }}>
              Po podmianie wykonaj dodatkowy test kontrolny.
            </Text>
          ) : null}

          {waterActionCalendar.days.length === 0 ? (
            <Text style={{ color: theme.textSecondary, marginTop: 10, fontSize: 12 }}>
              Brak zaplanowanych akcji na najbliższe 14 dni.
            </Text>
          ) : (
            <View style={{ marginTop: 10 }}>
              {waterActionCalendar.days.map((day, dayIndex) => (
                <View
                  key={`water-action-day-${day.dayBucketMs}`}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 10,
                    padding: 10,
                    marginTop: dayIndex === 0 ? 0 : 8,
                    backgroundColor: theme.cardBg,
                  }}>
                  <Text style={{ color: theme.textPrimary, fontWeight: '700', fontSize: 13 }}>
                    {day.date}
                  </Text>
                  {day.actions.map((action, actionIndex) => {
                    const isOverdue = Boolean(action?.isOverdue);
                    const actionBusyKeyBase = `${action?.stateKey ?? ''}`;
                    const isBusy =
                      maintenanceActionBusyId === `${actionBusyKeyBase}-done` ||
                      maintenanceActionBusyId === `${actionBusyKeyBase}-skip` ||
                      maintenanceActionBusyId === `${actionBusyKeyBase}-postpone`;

                    return (
                      <View
                        key={`water-action-item-${day.dayBucketMs}-${action.id}-${actionIndex}`}
                        style={{
                          borderWidth: 1,
                          borderColor: isOverdue
                            ? isLightTheme
                              ? '#e8a08c'
                              : '#7a1e1e'
                            : theme.border,
                          backgroundColor: isOverdue
                            ? isLightTheme
                              ? '#fff4f0'
                              : '#2a1212'
                            : theme.cardBgAlt,
                          borderRadius: 8,
                          padding: 8,
                          marginTop: 6,
                        }}>
                        <Text
                          style={{
                            color: isOverdue
                              ? isLightTheme
                                ? '#b45309'
                                : '#ffb3b3'
                              : theme.textPrimary,
                            fontWeight: '700',
                            fontSize: 12,
                          }}>
                          {action.title}
                        </Text>
                        {isOverdue ? (
                          <Text
                            style={{
                              color: isLightTheme ? '#9a3412' : '#ffdd99',
                              marginTop: 2,
                              fontSize: 11,
                              fontWeight: '700',
                            }}>
                            Przeterminowane
                          </Text>
                        ) : null}
                        {action.details ? (
                          <Text style={{ color: theme.textSecondary, marginTop: 3, fontSize: 12 }}>
                            {action.details}
                          </Text>
                        ) : null}
                        <View
                          style={{
                            marginTop: 8,
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            gap: 8,
                          }}>
                          <Pressable
                            onPress={() => onAction(action, 'done')}
                            disabled={isBusy}
                            style={{
                              borderWidth: 1,
                              borderColor: theme.borderStrong,
                              borderRadius: 999,
                              paddingVertical: 5,
                              paddingHorizontal: 10,
                              backgroundColor: theme.cardBg,
                              opacity: isBusy ? 0.6 : 1,
                            }}>
                            <Text style={{ color: theme.textPrimary, fontSize: 11, fontWeight: '700' }}>
                              [ ] Zróbione
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => onAction(action, 'skip')}
                            disabled={isBusy}
                            style={{
                              borderWidth: 1,
                              borderColor: theme.border,
                              borderRadius: 999,
                              paddingVertical: 5,
                              paddingHorizontal: 10,
                              backgroundColor: theme.cardBg,
                              opacity: isBusy ? 0.6 : 1,
                            }}>
                            <Text
                              style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '700' }}>
                              Pomiń
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => onAction(action, 'postpone')}
                            disabled={isBusy}
                            style={{
                              borderWidth: 1,
                              borderColor: theme.border,
                              borderRadius: 999,
                              paddingVertical: 5,
                              paddingHorizontal: 10,
                              backgroundColor: theme.cardBg,
                              opacity: isBusy ? 0.6 : 1,
                            }}>
                            <Text
                              style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '700' }}>
                              Przesuń +1 dzień
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
