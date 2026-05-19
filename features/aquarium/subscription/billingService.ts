import { Platform } from 'react-native';
import {
  getSubscriptionTierByStoreProductId,
  normalizePlanId,
  type SubscriptionSource,
  type SubscriptionState,
  type SubscriptionTier,
} from '@/features/aquarium/subscription/subscriptionModel';

type EntitlementInfoLike = {
  billingIssueDetectedAt?: string | null;
  billingIssueDetectedAtMillis?: number | null;
  expirationDate?: string | null;
  expirationDateMillis?: number | null;
  isActive?: boolean;
  isSandbox?: boolean;
  latestPurchaseDate?: string | null;
  latestPurchaseDateMillis?: number | null;
  originalPurchaseDate?: string | null;
  originalPurchaseDateMillis?: number | null;
  productIdentifier?: string;
  store?: string;
  unsubscribeDetectedAt?: string | null;
  unsubscribeDetectedAtMillis?: number | null;
  willRenew?: boolean;
};

type CustomerInfoLike = {
  entitlements?: {
    active?: Record<string, EntitlementInfoLike>;
    all?: Record<string, EntitlementInfoLike>;
  };
  activeSubscriptions?: string[];
  managementURL?: string | null;
};

type OfferingPackageLike = {
  identifier?: string;
  product?: {
    identifier?: string;
    productIdentifier?: string;
    priceString?: string;
    localizedPriceString?: string;
    price?: string;
  };
};

type OfferingsLike = {
  all?: Record<
    string,
    {
      identifier?: string;
      availablePackages?: OfferingPackageLike[];
    }
  >;
};

export type BillingOfferingEntry = {
  offeringId: string;
  packageId: string;
  productId: string;
  tier: SubscriptionTier | null;
  priceLabel: string | null;
};

export type BillingSyncResult = {
  patch: Partial<SubscriptionState>;
  resolvedTier: SubscriptionTier;
  resolvedStatus: SubscriptionState['status'];
  source: SubscriptionSource;
  productId: string | null;
  managementUrl: string | null;
  isSandbox: boolean;
};

export type BillingOfferingsSnapshot = {
  entries: BillingOfferingEntry[];
  productIds: string[];
  productPriceById: Record<string, string>;
};

const RETRYABLE_PURCHASE_CODES = new Set([
  'network_error',
  'offline_connection_error',
  'store_problem_error',
  'product_request_timed_out_error',
  'unknown_backend_error',
  'unexpected_backend_response_error',
  'api_endpoint_blocked',
  'customer_info_error',
]);

let initializedApiKey: string | null = null;
let initializedUserId: string | null = null;
let initialized = false;
let purchasesModuleCache: PurchasesModuleLike | null | undefined;

type PurchasesModuleLike = {
  LOG_LEVEL?: {
    DEBUG?: unknown;
    INFO?: unknown;
  };
  setLogLevel?: (level: unknown) => Promise<void> | void;
  configure?: (config: Record<string, unknown>) => Promise<void> | void;
  logIn?: (appUserId: string) => Promise<void> | void;
  logOut?: () => Promise<void> | void;
  getCustomerInfo?: () => Promise<CustomerInfoLike>;
  getOfferings?: () => Promise<OfferingsLike>;
  purchaseProduct?: (
    productId: string
  ) => Promise<{ customerInfo?: CustomerInfoLike }>;
  purchasePackage?: (
    packageToPurchase: OfferingPackageLike
  ) => Promise<{ customerInfo?: CustomerInfoLike }>;
  restorePurchases?: () => Promise<CustomerInfoLike>;
  addCustomerInfoUpdateListener?: (
    listener: (customerInfo: CustomerInfoLike) => void
  ) => void;
  removeCustomerInfoUpdateListener?: (
    listener: (customerInfo: CustomerInfoLike) => void
  ) => void;
};

function getPurchasesModule(): PurchasesModuleLike | null {
  if (purchasesModuleCache !== undefined) {
    return purchasesModuleCache;
  }

  try {
    const loaded = require('react-native-purchases') as {
      default?: PurchasesModuleLike;
    };
    purchasesModuleCache = loaded?.default ?? (loaded as PurchasesModuleLike);
  } catch {
    purchasesModuleCache = null;
  }

  return purchasesModuleCache;
}

function toIsoOrNull(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return null;
  }
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function toMillis(value: unknown): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  const parsed = new Date(String(value ?? '')).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStoreToSource(store: unknown): SubscriptionSource {
  const normalized = String(store ?? '').trim().toUpperCase();
  if (normalized === 'PLAY_STORE') {
    return 'play_store';
  }
  if (normalized === 'APP_STORE' || normalized === 'MAC_APP_STORE') {
    return 'app_store';
  }
  if (normalized === 'STRIPE' || normalized === 'RC_BILLING') {
    return 'stripe';
  }
  if (normalized === 'PROMOTIONAL') {
    return 'promo';
  }
  return 'system';
}

function getRevenueCatApiKeyForPlatform(): string | null {
  if (Platform.OS === 'ios') {
    const value = String(process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '').trim();
    return value || null;
  }
  if (Platform.OS === 'android') {
    const value = String(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '').trim();
    return value || null;
  }
  return null;
}

function getPreferredEntitlementId(): string | null {
  const value = String(process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? '').trim();
  return value || null;
}

function getErrorCode(error: unknown): string {
  return String(
    (error as { code?: unknown; purchasesErrorCode?: unknown })?.code ??
      (error as { code?: unknown; purchasesErrorCode?: unknown })?.purchasesErrorCode ??
      ''
  )
    .trim()
    .toLowerCase();
}

function getErrorMessage(error: unknown): string {
  return String((error as { message?: unknown })?.message ?? '')
    .trim()
    .toLowerCase();
}

function isUserCancelledError(error: unknown): boolean {
  if ((error as { userCancelled?: unknown })?.userCancelled === true) {
    return true;
  }
  return getErrorCode(error) === 'purchase_cancelled_error';
}

function isRetryableError(error: unknown): boolean {
  const code = getErrorCode(error);
  return RETRYABLE_PURCHASE_CODES.has(code);
}

async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 2
): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !isRetryableError(error)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }

  throw lastError;
}

function pickEntitlement(customerInfo: CustomerInfoLike): EntitlementInfoLike | null {
  const entitlements = customerInfo?.entitlements;
  const activeEntitlements =
    entitlements?.active && typeof entitlements.active === 'object'
      ? entitlements.active
      : {};
  const allEntitlements =
    entitlements?.all && typeof entitlements.all === 'object'
      ? entitlements.all
      : {};

  const preferredEntitlementId = getPreferredEntitlementId();
  if (preferredEntitlementId && allEntitlements[preferredEntitlementId]) {
    return allEntitlements[preferredEntitlementId] ?? null;
  }

  const activeEntries = Object.values(activeEntitlements);
  if (activeEntries.length > 0) {
    const paidEntries = activeEntries.filter((entry) =>
      Boolean(getSubscriptionTierByStoreProductId(entry?.productIdentifier))
    );
    return (paidEntries[0] ?? activeEntries[0]) ?? null;
  }

  const allEntries = Object.values(allEntitlements).sort(
    (left, right) =>
      toMillis(right?.latestPurchaseDateMillis ?? right?.latestPurchaseDate) -
      toMillis(left?.latestPurchaseDateMillis ?? left?.latestPurchaseDate)
  );
  return allEntries[0] ?? null;
}

function extractBillingOfferingEntries(offerings: OfferingsLike): BillingOfferingEntry[] {
  const allOfferings =
    offerings?.all && typeof offerings.all === 'object' ? offerings.all : {};
  const entries: BillingOfferingEntry[] = [];

  Object.entries(allOfferings).forEach(([offeringKey, offeringValue]) => {
    const offeringId = String(
      offeringValue?.identifier ?? offeringKey ?? ''
    ).trim();
    const availablePackages = Array.isArray(offeringValue?.availablePackages)
      ? offeringValue.availablePackages
      : [];

    availablePackages.forEach((pkg) => {
      const packageId = String(pkg?.identifier ?? '').trim();
      const productId = String(
        pkg?.product?.identifier ?? pkg?.product?.productIdentifier ?? ''
      ).trim();
      if (!productId) {
        return;
      }
      const priceLabel = String(
        pkg?.product?.priceString ??
          pkg?.product?.localizedPriceString ??
          pkg?.product?.price ??
          ''
      ).trim();
      entries.push({
        offeringId: offeringId || 'default',
        packageId: packageId || 'unknown',
        productId,
        tier: getSubscriptionTierByStoreProductId(productId),
        priceLabel: priceLabel || null,
      });
    });
  });

  return entries;
}

function normalizeProductId(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function getBaseProductId(value: unknown): string {
  return normalizeProductId(value).split(':')[0] ?? '';
}

function productIdsMatch(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeProductId(left);
  const normalizedRight = normalizeProductId(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return normalizedLeft === normalizedRight || getBaseProductId(left) === getBaseProductId(right);
}

function findOfferingPackageByProductId(
  offerings: OfferingsLike,
  productId: string
): OfferingPackageLike | null {
  const allOfferings =
    offerings?.all && typeof offerings.all === 'object' ? offerings.all : {};

  for (const offering of Object.values(allOfferings)) {
    const availablePackages = Array.isArray(offering?.availablePackages)
      ? offering.availablePackages
      : [];
    const matchingPackage = availablePackages.find((pkg) =>
      productIdsMatch(
        pkg?.product?.identifier ?? pkg?.product?.productIdentifier,
        productId
      )
    );
    if (matchingPackage) {
      return matchingPackage;
    }
  }

  return null;
}

function resolveTierFromCustomerInfo(
  customerInfo: CustomerInfoLike,
  entitlement: EntitlementInfoLike | null
): SubscriptionTier {
  const fromEntitlement = getSubscriptionTierByStoreProductId(
    entitlement?.productIdentifier
  );
  if (fromEntitlement) {
    return normalizePlanId(fromEntitlement);
  }

  const activeSubscriptions = Array.isArray(customerInfo?.activeSubscriptions)
    ? customerInfo.activeSubscriptions
    : [];
  const fromActive = activeSubscriptions
    .map((productId) => getSubscriptionTierByStoreProductId(productId))
    .filter(Boolean)[0];
  if (fromActive) {
    return normalizePlanId(fromActive);
  }

  return 'free';
}

function resolveStatusFromEntitlement(
  entitlement: EntitlementInfoLike | null
): SubscriptionState['status'] {
  if (!entitlement) {
    return 'inactive';
  }

  if (entitlement.isActive) {
    if (entitlement.billingIssueDetectedAt || entitlement.billingIssueDetectedAtMillis) {
      return 'grace_period';
    }
    if (
      entitlement.unsubscribeDetectedAt ||
      entitlement.unsubscribeDetectedAtMillis ||
      entitlement.willRenew === false
    ) {
      return 'cancelled';
    }
    return 'active';
  }

  if (entitlement.willRenew === true) {
    return 'paused';
  }

  return 'expired';
}

export function isBillingEnabledForCurrentPlatform(): boolean {
  const apiKey = getRevenueCatApiKeyForPlatform();
  return Boolean(apiKey) && (Platform.OS === 'ios' || Platform.OS === 'android');
}

export function mapBillingErrorToUserMessage(
  error: unknown,
  action: 'purchase' | 'restore' | 'refresh'
): string {
  if (isUserCancelledError(error)) {
    return action === 'restore'
      ? 'Przywracanie zostało anulowane.'
      : 'Zakup został anulowany.';
  }

  const code = getErrorCode(error);
  const message = getErrorMessage(error);
  if (message.includes('billing_sdk_unavailable')) {
    return 'Modul zakupow nie jest jeszcze zainstalowany w tej wersji aplikacji.';
  }
  if (message.includes('billing_not_configured')) {
    return 'Zakupy nie sa jeszcze skonfigurowane dla tej platformy.';
  }
  if (code === 'payment_pending_error') {
    return 'Platnosc oczekuje na potwierdzenie. Sprawdz status za chwile.';
  }
  if (code === 'purchase_not_allowed_error' || code === 'insufficient_permissions_error') {
    return 'Zakupy sa niedostepne dla tego konta. Sprawdz ustawieńia sklepu.';
  }
  if (code === 'product_not_available_for_purchase_error') {
    return 'Ten plan nie jest aktualnie dostepny w sklepie dla tej wersji aplikacji.';
  }
  if (code === 'network_error' || code === 'offline_connection_error') {
    return 'Brak połączenia z internetem. Spróbuj ponownie.';
  }
  if (code === 'store_problem_error') {
    return 'Sklep chwilowo nie odpowiada. Spróbuj ponownie za kilka minut.';
  }
  if (action === 'restore') {
    return 'Nie udalo sie przywróic zakupow. Spróbuj ponownie za chwile.';
  }
  if (action === 'refresh') {
    return 'Nie udalo sie odświeżyc statusu subskrypcji.';
  }
  return 'Nie udalo sie dokonac zakupu. Spróbuj ponownie za chwile.';
}

export async function ensureBillingConfigured(
  appUserId: string | null
): Promise<void> {
  const apiKey = getRevenueCatApiKeyForPlatform();
  if (!apiKey) {
    throw new Error('billing_not_configured');
  }
  const purchases = getPurchasesModule();
  if (!purchases) {
    throw new Error('billing_sdk_unavailable');
  }

  if (typeof purchases.setLogLevel === 'function') {
    if (__DEV__) {
      await purchases.setLogLevel(purchases.LOG_LEVEL?.DEBUG ?? 'DEBUG');
    } else {
      await purchases.setLogLevel(purchases.LOG_LEVEL?.INFO ?? 'INFO');
    }
  }

  if (!initialized) {
    await purchases.configure?.({
      apiKey,
      appUserID: appUserId ?? undefined,
    });
    initialized = true;
    initializedApiKey = apiKey;
    initializedUserId = appUserId;
    return;
  }

  if (initializedApiKey !== apiKey) {
    initialized = false;
    initializedApiKey = null;
    initializedUserId = null;
    await purchases.configure?.({
      apiKey,
      appUserID: appUserId ?? undefined,
    });
    initialized = true;
    initializedApiKey = apiKey;
    initializedUserId = appUserId;
    return;
  }

  if (appUserId && initializedUserId !== appUserId) {
    await purchases.logIn?.(appUserId);
    initializedUserId = appUserId;
    return;
  }

  if (!appUserId && initializedUserId) {
    await purchases.logOut?.();
    initializedUserId = null;
  }
}

export function buildSubscriptionPatchFromCustomerInfo(
  customerInfo: CustomerInfoLike
): BillingSyncResult {
  const entitlement = pickEntitlement(customerInfo);
  const resolvedTier = resolveTierFromCustomerInfo(customerInfo, entitlement);
  const rawResolvedStatus = resolveStatusFromEntitlement(entitlement);
  const resolvedStatus =
    resolvedTier === 'free' ? 'active' : rawResolvedStatus;
  const source =
    resolvedTier === 'free'
      ? 'system'
      : normalizeStoreToSource(entitlement?.store);
  const startedAt = toIsoOrNull(
    entitlement?.originalPurchaseDate ?? entitlement?.latestPurchaseDate
  );
  const expiresAt = toIsoOrNull(entitlement?.expirationDate);
  const renewsAt = entitlement?.willRenew ? expiresAt : null;
  const nowIso = new Date().toISOString();

  return {
    patch: {
      tier: resolvedTier,
      status: resolvedStatus,
      source,
      startedAt,
      expiresAt,
      renewsAt,
      lastValidatedAt: nowIso,
    },
    resolvedTier,
    resolvedStatus,
    source,
    productId: String(entitlement?.productIdentifier ?? '').trim() || null,
    managementUrl: String(customerInfo?.managementURL ?? '').trim() || null,
    isSandbox: Boolean(entitlement?.isSandbox),
  };
}

export async function getBillingOfferingsSnapshot(
  appUserId: string | null
): Promise<BillingOfferingsSnapshot> {
  await ensureBillingConfigured(appUserId);
  const purchases = getPurchasesModule();
  const getOfferings = purchases?.getOfferings;

  if (!getOfferings) {
    return {
      entries: [],
      productIds: [],
      productPriceById: {},
    };
  }

  const offerings = await withRetry(
    () => getOfferings() as Promise<OfferingsLike>,
    1
  );
  const entries = extractBillingOfferingEntries(offerings);
  const uniqueProductIds = Array.from(
    new Set(
      entries
        .map((item) => String(item.productId ?? '').trim())
        .filter(Boolean)
    )
  );
  const productPriceById = entries.reduce<Record<string, string>>((acc, entry) => {
    const productId = String(entry?.productId ?? '').trim();
    const priceLabel = String(entry?.priceLabel ?? '').trim();
    if (productId && priceLabel && !acc[productId]) {
      acc[productId] = priceLabel;
    }
    return acc;
  }, {});

  return {
    entries,
    productIds: uniqueProductIds,
    productPriceById,
  };
}

export async function refreshBillingCustomerInfo(
  appUserId: string | null
): Promise<BillingSyncResult> {
  await ensureBillingConfigured(appUserId);
  const purchases = getPurchasesModule();
  const getCustomerInfo = purchases?.getCustomerInfo;
  if (!getCustomerInfo) {
    throw new Error('billing_sdk_unavailable');
  }
  const customerInfo = await withRetry(
    () => getCustomerInfo() as Promise<CustomerInfoLike>,
    2
  );
  return buildSubscriptionPatchFromCustomerInfo(customerInfo);
}

export async function purchaseSubscriptionByProductId(
  appUserId: string | null,
  productId: string
): Promise<BillingSyncResult> {
  const normalizedProductId = String(productId ?? '').trim();
  if (!normalizedProductId) {
    throw new Error('product_not_available_for_purchase_error');
  }

  await ensureBillingConfigured(appUserId);
  const purchases = getPurchasesModule();
  const purchasePackage = purchases?.purchasePackage;
  const purchaseProduct = purchases?.purchaseProduct;
  const getCustomerInfo = purchases?.getCustomerInfo;
  const getOfferings = purchases?.getOfferings;
  if ((!purchasePackage && !purchaseProduct) || !getCustomerInfo) {
    throw new Error('billing_sdk_unavailable');
  }

  let matchingPackage: OfferingPackageLike | null = null;
  if (getOfferings) {
    const offerings = await withRetry(
      () => getOfferings() as Promise<OfferingsLike>,
      1
    );
    const entries = extractBillingOfferingEntries(offerings);
    const offeringHasProducts = entries.length > 0;
    const productIsOffered = entries.some((entry) =>
      productIdsMatch(entry?.productId, normalizedProductId)
    );
    if (offeringHasProducts && !productIsOffered) {
      throw new Error('product_not_available_for_purchase_error');
    }
    matchingPackage = findOfferingPackageByProductId(offerings, normalizedProductId);
  }

  const purchaseResult =
    matchingPackage && purchasePackage
      ? await withRetry(() => purchasePackage(matchingPackage as OfferingPackageLike), 1)
      : await withRetry(() => purchaseProduct?.(normalizedProductId), 1);
  const customerInfo =
    (purchaseResult as { customerInfo?: CustomerInfoLike })?.customerInfo ??
    (await getCustomerInfo());
  return buildSubscriptionPatchFromCustomerInfo(customerInfo as CustomerInfoLike);
}

export async function restoreBillingPurchases(
  appUserId: string | null
): Promise<BillingSyncResult> {
  await ensureBillingConfigured(appUserId);
  const purchases = getPurchasesModule();
  const restorePurchases = purchases?.restorePurchases;
  if (!restorePurchases) {
    throw new Error('billing_sdk_unavailable');
  }
  const customerInfo = await withRetry(
    () => restorePurchases() as Promise<CustomerInfoLike>,
    1
  );
  return buildSubscriptionPatchFromCustomerInfo(customerInfo);
}

export function addBillingCustomerInfoListener(
  listener: (result: BillingSyncResult) => void
): () => void {
  const purchases = getPurchasesModule();
  if (
    !purchases?.addCustomerInfoUpdateListener ||
    !purchases?.removeCustomerInfoUpdateListener
  ) {
    return () => null;
  }

  const wrapped = (customerInfo: CustomerInfoLike) => {
    try {
      const safeCustomerInfo =
        customerInfo && typeof customerInfo === 'object' ? customerInfo : {};
      listener(buildSubscriptionPatchFromCustomerInfo(safeCustomerInfo));
    } catch {
      // Ignore malformed SDK payloads to avoid crashing auth flow.
    }
  };
  try {
    purchases.addCustomerInfoUpdateListener(wrapped);
  } catch {
    return () => null;
  }

  return () => {
    try {
      purchases.removeCustomerInfoUpdateListener?.(wrapped);
    } catch {
      // Ignore listener cleanup errors.
    }
  };
}
