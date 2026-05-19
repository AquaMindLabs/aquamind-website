#!/usr/bin/env node

const {
  buildProductTierMapFromEnv,
} = require('./subscription-webhook-sync.cjs');

function toSafeString(value) {
  return String(value ?? '').trim();
}

function readBillingEnv() {
  return {
    entitlementId: toSafeString(process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID),
    iosApiKey: toSafeString(process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY),
    androidApiKey: toSafeString(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY),
    premiumIos: toSafeString(process.env.EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_IOS_PRODUCT_ID),
    premiumAndroid: toSafeString(process.env.EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_ANDROID_PRODUCT_ID),
    proIos: toSafeString(process.env.EXPO_PUBLIC_SUBSCRIPTION_PRO_IOS_PRODUCT_ID),
    proAndroid: toSafeString(process.env.EXPO_PUBLIC_SUBSCRIPTION_PRO_ANDROID_PRODUCT_ID),
  };
}

function summarize() {
  const env = readBillingEnv();
  const productTierMap = buildProductTierMapFromEnv(process.env);
  const missing = [];

  if (!env.entitlementId) {
    missing.push('EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID');
  }
  if (!env.iosApiKey) {
    missing.push('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY');
  }
  if (!env.androidApiKey) {
    missing.push('EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY');
  }
  if (!env.premiumIos) {
    missing.push('EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_IOS_PRODUCT_ID');
  }
  if (!env.premiumAndroid) {
    missing.push('EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_ANDROID_PRODUCT_ID');
  }
  if (!env.proIos) {
    missing.push('EXPO_PUBLIC_SUBSCRIPTION_PRO_IOS_PRODUCT_ID');
  }
  if (!env.proAndroid) {
    missing.push('EXPO_PUBLIC_SUBSCRIPTION_PRO_ANDROID_PRODUCT_ID');
  }

  const productIds = Object.keys(productTierMap);
  const hasDuplicateIds =
    new Set(
      [
        env.premiumIos.toLowerCase(),
        env.premiumAndroid.toLowerCase(),
        env.proIos.toLowerCase(),
        env.proAndroid.toLowerCase(),
      ].filter(Boolean)
    ).size !==
    [
      env.premiumIos,
      env.premiumAndroid,
      env.proIos,
      env.proAndroid,
    ].filter(Boolean).length;

  const lines = [
    '# Billing Sandbox Audit',
    '',
    `entitlementConfigured: ${env.entitlementId ? 'yes' : 'no'}`,
    `iosApiKeyConfigured: ${env.iosApiKey ? 'yes' : 'no'}`,
    `androidApiKeyConfigured: ${env.androidApiKey ? 'yes' : 'no'}`,
    `productIdsConfiguredCount: ${productIds.length}`,
    `duplicateProductIdsDetected: ${hasDuplicateIds ? 'yes' : 'no'}`,
    '',
    'productId -> tier map (from env):',
    productIds.length > 0
      ? productIds.map((productId) => `- ${productId} => ${productTierMap[productId]}`).join('\n')
      : '- brak',
    '',
    'missing required vars:',
    missing.length > 0 ? missing.map((item) => `- ${item}`).join('\n') : '- brak',
    '',
    'next steps:',
    '- Zweryfikuj, ze te same product IDs sa skonfigurowane w Google Play, App Store i RevenueCat.',
    '- Zweryfikuj, ze entitlement ID odpowiada temu, co jest aktywne w RevenueCat.',
    '- Uruchom webhook i testy: npm run test:subscription:webhook.',
  ];

  process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = missing.length > 0 || hasDuplicateIds ? 1 : 0;
}

summarize();
