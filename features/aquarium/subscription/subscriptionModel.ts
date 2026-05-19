export type SubscriptionTier = 'free' | 'premium' | 'pro';
export type PlanId = SubscriptionTier;

export type SubscriptionStatus =
  | 'active'
  | 'inactive'
  | 'grace_period'
  | 'paused'
  | 'cancelled'
  | 'expired';

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
  | 'mg'
  | 'co2';

export type MeasurementSetKind = 'basic' | 'full';
export type DiagnosisAccess =
  | 'catalog_only'
  | 'diagnosis'
  | 'diagnosis_with_action_plan';
export type CompatibilityAccess =
  | 'basic'
  | 'advanced'
  | 'advanced_with_recommendations';
export type TrendAnalysisAccess = false | 'basic' | 'advanced';
export type SmartActionPlanAccess = false | 'advanced' | 'smart';

export type SubscriptionCapabilityKey =
  | 'maxTanks'
  | 'measurementSet'
  | 'historyDays'
  | 'advancedWaterAnalysis'
  | 'trendAnalysis'
  | 'stockingCompatibility'
  | 'equipmentAnalysis'
  | 'algaeDiagnosis'
  | 'fishDiseaseDiagnosis'
  | 'plantDiseaseDiagnosis'
  | 'automaticTasks'
  | 'smartActionPlan'
  | 'aiAssistant'
  | 'exportData';

export type SubscriptionCapabilities = {
  maxTanks: number | null;
  measurementSet: MeasurementSetKind;
  historyDays: number | null;
  advancedWaterAnalysis: boolean;
  trendAnalysis: TrendAnalysisAccess;
  stockingCompatibility: CompatibilityAccess;
  equipmentAnalysis: CompatibilityAccess;
  algaeDiagnosis: DiagnosisAccess;
  fishDiseaseDiagnosis: DiagnosisAccess;
  plantDiseaseDiagnosis: DiagnosisAccess;
  automaticTasks: boolean;
  smartActionPlan: SmartActionPlanAccess;
  aiAssistant: boolean;
  exportData: boolean;
};

export type SubscriptionFeatureKey =
  | 'core_access'
  | 'multiple_tanks'
  | 'full_measurements'
  | 'full_history'
  | 'advanced_water_analysis'
  | 'trend_analysis'
  | 'stocking_compatibility'
  | 'equipment_analysis'
  | 'algae_diagnosis'
  | 'fish_disease_diagnosis'
  | 'plant_disease_diagnosis'
  | 'automatic_tasks'
  | 'smart_action_plan'
  | 'ai_assistant'
  | 'export_data'
  | 'critical_alerts';

export type SubscriptionLimitKey =
  | 'maxTanks'
  | 'historyDays'
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
    | 'alerts'
    | 'catalogs'
    | 'stocking'
    | 'equipment'
    | 'algae'
    | 'diseases'
    | 'tasks'
    | 'trends'
    | 'actionPlan'
    | 'ai';
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
  capabilities: SubscriptionCapabilities;
  entitlements: SubscriptionEntitlements;
  isRecommended?: boolean;
};

export type SubscriptionState = {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  productId: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  renewsAt: string | null;
  lastValidatedAt: string | null;
  planVersion: number;
  featureOverrides: SubscriptionFeatureKey[];
  limitOverrides: Partial<Record<SubscriptionLimitKey, number | null>>;
};

const BASIC_MEASUREMENT_KEYS: SubscriptionMeasurementParameterKey[] = [
  'ph',
  'gh',
  'kh',
  'no2',
  'no3',
  'temperature',
];

const FULL_MEASUREMENT_KEYS: SubscriptionMeasurementParameterKey[] = [
  'ph',
  'gh',
  'kh',
  'no2',
  'no3',
  'nh3nh4',
  'po4',
  'k',
  'ca',
  'mg',
  'fe',
  'tds',
  'co2',
  'temperature',
];

const ALL_MEASUREMENT_KEYS = Array.from(new Set([...FULL_MEASUREMENT_KEYS]));

export const SUBSCRIPTION_FEATURE_CATALOG: SubscriptionFeatureDefinition[] = [
  {
    key: 'core_access',
    label: 'Core access',
    description: 'Podstawowe prowadzenie akwarium.',
  },
  {
    key: 'multiple_tanks',
    label: 'Multiple tanks',
    description: 'Prowadzenie więcej niż jednego akwarium.',
  },
  {
    key: 'full_measurements',
    label: 'Full measurements',
    description: 'Pełny zestaw parametrów wody.',
  },
  {
    key: 'full_history',
    label: 'Full history',
    description: 'Pełna historia pomiarów bez limitu dni.',
  },
  {
    key: 'advanced_water_analysis',
    label: 'Advanced water analysis',
    description: 'Rozszerzona analiza parametrów i zależności.',
  },
  {
    key: 'trend_analysis',
    label: 'Trend analysis',
    description: 'Analiza trendow i zmian w czasie.',
  },
  {
    key: 'stocking_compatibility',
    label: 'Stocking compatibility',
    description: 'Zaawansowana ocena kompatybilnosci obsady.',
  },
  {
    key: 'equipment_analysis',
    label: 'Equipment analysis',
    description: 'Zaawansowana ocena sprzetu i rekomendacje.',
  },
  {
    key: 'algae_diagnosis',
    label: 'Algae diagnosis',
    description: 'Diagnoza glonow.',
  },
  {
    key: 'fish_disease_diagnosis',
    label: 'Fish disease diagnosis',
    description: 'Diagnoza chorób ryb.',
  },
  {
    key: 'plant_disease_diagnosis',
    label: 'Plant disease diagnosis',
    description: 'Diagnoza chorób roslin.',
  },
  {
    key: 'automatic_tasks',
    label: 'Automatic tasks',
    description: 'Automatyczny harmonogram i przypomnienia.',
  },
  {
    key: 'smart_action_plan',
    label: 'Smart action plan',
    description: 'Plan co robic dzisiaj i plan naprawczy.',
  },
  {
    key: 'ai_assistant',
    label: 'AI assistant',
    description: 'Asystent AI.',
  },
  {
    key: 'export_data',
    label: 'Export data',
    description: 'Eksport danych.',
  },
  {
    key: 'critical_alerts',
    label: 'Critical alerts',
    description: 'Krytyczne alerty bez paywalla.',
  },
];

export const SUBSCRIPTION_CAPABILITY_ROWS: SubscriptionCapabilityRow[] = [
  {
    key: 'aquariums',
    label: 'Liczba akwariów',
    values: {
      free: '1 aktywne',
      premium: '3 aktywne',
      pro: 'bez limitu',
    },
  },
  {
    key: 'parameters',
    label: 'Parametry wody',
    values: {
      free: 'podstawowe',
      premium: 'pełne',
      pro: 'pełne',
    },
  },
  {
    key: 'history',
    label: 'Historia',
    values: {
      free: '30 dni',
      premium: 'pełna',
      pro: 'pełna',
    },
  },
  {
    key: 'alerts',
    label: 'Alerty',
    values: {
      free: 'podstawowe + krytyczne',
      premium: 'rozszerzone',
      pro: 'zaawansowane',
    },
  },
  {
    key: 'catalogs',
    label: 'Katalogi',
    values: {
      free: 'podstawowe',
      premium: 'pełne',
      pro: 'pełne',
    },
  },
  {
    key: 'stocking',
    label: 'Obsada',
    values: {
      free: 'podstawowa kompatybilnosc',
      premium: 'zaawansowana kompatybilnosc',
      pro: 'zaawansowana + rekomendacje',
    },
  },
  {
    key: 'equipment',
    label: 'Sprzet',
    values: {
      free: 'podstawowa ocena',
      premium: 'pełna ocena',
      pro: 'pełna + rekomendacje',
    },
  },
  {
    key: 'algae',
    label: 'Glony',
    values: {
      free: 'katalog',
      premium: 'diagnoza',
      pro: 'diagnoza + plan',
    },
  },
  {
    key: 'diseases',
    label: 'Choroby',
    values: {
      free: 'katalog',
      premium: 'diagnoza',
      pro: 'diagnoza + plan',
    },
  },
  {
    key: 'tasks',
    label: 'Zadania',
    values: {
      free: 'reczne',
      premium: 'automatyczne',
      pro: 'automatyczne',
    },
  },
  {
    key: 'trends',
    label: 'Trendy',
    values: {
      free: 'brak',
      premium: 'podstawowe',
      pro: 'zaawansowane',
    },
  },
  {
    key: 'actionPlan',
    label: 'Plan działania',
    values: {
      free: 'brak',
      premium: 'zaawansowany',
      pro: 'smart',
    },
  },
  {
    key: 'ai',
    label: 'AI / Asystent',
    values: {
      free: 'brak',
      premium: 'brak',
      pro: 'tak',
    },
  },
];

const SUBSCRIPTION_PLAN_CAPABILITIES: Record<PlanId, SubscriptionCapabilities> = {
  free: {
    maxTanks: 1,
    measurementSet: 'basic',
    historyDays: 30,
    advancedWaterAnalysis: false,
    trendAnalysis: false,
    stockingCompatibility: 'basic',
    equipmentAnalysis: 'basic',
    algaeDiagnosis: 'catalog_only',
    fishDiseaseDiagnosis: 'catalog_only',
    plantDiseaseDiagnosis: 'catalog_only',
    automaticTasks: false,
    smartActionPlan: false,
    aiAssistant: false,
    exportData: false,
  },
  premium: {
    maxTanks: 3,
    measurementSet: 'full',
    historyDays: null,
    advancedWaterAnalysis: true,
    trendAnalysis: 'basic',
    stockingCompatibility: 'advanced',
    equipmentAnalysis: 'advanced',
    algaeDiagnosis: 'diagnosis',
    fishDiseaseDiagnosis: 'diagnosis',
    plantDiseaseDiagnosis: 'diagnosis',
    automaticTasks: true,
    smartActionPlan: 'advanced',
    aiAssistant: false,
    exportData: true,
  },
  pro: {
    maxTanks: null,
    measurementSet: 'full',
    historyDays: null,
    advancedWaterAnalysis: true,
    trendAnalysis: 'advanced',
    stockingCompatibility: 'advanced_with_recommendations',
    equipmentAnalysis: 'advanced_with_recommendations',
    algaeDiagnosis: 'diagnosis_with_action_plan',
    fishDiseaseDiagnosis: 'diagnosis_with_action_plan',
    plantDiseaseDiagnosis: 'diagnosis_with_action_plan',
    automaticTasks: true,
    smartActionPlan: 'smart',
    aiAssistant: true,
    exportData: true,
  },
};

export const PLAN_LIMITS: Record<PlanId, { maxTanks: number | null; historyDays: number | null }> = {
  free: {
    maxTanks: 1,
    historyDays: 30,
  },
  premium: {
    maxTanks: 3,
    historyDays: null,
  },
  pro: {
    maxTanks: null,
    historyDays: null,
  },
};

function buildEntitlementsForPlan(planId: PlanId): SubscriptionEntitlements {
  const capabilities = SUBSCRIPTION_PLAN_CAPABILITIES[planId];

  return {
    measurementKeys:
      capabilities.measurementSet === 'basic'
        ? BASIC_MEASUREMENT_KEYS
        : FULL_MEASUREMENT_KEYS,
    parameterAnalysis: capabilities.advancedWaterAnalysis,
    historyAccess:
      capabilities.trendAnalysis === 'advanced'
        ? 'full_with_trends'
        : capabilities.historyDays === null
          ? 'full'
          : 'limited',
    chartAccess:
      planId === 'free' ? 'none' : planId === 'premium' ? 'basic' : 'advanced',
    alertAccess:
      planId === 'free' ? 'simple' : planId === 'premium' ? 'extended' : 'smart',
    taskAccess:
      planId === 'free'
        ? 'none'
        : planId === 'premium'
          ? 'reminders'
          : 'checklists_and_plan',
    equipmentAccess:
      capabilities.equipmentAnalysis === 'advanced_with_recommendations'
        ? 'analysis_and_recommendations'
        : capabilities.equipmentAnalysis === 'advanced'
          ? 'save'
          : 'none',
    recommendationAccess:
      capabilities.smartActionPlan === 'smart'
        ? 'step_by_step'
        : capabilities.smartActionPlan === 'advanced'
          ? 'general'
          : 'none',
    aiDiagnosis: capabilities.aiAssistant,
    advancedAnalysis: capabilities.trendAnalysis !== false,
    vision: capabilities.aiAssistant,
  };
}

function buildFeatureKeysForPlan(planId: PlanId): SubscriptionFeatureKey[] {
  const capabilities = SUBSCRIPTION_PLAN_CAPABILITIES[planId];
  const keys: SubscriptionFeatureKey[] = ['core_access', 'critical_alerts'];

  if ((capabilities.maxTanks ?? 0) > 1 || capabilities.maxTanks === null) {
    keys.push('multiple_tanks');
  }
  if (capabilities.measurementSet === 'full') {
    keys.push('full_measurements');
  }
  if (capabilities.historyDays === null) {
    keys.push('full_history');
  }
  if (capabilities.advancedWaterAnalysis) {
    keys.push('advanced_water_analysis');
  }
  if (capabilities.trendAnalysis !== false) {
    keys.push('trend_analysis');
  }
  if (capabilities.stockingCompatibility !== 'basic') {
    keys.push('stocking_compatibility');
  }
  if (capabilities.equipmentAnalysis !== 'basic') {
    keys.push('equipment_analysis');
  }
  if (capabilities.algaeDiagnosis !== 'catalog_only') {
    keys.push('algae_diagnosis');
  }
  if (capabilities.fishDiseaseDiagnosis !== 'catalog_only') {
    keys.push('fish_disease_diagnosis');
  }
  if (capabilities.plantDiseaseDiagnosis !== 'catalog_only') {
    keys.push('plant_disease_diagnosis');
  }
  if (capabilities.automaticTasks) {
    keys.push('automatic_tasks');
  }
  if (capabilities.smartActionPlan !== false) {
    keys.push('smart_action_plan');
  }
  if (capabilities.aiAssistant) {
    keys.push('ai_assistant');
  }
  if (capabilities.exportData) {
    keys.push('export_data');
  }

  return keys;
}

export const SUBSCRIPTION_PLANS: Record<PlanId, SubscriptionPlanDefinition> = {
  free: {
    tier: 'free',
    rank: 0,
    label: 'Free',
    description: 'Podstawowe prowadzenie jednego akwarium.',
    featureKeys: buildFeatureKeysForPlan('free'),
    limits: {
      maxTanks: PLAN_LIMITS.free.maxTanks,
      historyDays: PLAN_LIMITS.free.historyDays,
      maxSavedMeasurementsPerTank: PLAN_LIMITS.free.historyDays,
      maxScheduledReminders: 0,
    },
    capabilities: SUBSCRIPTION_PLAN_CAPABILITIES.free,
    entitlements: buildEntitlementsForPlan('free'),
  },
  premium: {
    tier: 'premium',
    rank: 1,
    label: 'Premium',
    description: 'Pełna analiza akwarium, obsady, sprzetu i problemów.',
    featureKeys: buildFeatureKeysForPlan('premium'),
    limits: {
      maxTanks: PLAN_LIMITS.premium.maxTanks,
      historyDays: PLAN_LIMITS.premium.historyDays,
      maxSavedMeasurementsPerTank: null,
      maxScheduledReminders: null,
    },
    capabilities: SUBSCRIPTION_PLAN_CAPABILITIES.premium,
    entitlements: buildEntitlementsForPlan('premium'),
    isRecommended: true,
  },
  pro: {
    tier: 'pro',
    rank: 2,
    label: 'Pro',
    description: 'Zaawansowany asystent z planem działania krok po kroku.',
    featureKeys: buildFeatureKeysForPlan('pro'),
    limits: {
      maxTanks: PLAN_LIMITS.pro.maxTanks,
      historyDays: PLAN_LIMITS.pro.historyDays,
      maxSavedMeasurementsPerTank: null,
      maxScheduledReminders: null,
    },
    capabilities: SUBSCRIPTION_PLAN_CAPABILITIES.pro,
    entitlements: buildEntitlementsForPlan('pro'),
  },
};

export const SUBSCRIPTION_PLAN_DEFINITIONS = SUBSCRIPTION_PLANS;

export const DEFAULT_SUBSCRIPTION_STATE: SubscriptionState = {
  tier: 'free',
  status: 'active',
  source: 'system',
  productId: null,
  startedAt: null,
  expiresAt: null,
  renewsAt: null,
  lastValidatedAt: null,
  planVersion: 4,
  featureOverrides: [],
  limitOverrides: {},
};

function readOptionalStoreProductId(names: string | string[], fallback: string | null = null): string | null {
  const keys = Array.isArray(names) ? names : [names];
  for (const name of keys) {
    const normalized = String(process.env[name] ?? '').trim();
    if (normalized) {
      return normalized;
    }
  }
  return fallback;
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
      [
        'EXPO_PUBLIC_SUBSCRIPTION_PLUS_ANDROID_PRODUCT_ID',
        'EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_ANDROID_PRODUCT_ID',
      ],
      'aquamind_plus_monthly:monthly'
    ),
  },
  pro: {
    ios: readOptionalStoreProductId('EXPO_PUBLIC_SUBSCRIPTION_PRO_IOS_PRODUCT_ID'),
    android: readOptionalStoreProductId(
      [
        'EXPO_PUBLIC_SUBSCRIPTION_AI_PRO_ANDROID_PRODUCT_ID',
        'EXPO_PUBLIC_SUBSCRIPTION_PRO_ANDROID_PRODUCT_ID',
      ],
      'aquamind_ai_pro_monthly:monthly'
    ),
  },
};

export function normalizePlanId(value: unknown): PlanId {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'premium' || normalized === 'pro') {
    return normalized;
  }
  return 'free';
}

export function normalizeSubscriptionState(
  value?: Partial<SubscriptionState> | null
): SubscriptionState {
  const tier = normalizePlanId(value?.tier);
  const status = value?.status;
  const source = value?.source;

  return {
    ...DEFAULT_SUBSCRIPTION_STATE,
    ...value,
    tier,
    status:
      status === 'active' ||
      status === 'inactive' ||
      status === 'grace_period' ||
      status === 'paused' ||
      status === 'cancelled' ||
      status === 'expired'
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
    productId: String((value as { productId?: unknown })?.productId ?? '').trim() || null,
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

export function getPlanLimits(planId: PlanId): { maxTanks: number | null; historyDays: number | null } {
  return PLAN_LIMITS[normalizePlanId(planId)];
}

export function getPlanLabel(planId: PlanId): string {
  return SUBSCRIPTION_PLANS[normalizePlanId(planId)].label;
}

export function isPaidPlan(planId: PlanId): boolean {
  const normalized = normalizePlanId(planId);
  return normalized === 'premium' || normalized === 'pro';
}

export function getCapability<K extends SubscriptionCapabilityKey>(
  planId: PlanId,
  capabilityKey: K
): SubscriptionCapabilities[K] {
  return SUBSCRIPTION_PLAN_CAPABILITIES[normalizePlanId(planId)][capabilityKey];
}

const FEATURE_TO_CAPABILITY_MAP: Record<
  SubscriptionFeatureKey,
  ((capabilities: SubscriptionCapabilities) => boolean) | null
> = {
  core_access: () => true,
  critical_alerts: () => true,
  multiple_tanks: (c) => c.maxTanks === null || c.maxTanks > 1,
  full_measurements: (c) => c.measurementSet === 'full',
  full_history: (c) => c.historyDays === null,
  advanced_water_analysis: (c) => c.advancedWaterAnalysis,
  trend_analysis: (c) => c.trendAnalysis !== false,
  stocking_compatibility: (c) => c.stockingCompatibility !== 'basic',
  equipment_analysis: (c) => c.equipmentAnalysis !== 'basic',
  algae_diagnosis: (c) => c.algaeDiagnosis !== 'catalog_only',
  fish_disease_diagnosis: (c) => c.fishDiseaseDiagnosis !== 'catalog_only',
  plant_disease_diagnosis: (c) => c.plantDiseaseDiagnosis !== 'catalog_only',
  automatic_tasks: (c) => c.automaticTasks,
  smart_action_plan: (c) => c.smartActionPlan !== false,
  ai_assistant: (c) => c.aiAssistant,
  export_data: (c) => c.exportData,
};

export function canUseFeature(planId: PlanId, featureKey: SubscriptionFeatureKey): boolean {
  const normalizedPlan = normalizePlanId(planId);
  const checker = FEATURE_TO_CAPABILITY_MAP[featureKey];
  if (!checker) {
    return false;
  }
  return checker(SUBSCRIPTION_PLAN_CAPABILITIES[normalizedPlan]);
}

export function getMaxTanks(planId: PlanId): number | null {
  return getCapability(planId, 'maxTanks');
}

export function canCreateTank(planId: PlanId, currentTankCount: number): boolean {
  const maxTanks = getMaxTanks(planId);
  if (maxTanks === null) {
    return true;
  }
  return Number(currentTankCount) < maxTanks;
}

export function isTankLockedByPlan(planId: PlanId, tankIndex: number): boolean {
  const maxTanks = getMaxTanks(planId);
  if (maxTanks === null) {
    return false;
  }
  if (!Number.isFinite(Number(tankIndex)) || Number(tankIndex) < 0) {
    return true;
  }
  return Number(tankIndex) >= maxTanks;
}

export function getAllowedMeasurementKeys(
  input: SubscriptionState | PlanId
): SubscriptionMeasurementParameterKey[] {
  const planId =
    typeof input === 'string'
      ? normalizePlanId(input)
      : normalizePlanId(input?.tier);
  const setKind = getCapability(planId, 'measurementSet');
  return setKind === 'basic' ? BASIC_MEASUREMENT_KEYS : FULL_MEASUREMENT_KEYS;
}

function getMeasurementTimestampMs(value: unknown): number {
  if (!value) {
    return 0;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof (value as { toMillis?: unknown })?.toMillis === 'function') {
    return Number((value as { toMillis: () => number }).toMillis()) || 0;
  }
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function canViewMeasurementHistoryItem(
  planId: PlanId,
  measurementDate: unknown
): boolean {
  const historyDays = getCapability(planId, 'historyDays');
  if (historyDays === null) {
    return true;
  }

  const measurementMs = getMeasurementTimestampMs(measurementDate);
  if (!measurementMs) {
    return false;
  }

  const nowMs = Date.now();
  const ageMs = nowMs - measurementMs;
  const dayMs = 24 * 60 * 60 * 1000;
  return ageMs <= historyDays * dayMs;
}

export function getUpgradeTargetForFeature(
  featureKey: SubscriptionFeatureKey
): PlanId {
  switch (featureKey) {
    case 'smart_action_plan':
    case 'ai_assistant':
      return 'pro';
    default:
      return 'premium';
  }
}

export function getFeatureLockMessage(
  featureKey: SubscriptionFeatureKey,
  currentPlan: PlanId
): string {
  const requiredPlan = getUpgradeTargetForFeature(featureKey);
  if (normalizePlanId(currentPlan) === requiredPlan) {
    return '';
  }

  const messages: Record<SubscriptionFeatureKey, string> = {
    core_access: '',
    critical_alerts: '',
    full_measurements: 'Pełny zestaw parametrów jest dostępny w Premium.',
    stocking_compatibility:
      'Zaawansowana analiza obsady jest dostepna w Premium.',
    smart_action_plan: 'Plan działania krok po kroku jest dostępny w Pro.',
    full_history:
      'W planie Free widoczna jest historia z ostatnich 30 dni. Pełna historia jest dostepna w Premium.',
    multiple_tanks: 'Osiagnieto limit akwariów w obecnym planie.',
    advanced_water_analysis: 'Pełna analiza parametrów jest dostepna w Premium.',
    trend_analysis: 'Analiza trendow jest dostepna od planu Premium.',
    equipment_analysis: 'Pełna analiza sprzetu jest dostepna od planu Premium.',
    algae_diagnosis: 'Diagnoza glonow jest dostepna od planu Premium.',
    fish_disease_diagnosis: 'Diagnoza chorób ryb jest dostepna od planu Premium.',
    plant_disease_diagnosis:
      'Diagnoza chorób roslin jest dostepna od planu Premium.',
    automatic_tasks: 'Automatyczne zadania sa dostępne od planu Premium.',
    ai_assistant: 'Asystent AI jest dostępny w planie Pro.',
    export_data: 'Eksport danych jest dostępny od planu Premium.',
  };

  return messages[featureKey] || `Ta funkcja jest dostepna od planu ${getPlanLabel(requiredPlan)}.`;
}

export function getLockedMeasurementFields(planId: PlanId): SubscriptionMeasurementParameterKey[] {
  const allowed = new Set(getAllowedMeasurementKeys(planId));
  return ALL_MEASUREMENT_KEYS.filter((key) => !allowed.has(key));
}

export function filterMeasurementFieldsByPlan<T extends Record<string, unknown>>(
  measurement: T,
  planId: PlanId
): Partial<T> {
  if (!measurement || typeof measurement !== 'object') {
    return {};
  }

  const allowed = new Set(getAllowedMeasurementKeys(planId));
  const alwaysVisibleFields = new Set([
    'id',
    'userId',
    'tankId',
    'tankName',
    'note',
    'measuredAt',
    'createdAt',
    'updatedAt',
  ]);

  return Object.entries(measurement).reduce((acc, [key, value]) => {
    if (alwaysVisibleFields.has(key) || allowed.has(key as SubscriptionMeasurementParameterKey)) {
      (acc as Record<string, unknown>)[key] = value;
    }
    return acc;
  }, {} as Partial<T>);
}

export function filterMeasurementsByPlan<T extends Record<string, unknown>>(
  measurements: T[],
  planId: PlanId
): T[] {
  if (!Array.isArray(measurements)) {
    return [];
  }

  const normalizedPlan = normalizePlanId(planId);
  return measurements
    .filter((item) =>
      canViewMeasurementHistoryItem(
        normalizedPlan,
        (item as Record<string, unknown>)?.measuredAt ??
          (item as Record<string, unknown>)?.createdAt
      )
    )
    .map((item) => filterMeasurementFieldsByPlan(item, normalizedPlan) as T);
}

export function getAccessibleTanksForPlan<T>(tanks: T[], planId: PlanId): T[] {
  if (!Array.isArray(tanks)) {
    return [];
  }

  const maxTanks = getMaxTanks(planId);
  if (maxTanks === null) {
    return [...tanks];
  }

  return tanks.slice(0, Math.max(0, maxTanks));
}

export function getLockedTanksForPlan<T>(tanks: T[], planId: PlanId): T[] {
  if (!Array.isArray(tanks)) {
    return [];
  }

  const maxTanks = getMaxTanks(planId);
  if (maxTanks === null) {
    return [];
  }

  return tanks.slice(Math.max(0, maxTanks));
}

export function listSubscriptionPlans(): SubscriptionPlanDefinition[] {
  return Object.values(SUBSCRIPTION_PLANS).sort((a, b) => a.rank - b.rank);
}

export function listSubscriptionCapabilityRows(): SubscriptionCapabilityRow[] {
  return SUBSCRIPTION_CAPABILITY_ROWS;
}

export function getSubscriptionPlanDefinition(
  tier: SubscriptionTier
): SubscriptionPlanDefinition {
  return SUBSCRIPTION_PLANS[normalizePlanId(tier)];
}

export function getSubscriptionEntitlements(
  state: SubscriptionState
): SubscriptionEntitlements {
  const normalizedState = normalizeSubscriptionState(state);
  return getSubscriptionPlanDefinition(normalizedState.tier).entitlements;
}

export function isSubscriptionActive(state: SubscriptionState): boolean {
  const normalizedState = normalizeSubscriptionState(state);
  return (
    normalizedState.status === 'active' ||
    normalizedState.status === 'grace_period'
  );
}

export function hasSubscriptionFeature(
  state: SubscriptionState,
  featureKey: SubscriptionFeatureKey
): boolean {
  const normalizedState = normalizeSubscriptionState(state);
  if (normalizedState.featureOverrides.includes(featureKey)) {
    return true;
  }

  return canUseFeature(normalizedState.tier, featureKey);
}

export function getSubscriptionLimitValue(
  state: SubscriptionState,
  limitKey: SubscriptionLimitKey
): number | null {
  const normalizedState = normalizeSubscriptionState(state);
  const overrideValue = normalizedState.limitOverrides?.[limitKey];

  if (overrideValue !== undefined) {
    return overrideValue ?? null;
  }

  const plan = getSubscriptionPlanDefinition(normalizedState.tier);
  if (limitKey === 'maxSavedMeasurementsPerTank') {
    return plan.limits.historyDays ?? plan.limits.maxSavedMeasurementsPerTank ?? null;
  }

  return plan.limits?.[limitKey] ?? null;
}

export function canAccessMeasurementKey(
  state: SubscriptionState,
  key: SubscriptionMeasurementParameterKey
): boolean {
  return getAllowedMeasurementKeys(normalizeSubscriptionState(state)).includes(key);
}

export function getSubscriptionStoreProductId(
  tier: SubscriptionTier,
  platform: SubscriptionStorePlatform
): string | null {
  return SUBSCRIPTION_STORE_PRODUCT_MAP[normalizePlanId(tier)]?.[platform] ?? null;
}

export function hasSubscriptionStoreProductId(
  tier: SubscriptionTier,
  platform: SubscriptionStorePlatform
): boolean {
  return Boolean(getSubscriptionStoreProductId(tier, platform));
}

export function getSubscriptionTierByStoreProductId(
  productId: unknown
): SubscriptionTier | null {
  const normalizedProductId = String(productId ?? '').trim().toLowerCase();
  if (!normalizedProductId) {
    return null;
  }

  const tiers = Object.keys(SUBSCRIPTION_STORE_PRODUCT_MAP) as SubscriptionTier[];
  for (const tier of tiers) {
    const mapEntry = SUBSCRIPTION_STORE_PRODUCT_MAP[tier];
    if (!mapEntry) {
      continue;
    }

    const iosId = String(mapEntry.ios ?? '').trim().toLowerCase();
    const androidId = String(mapEntry.android ?? '').trim().toLowerCase();
    const iosBaseId = iosId.split(':')[0] ?? '';
    const androidBaseId = androidId.split(':')[0] ?? '';
    const normalizedBaseId = normalizedProductId.split(':')[0] ?? '';
    if (
      (iosId && iosId === normalizedProductId) ||
      (androidId && androidId === normalizedProductId) ||
      (iosBaseId && iosBaseId === normalizedBaseId) ||
      (androidBaseId && androidBaseId === normalizedBaseId)
    ) {
      return tier;
    }
  }

  return null;
}
