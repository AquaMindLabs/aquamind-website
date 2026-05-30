#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const {
  buildProductTierMapFromEnv,
} = require('./subscription-webhook-sync.cjs');

function loadLocalEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return false;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) {
      continue;
    }
    const separatorIndex = line.indexOf('=');
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return true;
}

function toSafeString(value) {
  return String(value ?? '').trim();
}

function firstNonEmpty(...values) {
  return values.map(toSafeString).find(Boolean) ?? '';
}

function readBillingEnv() {
  const premiumAndroid = firstNonEmpty(
    process.env.EXPO_PUBLIC_SUBSCRIPTION_PLUS_ANDROID_PRODUCT_ID,
    process.env.EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_ANDROID_PRODUCT_ID
  );
  const proAndroid = firstNonEmpty(
    process.env.EXPO_PUBLIC_SUBSCRIPTION_AI_PRO_ANDROID_PRODUCT_ID,
    process.env.EXPO_PUBLIC_SUBSCRIPTION_PRO_ANDROID_PRODUCT_ID
  );

  return {
    entitlementId: toSafeString(process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID),
    iosApiKey: toSafeString(process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY),
    androidApiKey: toSafeString(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY),
    premiumIos: toSafeString(process.env.EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_IOS_PRODUCT_ID),
    premiumAndroid,
    premiumAndroidAlias: toSafeString(process.env.EXPO_PUBLIC_SUBSCRIPTION_PLUS_ANDROID_PRODUCT_ID),
    premiumAndroidCanonical: toSafeString(process.env.EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_ANDROID_PRODUCT_ID),
    proIos: toSafeString(process.env.EXPO_PUBLIC_SUBSCRIPTION_PRO_IOS_PRODUCT_ID),
    proAndroid,
    proAndroidAlias: toSafeString(process.env.EXPO_PUBLIC_SUBSCRIPTION_AI_PRO_ANDROID_PRODUCT_ID),
    proAndroidCanonical: toSafeString(process.env.EXPO_PUBLIC_SUBSCRIPTION_PRO_ANDROID_PRODUCT_ID),
  };
}

function summarize() {
  const loadedLocalEnv = loadLocalEnvFile();
  const env = readBillingEnv();
  const productTierMap = buildProductTierMapFromEnv(process.env);
  const missingAndroidRelease = [];
  const warnings = [];
  const missingOptionalIos = [];

  if (!env.entitlementId) {
    warnings.push(
      'EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID nie jest ustawione; aplikacja uzyje aktywnego entitlementu z RevenueCat, ale zalecane jest wpisanie canonical entitlement ID.'
    );
  }
  if (!env.androidApiKey) {
    missingAndroidRelease.push('EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY');
  }
  if (!env.premiumAndroid) {
    missingAndroidRelease.push(
      'EXPO_PUBLIC_SUBSCRIPTION_PLUS_ANDROID_PRODUCT_ID lub EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_ANDROID_PRODUCT_ID'
    );
  }
  if (!env.proAndroid) {
    missingAndroidRelease.push(
      'EXPO_PUBLIC_SUBSCRIPTION_AI_PRO_ANDROID_PRODUCT_ID lub EXPO_PUBLIC_SUBSCRIPTION_PRO_ANDROID_PRODUCT_ID'
    );
  }

  if (!env.iosApiKey) {
    missingOptionalIos.push('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY');
  }
  if (!env.premiumIos) {
    missingOptionalIos.push('EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_IOS_PRODUCT_ID');
  }
  if (!env.proIos) {
    missingOptionalIos.push('EXPO_PUBLIC_SUBSCRIPTION_PRO_IOS_PRODUCT_ID');
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
    `loadedLocalEnvFile: ${loadedLocalEnv ? 'yes' : 'no'}`,
    `entitlementConfigured: ${env.entitlementId ? 'yes' : 'no'}`,
    `iosApiKeyConfigured: ${env.iosApiKey ? 'yes' : 'no'}`,
    `androidApiKeyConfigured: ${env.androidApiKey ? 'yes' : 'no'}`,
    `androidPremiumProductConfigured: ${env.premiumAndroid ? 'yes' : 'no'}`,
    `androidProProductConfigured: ${env.proAndroid ? 'yes' : 'no'}`,
    `productIdsConfiguredCount: ${productIds.length}`,
    `duplicateProductIdsDetected: ${hasDuplicateIds ? 'yes' : 'no'}`,
    '',
    'productId -> tier map (from env):',
    productIds.length > 0
      ? productIds.map((productId) => `- ${productId} => ${productTierMap[productId]}`).join('\n')
      : '- brak',
    '',
    'missing Android release vars:',
    missingAndroidRelease.length > 0
      ? missingAndroidRelease.map((item) => `- ${item}`).join('\n')
      : '- brak',
    '',
    'warnings:',
    warnings.length > 0 ? warnings.map((item) => `- ${item}`).join('\n') : '- brak',
    '',
    'missing optional iOS vars:',
    missingOptionalIos.length > 0
      ? missingOptionalIos.map((item) => `- ${item}`).join('\n')
      : '- brak',
    '',
    'next steps:',
    '- Zweryfikuj, ze te same product IDs sa skonfigurowane w Google Play, App Store i RevenueCat.',
    '- Zweryfikuj, ze entitlement ID odpowiada temu, co jest aktywne w RevenueCat.',
    '- Uruchom webhook i testy: npm run test:subscription:webhook.',
  ];

  process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = missingAndroidRelease.length > 0 || hasDuplicateIds ? 1 : 0;
}

summarize();
