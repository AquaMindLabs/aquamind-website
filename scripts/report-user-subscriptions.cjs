#!/usr/bin/env node
/* eslint-disable no-console */
const admin = require('firebase-admin');

const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'my-aquarium-assistant';

function toIsoOrEmpty(value) {
  if (!value) {
    return '';
  }
  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString();
  }
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

function normalizeTier(value) {
  const tier = String(value ?? '').trim().toLowerCase();
  if (tier === 'premium' || tier === 'plus') {
    return 'premium';
  }
  if (tier === 'pro' || tier === 'ai_pro') {
    return 'pro';
  }
  return 'free';
}

function normalizeStatus(value) {
  return String(value ?? '').trim().toLowerCase() || 'unknown';
}

function isPaidActiveLike(tier, status) {
  return (
    (tier === 'premium' || tier === 'pro') &&
    (status === 'active' || status === 'grace_period' || status === 'cancelled')
  );
}

function formatRow(row) {
  return [
    row.uid,
    row.tierLabel,
    row.status,
    row.source,
    row.expiresAt || '-',
    row.renewsAt || '-',
    row.lastValidatedAt || '-',
    row.paidAccess ? 'TAK' : 'NIE',
  ].join('\t');
}

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'Ustaw GOOGLE_APPLICATION_CREDENTIALS na sciezke do pliku JSON konta serwisowego Firebase.'
    );
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
  });

  const db = admin.firestore();
  const snapshot = await db.collection('userSubscriptions').get();

  const rows = snapshot.docs
    .map((doc) => {
      const data = doc.data() || {};
      const tier = normalizeTier(data.tier);
      const status = normalizeStatus(data.status);
      return {
        uid: doc.id,
        tier,
        tierLabel: tier === 'premium' ? 'Plus' : tier === 'pro' ? 'AI Pro' : 'Free',
        status,
        source: String(data.source ?? '').trim() || 'unknown',
        expiresAt: toIsoOrEmpty(data.expiresAt),
        renewsAt: toIsoOrEmpty(data.renewsAt),
        lastValidatedAt: toIsoOrEmpty(data.lastValidatedAt),
        paidAccess: isPaidActiveLike(tier, status),
      };
    })
    .sort((left, right) => {
      const paidRank = Number(right.paidAccess) - Number(left.paidAccess);
      if (paidRank !== 0) {
        return paidRank;
      }
      return left.uid.localeCompare(right.uid);
    });

  const summary = rows.reduce(
    (acc, row) => {
      acc.total += 1;
      acc[row.tier] += 1;
      if (row.paidAccess) {
        acc.paidAccess += 1;
      }
      return acc;
    },
    { total: 0, free: 0, premium: 0, pro: 0, paidAccess: 0 }
  );

  console.log('Raport userSubscriptions');
  console.log(`Projekt: ${PROJECT_ID}`);
  console.log(
    `Razem: ${summary.total}, Free: ${summary.free}, Plus: ${summary.premium}, AI Pro: ${summary.pro}, platny dostep aktywny/grace/cancelled: ${summary.paidAccess}`
  );
  console.log('');
  console.log(
    [
      'uid',
      'plan',
      'status',
      'source',
      'expiresAt',
      'renewsAt',
      'lastValidatedAt',
      'paidAccess',
    ].join('\t')
  );
  rows.forEach((row) => console.log(formatRow(row)));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
