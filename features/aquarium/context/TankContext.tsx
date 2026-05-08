import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { Platform } from 'react-native';
import {
  DEFAULT_SUBSCRIPTION_STATE,
  canAccessMeasurementKey,
  getAllowedMeasurementKeys,
  getSubscriptionEntitlements,
  getSubscriptionLimitValue,
  getSubscriptionPlanDefinition,
  getSubscriptionStoreProductId,
  hasSubscriptionFeature,
  isSubscriptionActive,
  normalizeSubscriptionState,
  type SubscriptionEntitlements,
  type SubscriptionFeatureKey,
  type SubscriptionLimitKey,
  type SubscriptionMeasurementParameterKey,
  type SubscriptionPlanDefinition,
  type SubscriptionSource,
  type SubscriptionState,
  type SubscriptionStorePlatform,
  type SubscriptionTier,
} from '@/features/aquarium/subscription/subscriptionModel';
import { auth, db } from '@/shared/services/firebase';
import {
  logTelemetryError,
  logTelemetryEvent,
  trackPurchaseAttempt,
  trackPurchaseFailure,
  trackPurchaseSuccess,
} from '@/shared/services/observability';

type ThemeMode = 'dark' | 'light';
type AppLanguage = 'pl' | 'en' | 'de';
type SectionEntrySource = 'menu' | 'internal';

export type EnabledTests = {
  ph: boolean;
  gh: boolean;
  kh: boolean;
  no2: boolean;
  no3: boolean;
  temperature: boolean;
  nh3nh4: boolean;
  po4: boolean;
  fe: boolean;
  ca: boolean;
  mg: boolean;
};

type AppSettings = {
  themeMode: ThemeMode;
  language: AppLanguage;
  enabledTests: EnabledTests;
  prefillMeasurementFromLast: boolean;
  subscription: SubscriptionState;
};

type AquariumSection =
  | 'home'
  | 'review'
  | 'history'
  | 'tank'
  | 'tankInfo'
  | 'fish'
  | 'plant'
  | 'issues'
  | 'disease'
  | 'plantDisease'
  | 'algae'
  | 'settings'
  | string;

type TankEntity = {
  id?: string;
  name?: string;
  [key: string]: unknown;
};

type UpdateAppSettingsPatch =
  | Partial<AppSettings>
  | ((prev: AppSettings) => Partial<AppSettings>);

type UpdateSubscriptionPatch =
  | Partial<SubscriptionState>
  | ((prev: SubscriptionState) => Partial<SubscriptionState>);

type TankContextValue = {
  tanks: TankEntity[];
  setTanks: (value: TankEntity[]) => void;
  selectedTank: TankEntity | null;
  setSelectedTank: (tank: TankEntity | null) => void;
  activeSection: AquariumSection;
  setActiveSection: (section: AquariumSection, source?: SectionEntrySource) => void;
  sectionEntrySource: SectionEntrySource;
  appSettings: AppSettings;
  subscription: SubscriptionState;
  subscriptionPlan: SubscriptionPlanDefinition;
  subscriptionEntitlements: SubscriptionEntitlements;
  subscriptionActive: boolean;
  updateAppSettings: (patch: UpdateAppSettingsPatch) => void;
  updateSubscription: (patch: UpdateSubscriptionPatch) => void;
  setSubscriptionTier: (tier: SubscriptionTier) => boolean;
  applyAdminSubscriptionTier: (tier: SubscriptionTier) => boolean;
  canManageSubscriptionManually: boolean;
  getStoreProductIdForTier: (tier: SubscriptionTier) => string | null;
  hasSubscriptionFeature: (featureKey: SubscriptionFeatureKey) => boolean;
  getSubscriptionLimit: (limitKey: SubscriptionLimitKey) => number | null;
  getAllowedMeasurementKeys: () => SubscriptionMeasurementParameterKey[];
  canAccessMeasurementKey: (
    key: SubscriptionMeasurementParameterKey
  ) => boolean;
  settingsLoaded: boolean;
};

const TankContext = createContext<TankContextValue | null>(null);
const APP_SETTINGS_STORAGE_KEY = 'app_settings_v1';
const ALLOWED_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function readBooleanEnv(name: string): boolean {
  const value = String(process.env[name] ?? '').trim().toLowerCase();
  return ALLOWED_TRUE_VALUES.has(value);
}

const LOCAL_PLAN_SIMULATION_ENABLED =
  __DEV__ || readBooleanEnv('EXPO_PUBLIC_ENABLE_LOCAL_PLAN_SIMULATION');
const ADMIN_PLAN_OVERRIDE_ENABLED = readBooleanEnv(
  'EXPO_PUBLIC_ENABLE_ADMIN_PLAN_OVERRIDE'
);

function normalizeSubscriptionForEnvironment(
  subscription: SubscriptionState
): SubscriptionState {
  if (LOCAL_PLAN_SIMULATION_ENABLED || subscription.source !== 'local') {
    return subscription;
  }

  return normalizeSubscriptionState({
    ...subscription,
    tier: 'free',
    source: 'system',
    status: 'active',
    featureOverrides: [],
    limitOverrides: {},
    lastValidatedAt: new Date().toISOString(),
  });
}

function areSubscriptionsEqual(
  left: SubscriptionState,
  right: SubscriptionState
): boolean {
  const leftFeatureOverrides = Array.isArray(left.featureOverrides)
    ? left.featureOverrides
    : [];
  const rightFeatureOverrides = Array.isArray(right.featureOverrides)
    ? right.featureOverrides
    : [];

  if (leftFeatureOverrides.length !== rightFeatureOverrides.length) {
    return false;
  }

  for (let index = 0; index < leftFeatureOverrides.length; index += 1) {
    if (leftFeatureOverrides[index] !== rightFeatureOverrides[index]) {
      return false;
    }
  }

  const limitKeys = new Set([
    ...Object.keys(left.limitOverrides ?? {}),
    ...Object.keys(right.limitOverrides ?? {}),
  ]);

  for (const key of limitKeys) {
    const typedKey = key as SubscriptionLimitKey;
    if (
      (left.limitOverrides ?? {})[typedKey] !==
      (right.limitOverrides ?? {})[typedKey]
    ) {
      return false;
    }
  }

  return (
    left.tier === right.tier &&
    left.status === right.status &&
    left.source === right.source &&
    left.startedAt === right.startedAt &&
    left.expiresAt === right.expiresAt &&
    left.renewsAt === right.renewsAt &&
    left.lastValidatedAt === right.lastValidatedAt &&
    left.planVersion === right.planVersion
  );
}

function normalizeFirestoreSubscriptionData(
  data: Record<string, unknown> | null | undefined
): SubscriptionState {
  return normalizeSubscriptionState({
    tier: data?.tier as SubscriptionTier | undefined,
    status: data?.status as SubscriptionState['status'] | undefined,
    source: data?.source as SubscriptionSource | undefined,
    startedAt: typeof data?.startedAt === 'string' ? data.startedAt : null,
    expiresAt: typeof data?.expiresAt === 'string' ? data.expiresAt : null,
    renewsAt: typeof data?.renewsAt === 'string' ? data.renewsAt : null,
    lastValidatedAt:
      typeof data?.lastValidatedAt === 'string' ? data.lastValidatedAt : null,
    planVersion: Number(data?.planVersion ?? DEFAULT_SUBSCRIPTION_STATE.planVersion),
    featureOverrides: Array.isArray(data?.featureOverrides)
      ? (data?.featureOverrides as SubscriptionState['featureOverrides'])
      : [],
    limitOverrides:
      data?.limitOverrides && typeof data.limitOverrides === 'object'
        ? (data.limitOverrides as SubscriptionState['limitOverrides'])
        : {},
  });
}

const DEFAULT_ENABLED_TESTS: EnabledTests = {
  ph: true,
  gh: true,
  kh: true,
  no2: true,
  no3: true,
  temperature: true,
  nh3nh4: false,
  po4: false,
  fe: false,
  ca: false,
  mg: false,
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  themeMode: 'dark',
  language: 'pl',
  enabledTests: DEFAULT_ENABLED_TESTS,
  prefillMeasurementFromLast: false,
  subscription: DEFAULT_SUBSCRIPTION_STATE,
};

type TankProviderProps = {
  children: ReactNode;
};

export function TankProvider({ children }: TankProviderProps) {
  const [tanks, setTanks] = useState<TankEntity[]>([]);
  const [selectedTank, setSelectedTankState] = useState<TankEntity | null>(null);
  const [activeSection, setActiveSectionState] = useState<AquariumSection>('home');
  const [sectionEntrySource, setSectionEntrySource] = useState<SectionEntrySource>('internal');
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const previousSubscriptionRef = useRef<SubscriptionState | null>(null);
  const hasRemoteSubscriptionRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const raw = await AsyncStorage.getItem(APP_SETTINGS_STORAGE_KEY);

        if (!raw || cancelled) {
          return;
        }

        const parsed = JSON.parse(raw) as Partial<AppSettings> & {
          enabledTests?: Partial<EnabledTests>;
        };

        setAppSettings((prev) => {
          const normalizedSubscription = normalizeSubscriptionForEnvironment(
            normalizeSubscriptionState(parsed?.subscription)
          );
          const nextSubscription = hasRemoteSubscriptionRef.current
            ? prev.subscription
            : normalizedSubscription;

          return {
            ...prev,
            ...parsed,
            enabledTests: {
              ...DEFAULT_ENABLED_TESTS,
              ...prev.enabledTests,
              ...(parsed?.enabledTests ?? {}),
            },
            subscription: nextSubscription,
          };
        });
      } catch (error) {
        console.warn(
          'Blad ladowania ustawien aplikacji:',
          error instanceof Error ? error.message : String(error)
        );
        logTelemetryError(error, {
          source: 'tank_context_load_settings',
        });
      } finally {
        if (!cancelled) {
          setSettingsLoaded(true);
        }
      }
    };

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let unsubscribeFirestore: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = null;
      }

      if (!user) {
        hasRemoteSubscriptionRef.current = false;
        const guestSubscription = normalizeSubscriptionForEnvironment(
          normalizeSubscriptionState(DEFAULT_SUBSCRIPTION_STATE)
        );

        setAppSettings((prev) => {
          if (areSubscriptionsEqual(prev.subscription, guestSubscription)) {
            return prev;
          }

          const nextState = {
            ...prev,
            subscription: guestSubscription,
          };

          AsyncStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(nextState)).catch(
            (error) => {
              console.warn(
                'Blad zapisu ustawien aplikacji:',
                error instanceof Error ? error.message : String(error)
              );
              logTelemetryError(error, {
                source: 'tank_context_save_settings',
              });
            }
          );

          return nextState;
        });
        return;
      }

      const subscriptionRef = doc(db, 'userSubscriptions', user.uid);
      unsubscribeFirestore = onSnapshot(
        subscriptionRef,
        (snapshot) => {
          hasRemoteSubscriptionRef.current = true;
          const subscriptionFromFirestore = snapshot.exists()
            ? normalizeSubscriptionForEnvironment(
                normalizeFirestoreSubscriptionData(
                  snapshot.data() as Record<string, unknown>
                )
              )
            : normalizeSubscriptionForEnvironment(
                normalizeSubscriptionState(DEFAULT_SUBSCRIPTION_STATE)
              );

          setAppSettings((prev) => {
            if (areSubscriptionsEqual(prev.subscription, subscriptionFromFirestore)) {
              return prev;
            }

            const nextState = {
              ...prev,
              subscription: subscriptionFromFirestore,
            };

            AsyncStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(nextState)).catch(
              (error) => {
                console.warn(
                  'Blad zapisu ustawien aplikacji:',
                  error instanceof Error ? error.message : String(error)
                );
                logTelemetryError(error, {
                  source: 'tank_context_save_settings',
                });
              }
            );

            return nextState;
          });
        },
        (error) => {
          console.warn(
            'Blad odczytu subskrypcji z Firestore:',
            error instanceof Error ? error.message : String(error)
          );
          logTelemetryError(error, {
            source: 'tank_context_subscription_snapshot',
          });
        }
      );
    });

    return () => {
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
      unsubscribeAuth();
    };
  }, []);

  const setSelectedTank = useCallback((tank: TankEntity | null) => {
    setSelectedTankState(tank ? { ...tank } : null);
  }, []);

  const updateAppSettings = useCallback((patch: UpdateAppSettingsPatch) => {
    setAppSettings((prev) => {
      const nextPatch =
        typeof patch === 'function'
          ? patch(prev)
          : patch ?? {};
      const normalizedSubscription = normalizeSubscriptionForEnvironment(
        normalizeSubscriptionState(nextPatch?.subscription ?? prev.subscription)
      );

      const nextState = {
        ...prev,
        ...nextPatch,
        enabledTests: {
          ...DEFAULT_ENABLED_TESTS,
          ...prev.enabledTests,
          ...(nextPatch?.enabledTests ?? {}),
        },
        subscription: normalizedSubscription,
      };

      AsyncStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(nextState)).catch(
        (error) => {
          console.warn(
            'Blad zapisu ustawien aplikacji:',
            error instanceof Error ? error.message : String(error)
          );
          logTelemetryError(error, {
            source: 'tank_context_save_settings',
          });
        }
      );

      return nextState;
    });
  }, []);

  const setActiveSection = useCallback((section: AquariumSection, source: SectionEntrySource = 'internal') => {
    setSectionEntrySource(source === 'menu' ? 'menu' : 'internal');
    setActiveSectionState(section);
  }, []);

  const subscription = appSettings.subscription;
  const subscriptionPlan = getSubscriptionPlanDefinition(subscription.tier);
  const subscriptionEntitlements = getSubscriptionEntitlements(subscription);
  const subscriptionActive = isSubscriptionActive(subscription);

  const updateSubscription = useCallback(
    (patch: UpdateSubscriptionPatch) => {
      updateAppSettings((prev) => {
        const nextPatch =
          typeof patch === 'function'
            ? patch(prev.subscription)
            : patch ?? {};

        return {
          subscription: normalizeSubscriptionState({
            ...prev.subscription,
            ...nextPatch,
          }),
        };
      });
    },
    [updateAppSettings]
  );

  const applySubscriptionTierWithSource = useCallback(
    (tier: SubscriptionTier, source: SubscriptionSource) => {
      const startedAtMs = Date.now();
      const currentTier = subscription.tier;

      trackPurchaseAttempt({
        purchaseType: 'subscription_tier_change',
        fromTier: currentTier,
        targetTier: tier,
        source,
      });

      try {
        updateSubscription((prev) => ({
          tier,
          status: 'active',
          source,
          startedAt: prev.startedAt ?? new Date().toISOString(),
          lastValidatedAt: new Date().toISOString(),
        }));

        trackPurchaseSuccess({
          purchaseType: 'subscription_tier_change',
          fromTier: currentTier,
          targetTier: tier,
          source,
          durationMs: Date.now() - startedAtMs,
        });
        return true;
      } catch (error) {
        trackPurchaseFailure(error, {
          purchaseType: 'subscription_tier_change',
          fromTier: currentTier,
          targetTier: tier,
          source,
          durationMs: Date.now() - startedAtMs,
        });
        return false;
      }
    },
    [subscription.tier, updateSubscription]
  );

  const setSubscriptionTier = useCallback(
    (tier: SubscriptionTier) => {
      if (!LOCAL_PLAN_SIMULATION_ENABLED) {
        return false;
      }

      return applySubscriptionTierWithSource(tier, 'local');
    },
    [applySubscriptionTierWithSource]
  );

  const applyAdminSubscriptionTier = useCallback(
    (tier: SubscriptionTier) => {
      if (!ADMIN_PLAN_OVERRIDE_ENABLED) {
        return false;
      }

      return applySubscriptionTierWithSource(tier, 'admin');
    },
    [applySubscriptionTierWithSource]
  );

  const canManageSubscriptionManually =
    LOCAL_PLAN_SIMULATION_ENABLED || ADMIN_PLAN_OVERRIDE_ENABLED;

  const getStoreProductIdForTier = useCallback(
    (tier: SubscriptionTier) => {
      const platform =
        Platform.OS === 'ios'
          ? 'ios'
          : Platform.OS === 'android'
            ? 'android'
            : null;

      if (!platform) {
        return null;
      }

      return getSubscriptionStoreProductId(
        tier,
        platform as SubscriptionStorePlatform
      );
    },
    []
  );

  useEffect(() => {
    if (!settingsLoaded) {
      previousSubscriptionRef.current = subscription;
      return;
    }

    const previous = previousSubscriptionRef.current;
    if (!previous) {
      previousSubscriptionRef.current = subscription;
      return;
    }

    const hasStateChange =
      previous.tier !== subscription.tier ||
      previous.status !== subscription.status ||
      previous.source !== subscription.source;

    if (hasStateChange) {
      logTelemetryEvent('subscription_state_changed', {
        previousTier: previous.tier,
        currentTier: subscription.tier,
        previousStatus: previous.status,
        currentStatus: subscription.status,
        previousSource: previous.source,
        currentSource: subscription.source,
      });
    }

    previousSubscriptionRef.current = subscription;
  }, [settingsLoaded, subscription]);

  const hasFeatureAccess = useCallback(
    (featureKey: SubscriptionFeatureKey) =>
      hasSubscriptionFeature(subscription, featureKey),
    [subscription]
  );

  const getSubscriptionLimit = useCallback(
    (limitKey: SubscriptionLimitKey) =>
      getSubscriptionLimitValue(subscription, limitKey),
    [subscription]
  );

  const getAllowedMeasurementKeysForSubscription = useCallback(
    () => getAllowedMeasurementKeys(subscription),
    [subscription]
  );

  const canAccessMeasurementKeyForSubscription = useCallback(
    (key: SubscriptionMeasurementParameterKey) =>
      canAccessMeasurementKey(subscription, key),
    [subscription]
  );

  return (
    <TankContext.Provider
      value={{
        tanks,
        setTanks,
        selectedTank,
        setSelectedTank,
        activeSection,
        setActiveSection,
        sectionEntrySource,
        appSettings,
        subscription,
        subscriptionPlan,
        subscriptionEntitlements,
        subscriptionActive,
        updateAppSettings,
        updateSubscription,
        setSubscriptionTier,
        applyAdminSubscriptionTier,
        canManageSubscriptionManually,
        getStoreProductIdForTier,
        hasSubscriptionFeature: hasFeatureAccess,
        getSubscriptionLimit,
        getAllowedMeasurementKeys:
          getAllowedMeasurementKeysForSubscription,
        canAccessMeasurementKey: canAccessMeasurementKeyForSubscription,
        settingsLoaded,
      }}>
      {children}
    </TankContext.Provider>
  );
}

export function useTank() {
  const context = useContext(TankContext);

  if (!context) {
    throw new Error('useTank must be used within TankProvider');
  }

  return context;
}
