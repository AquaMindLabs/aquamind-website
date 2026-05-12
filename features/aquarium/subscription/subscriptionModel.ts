export type SubscriptionTier = 'free' | 'premium' | 'pro';

export type SubscriptionStatus =
  | 'active'
  | 'inactive'
  | 'grace_period'
  | 'paused'
  | 'cancelled';

export type SubscriptionSource =
  | 'system'
  | 'local'
  | 'app_store'
  | 'play_store'
  | 'stripe'
  | 'promo'
  | 'admin';

export type SubscriptionStorePlatform = 'ios' | 'android';

export type SubscriptionStoreProductMap = Record<
  SubscriptionTier,
  {
    ios: string | null;
    android: string | null;
  }
>;

export type SubscriptionMeasurementParameterKey =
  | 'ph'
  | 'gh'
  | 'kh'
  | 'k'
  | 'tds'
  | 'no2'
  | 'no3'
  | 'temperature'
  | 'nh3nh4'
  | 'po4'
  | 'fe'
  | 'ca'
  | 'mg';

export type SubscriptionFeatureKey =
  | 'core_access'
  | 'premium_parameters'
  | 'parameter_analysis'
  | 'full_history'
  | 'history_trends'
  | 'basic_charts'
  | 'advanced_charts'
  | 'extended_alerts'
  | 'smart_alerts'
  | 'task_reminders'
  | 'task_checklists'
  | 'equipment_save'
  | 'equipment_analysis'
  | 'general_recommendations'
  | 'guided_recommendations'
  | 'ai_diagnosis'
  | 'advanced_analysis'
  | 'vision';

export type SubscriptionLimitKey =
  | 'maxTanks'
  | 'maxSavedMeasurementsPerTank'
  | 'maxScheduledReminders';

export type SubscriptionHistoryAccess =
  | 'limited'
  | 'full'
  | 'full_with_trends';

export type SubscriptionChartAccess = 'none' | 'basic' | 'advanced';

export type SubscriptionAlertAccess = 'simple' | 'extended' | 'smart';

export type SubscriptionTaskAccess = 'none' | 'reminders' | 'checklists_and_plan';

export type SubscriptionEquipmentAccess =
  | 'none'
  | 'save'
  | 'analysis_and_recommendations';

export type SubscriptionRecommendationAccess =
  | 'none'
  | 'general'
  | 'step_by_step';

export type SubscriptionFeatureDefinition = {
  key: SubscriptionFeatureKey;
  label: string;
  description: string;
};

export type SubscriptionCapabilityRow = {
  key:
    | 'aquariums'
    | 'parameters'
    | 'history'
    | 'charts'
    | 'alerts'
    | 'tasks'
    | 'equipment'
    | 'recommendations'
    | 'aiDiagnosis'
    | 'analysis'
    | 'vision';
  label: string;
  values: Record<SubscriptionTier, string>;
};

export type SubscriptionEntitlements = {
  measurementKeys: SubscriptionMeasurementParameterKey[];
  parameterAnalysis: boolean;
  historyAccess: SubscriptionHistoryAccess;
  chartAccess: SubscriptionChartAccess;
  alertAccess: SubscriptionAlertAccess;
  taskAccess: SubscriptionTaskAccess;
  equipmentAccess: SubscriptionEquipmentAccess;
  recommendationAccess: SubscriptionRecommendationAccess;
  aiDiagnosis: boolean;
  advancedAnalysis: boolean;
  vision: boolean;
};

export type SubscriptionPlanDefinition = {
  tier: SubscriptionTier;
  rank: number;
  label: string;
  description: string;
  featureKeys: SubscriptionFeatureKey[];
  limits: Partial<Record<SubscriptionLimitKey, number | null>>;
  entitlements: SubscriptionEntitlements;
  isRecommended?: boolean;
};

export type SubscriptionState = {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  startedAt: string | null;
  expiresAt: string | null;
  renewsAt: string | null;
  lastValidatedAt: string | null;
  planVersion: number;
  featureOverrides: SubscriptionFeatureKey[];
  limitOverrides: Partial<Record<SubscriptionLimitKey, number | null>>;
};

const FREE_MEASUREMENT_KEYS: SubscriptionMeasurementParameterKey[] = [
  'no2',
  'no3',
  'ph',
  'temperature',
];

const PREMIUM_MEASUREMENT_KEYS: SubscriptionMeasurementParameterKey[] = [
  ...FREE_MEASUREMENT_KEYS,
  'gh',
  'kh',
  'k',
  'tds',
  'po4',
  'nh3nh4',
  'fe',
  'ca',
  'mg',
];

const PRO_MEASUREMENT_KEYS: SubscriptionMeasurementParameterKey[] = [
  ...PREMIUM_MEASUREMENT_KEYS,
];

export const SUBSCRIPTION_FEATURE_CATALOG: SubscriptionFeatureDefinition[] = [
  {
    key: 'core_access',
    label: 'Core access',
    description: 'Podstawowy dostep do prowadzenia akwarium i zapisu danych.',
  },
  {
    key: 'premium_parameters',
    label: 'Premium parameters',
    description: 'Dodatkowe parametry w formularzach i analizach.',
  },
  {
    key: 'parameter_analysis',
    label: 'Parameter analysis',
    description: 'Rozszerzona interpretacja parametrow wody.',
  },
  {
    key: 'full_history',
    label: 'Full history',
    description: 'Pelny dostep do zapisanej historii pomiarow.',
  },
  {
    key: 'history_trends',
    label: 'History trends',
    description: 'Trendy i bardziej rozbudowane wnioski z historii.',
  },
  {
    key: 'basic_charts',
    label: 'Basic charts',
    description: 'Podstawowe wykresy i podglad zmian parametrow.',
  },
  {
    key: 'advanced_charts',
    label: 'Advanced charts',
    description: 'Zaawansowane wykresy i dodatkowe warstwy analizy.',
  },
  {
    key: 'extended_alerts',
    label: 'Extended alerts',
    description: 'Rozszerzone alerty i stany ostrzegawcze.',
  },
  {
    key: 'smart_alerts',
    label: 'Smart alerts',
    description: 'Inteligentne alerty i szersza interpretacja ryzyk.',
  },
  {
    key: 'task_reminders',
    label: 'Task reminders',
    description: 'Przypomnienia i podstawowe zadania cykliczne.',
  },
  {
    key: 'task_checklists',
    label: 'Task checklists',
    description: 'Checklisty, plan dzialan i bardziej rozbudowane taski.',
  },
  {
    key: 'equipment_save',
    label: 'Equipment save',
    description: 'Mozliwosc zapisu i organizacji sprzetu.',
  },
  {
    key: 'equipment_analysis',
    label: 'Equipment analysis',
    description: 'Analiza sprzetu i rekomendacje doboru.',
  },
  {
    key: 'general_recommendations',
    label: 'General recommendations',
    description: 'Ogolne wskazowki i podpowiedzi do dalszych dzialan.',
  },
  {
    key: 'guided_recommendations',
    label: 'Guided recommendations',
    description: 'Rekomendacje krok po kroku i pelniejsze prowadzenie.',
  },
  {
    key: 'ai_diagnosis',
    label: 'AI diagnosis',
    description: 'Warstwa pod przyszla diagnoze wspierana przez AI.',
  },
  {
    key: 'advanced_analysis',
    label: 'Advanced analysis',
    description: 'Warstwa pod przyszla bardziej zaawansowana analize.',
  },
  {
    key: 'vision',
    label: 'Vision',
    description: 'Warstwa pod przyszla analize obrazu i rozpoznawanie.',
  },
];

export const SUBSCRIPTION_LIMIT_CATALOG: Record<
  SubscriptionLimitKey,
  { label: string; description: string }
> = {
  maxTanks: {
    label: 'Max tanks',
    description: 'Ile akwariow mozna prowadzic w ramach planu.',
  },
  maxSavedMeasurementsPerTank: {
    label: 'Max measurements per tank',
    description: 'Ile wpisow historii pomiarow plan przechowuje dla zbiornika.',
  },
  maxScheduledReminders: {
    label: 'Max scheduled reminders',
    description: 'Ile przypomnien i taskow moze byc aktywnych jednoczesnie.',
  },
};

export const SUBSCRIPTION_CAPABILITY_ROWS: SubscriptionCapabilityRow[] = [
  {
    key: 'aquariums',
    label: 'Akwaria',
    values: {
      free: '1',
      premium: '3',
      pro: 'bez limitu',
    },
  },
  {
    key: 'parameters',
    label: 'Parametry',
    values: {
      free: 'podstawowe',
      premium: 'pelne',
      pro: 'pelne + analiza',
    },
  },
  {
    key: 'history',
    label: 'Historia',
    values: {
      free: '5 wpisow',
      premium: 'pelna',
      pro: 'pelna + trendy',
    },
  },
  {
    key: 'charts',
    label: 'Wykresy',
    values: {
      free: 'brak',
      premium: 'podstawowe',
      pro: 'zaawansowane',
    },
  },
  {
    key: 'alerts',
    label: 'Alerty',
    values: {
      free: 'proste',
      premium: 'rozszerzone',
      pro: 'inteligentne',
    },
  },
  {
    key: 'tasks',
    label: 'Taski',
    values: {
      free: 'brak',
      premium: 'przypomnienia',
      pro: 'checklisty + plan',
    },
  },
  {
    key: 'equipment',
    label: 'Sprzet',
    values: {
      free: 'brak',
      premium: 'zapis',
      pro: 'analiza + rekomendacje',
    },
  },
  {
    key: 'recommendations',
    label: 'Rekomendacje',
    values: {
      free: 'brak',
      premium: 'ogolne',
      pro: 'krok po kroku',
    },
  },
  {
    key: 'aiDiagnosis',
    label: 'AI diagnoza',
    values: {
      free: 'brak',
      premium: 'brak',
      pro: 'tak',
    },
  },
  {
    key: 'analysis',
    label: 'Analiza',
    values: {
      free: 'brak',
      premium: 'brak',
      pro: 'tak',
    },
  },
  {
    key: 'vision',
    label: 'Vision',
    values: {
      free: 'brak',
      premium: 'brak',
      pro: 'tak',
    },
  },
];

export const SUBSCRIPTION_PLAN_DEFINITIONS: Record<
  SubscriptionTier,
  SubscriptionPlanDefinition
> = {
  free: {
    tier: 'free',
    rank: 0,
    label: 'Free',
    description: '1 akwarium, podstawowe parametry i krotka historia.',
    featureKeys: ['core_access'],
    limits: {
      maxTanks: 1,
      maxSavedMeasurementsPerTank: 5,
      maxScheduledReminders: 0,
    },
    entitlements: {
      measurementKeys: FREE_MEASUREMENT_KEYS,
      parameterAnalysis: false,
      historyAccess: 'limited',
      chartAccess: 'none',
      alertAccess: 'simple',
      taskAccess: 'none',
      equipmentAccess: 'none',
      recommendationAccess: 'none',
      aiDiagnosis: false,
      advancedAnalysis: false,
      vision: false,
    },
  },
  premium: {
    tier: 'premium',
    rank: 1,
    label: 'Premium',
    description:
      'Do 3 akwariow, pelna historia, podstawowe wykresy i przypomnienia.',
    featureKeys: [
      'core_access',
      'premium_parameters',
      'full_history',
      'basic_charts',
      'extended_alerts',
      'task_reminders',
      'equipment_save',
      'general_recommendations',
    ],
    limits: {
      maxTanks: 3,
      maxSavedMeasurementsPerTank: null,
      maxScheduledReminders: null,
    },
    entitlements: {
      measurementKeys: PREMIUM_MEASUREMENT_KEYS,
      parameterAnalysis: false,
      historyAccess: 'full',
      chartAccess: 'basic',
      alertAccess: 'extended',
      taskAccess: 'reminders',
      equipmentAccess: 'save',
      recommendationAccess: 'general',
      aiDiagnosis: false,
      advancedAnalysis: false,
      vision: false,
    },
    isRecommended: true,
  },
  pro: {
    tier: 'pro',
    rank: 2,
    label: 'Pro',
    description:
      'Bez limitu akwariow, trendy, inteligentne alerty i warstwa AI.',
    featureKeys: [
      'core_access',
      'premium_parameters',
      'parameter_analysis',
      'full_history',
      'history_trends',
      'basic_charts',
      'advanced_charts',
      'extended_alerts',
      'smart_alerts',
      'task_reminders',
      'task_checklists',
      'equipment_save',
      'equipment_analysis',
      'general_recommendations',
      'guided_recommendations',
      'ai_diagnosis',
      'advanced_analysis',
      'vision',
    ],
    limits: {
      maxTanks: null,
      maxSavedMeasurementsPerTank: null,
      maxScheduledReminders: null,
    },
    entitlements: {
      measurementKeys: PRO_MEASUREMENT_KEYS,
      parameterAnalysis: true,
      historyAccess: 'full_with_trends',
      chartAccess: 'advanced',
      alertAccess: 'smart',
      taskAccess: 'checklists_and_plan',
      equipmentAccess: 'analysis_and_recommendations',
      recommendationAccess: 'step_by_step',
      aiDiagnosis: true,
      advancedAnalysis: true,
      vision: true,
    },
  },
};

export const DEFAULT_SUBSCRIPTION_STATE: SubscriptionState = {
  tier: 'free',
  status: 'active',
  source: 'system',
  startedAt: null,
  expiresAt: null,
  renewsAt: null,
  lastValidatedAt: null,
  planVersion: 3,
  featureOverrides: [],
  limitOverrides: {},
};

function readOptionalStoreProductId(name: string): string | null {
  const raw = process.env[name];
  const normalized = String(raw ?? '').trim();
  return normalized ? normalized : null;
}

export const SUBSCRIPTION_STORE_PRODUCT_MAP: SubscriptionStoreProductMap = {
  free: {
    ios: null,
    android: null,
  },
  premium: {
    ios: readOptionalStoreProductId(
      'EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_IOS_PRODUCT_ID'
    ),
    android: readOptionalStoreProductId(
      'EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_ANDROID_PRODUCT_ID'
    ),
  },
  pro: {
    ios: readOptionalStoreProductId('EXPO_PUBLIC_SUBSCRIPTION_PRO_IOS_PRODUCT_ID'),
    android: readOptionalStoreProductId(
      'EXPO_PUBLIC_SUBSCRIPTION_PRO_ANDROID_PRODUCT_ID'
    ),
  },
};

export function normalizeSubscriptionState(
  value?: Partial<SubscriptionState> | null
): SubscriptionState {
  const tier = value?.tier;
  const status = value?.status;
  const source = value?.source;

  return {
    ...DEFAULT_SUBSCRIPTION_STATE,
    ...value,
    tier:
      tier === 'free' || tier === 'premium' || tier === 'pro'
        ? tier
        : DEFAULT_SUBSCRIPTION_STATE.tier,
    status:
      status === 'active' ||
      status === 'inactive' ||
      status === 'grace_period' ||
      status === 'paused' ||
      status === 'cancelled'
        ? status
        : DEFAULT_SUBSCRIPTION_STATE.status,
    source:
      source === 'system' ||
      source === 'local' ||
      source === 'app_store' ||
      source === 'play_store' ||
      source === 'stripe' ||
      source === 'promo' ||
      source === 'admin'
        ? source
        : DEFAULT_SUBSCRIPTION_STATE.source,
    featureOverrides: Array.isArray(value?.featureOverrides)
      ? value.featureOverrides.filter((item): item is SubscriptionFeatureKey =>
          SUBSCRIPTION_FEATURE_CATALOG.some((entry) => entry.key === item)
        )
      : DEFAULT_SUBSCRIPTION_STATE.featureOverrides,
    limitOverrides: {
      ...DEFAULT_SUBSCRIPTION_STATE.limitOverrides,
      ...(value?.limitOverrides ?? {}),
    },
    planVersion: Number.isFinite(Number(value?.planVersion))
      ? Number(value?.planVersion)
      : DEFAULT_SUBSCRIPTION_STATE.planVersion,
  };
}

export function listSubscriptionPlans(): SubscriptionPlanDefinition[] {
  return Object.values(SUBSCRIPTION_PLAN_DEFINITIONS).sort(
    (a, b) => a.rank - b.rank
  );
}

export function listSubscriptionCapabilityRows(): SubscriptionCapabilityRow[] {
  return SUBSCRIPTION_CAPABILITY_ROWS;
}

export function getSubscriptionPlanDefinition(
  tier: SubscriptionTier
): SubscriptionPlanDefinition {
  return SUBSCRIPTION_PLAN_DEFINITIONS[tier];
}

export function getSubscriptionEntitlements(
  state: SubscriptionState
): SubscriptionEntitlements {
  return getSubscriptionPlanDefinition(state.tier).entitlements;
}

export function isSubscriptionActive(state: SubscriptionState): boolean {
  return state.status === 'active' || state.status === 'grace_period';
}

export function hasSubscriptionFeature(
  state: SubscriptionState,
  featureKey: SubscriptionFeatureKey
): boolean {
  const plan = getSubscriptionPlanDefinition(state.tier);

  if (state.featureOverrides.includes(featureKey)) {
    return true;
  }

  return plan.featureKeys.includes(featureKey);
}

export function getSubscriptionLimitValue(
  state: SubscriptionState,
  limitKey: SubscriptionLimitKey
): number | null {
  const overrideValue = state.limitOverrides?.[limitKey];

  if (overrideValue !== undefined) {
    return overrideValue ?? null;
  }

  const plan = getSubscriptionPlanDefinition(state.tier);
  return plan.limits?.[limitKey] ?? null;
}

export function getAllowedMeasurementKeys(
  state: SubscriptionState
): SubscriptionMeasurementParameterKey[] {
  return getSubscriptionEntitlements(state).measurementKeys;
}

export function canAccessMeasurementKey(
  state: SubscriptionState,
  key: SubscriptionMeasurementParameterKey
): boolean {
  return getAllowedMeasurementKeys(state).includes(key);
}

export function getSubscriptionStoreProductId(
  tier: SubscriptionTier,
  platform: SubscriptionStorePlatform
): string | null {
  return SUBSCRIPTION_STORE_PRODUCT_MAP[tier]?.[platform] ?? null;
}

export function hasSubscriptionStoreProductId(
  tier: SubscriptionTier,
  platform: SubscriptionStorePlatform
): boolean {
  return Boolean(getSubscriptionStoreProductId(tier, platform));
}
