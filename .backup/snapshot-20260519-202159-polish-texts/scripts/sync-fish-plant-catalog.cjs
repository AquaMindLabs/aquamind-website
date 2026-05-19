#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const admin = require('firebase-admin');

function normalizeLatinCatalogKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function buildFallbackId(prefix, latinName) {
  const slug = normalizeLatinCatalogKey(latinName)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${prefix}_${slug || 'unknown'}`;
}

function parseFlags(argv) {
  const flags = {
    dryRun: false,
    prune: false,
  };
  argv.forEach((arg) => {
    if (arg === '--dry-run') flags.dryRun = true;
    if (arg === '--prune') flags.prune = true;
  });
  return flags;
}

function assertEnv() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'Ustaw GOOGLE_APPLICATION_CREDENTIALS na sciezke do service account JSON.'
    );
  }
}

async function loadSeedCatalogs(repoRoot) {
  const fishUrl = pathToFileURL(path.join(repoRoot, 'data', 'fishCatalogStarter.js')).href;
  const plantUrl = pathToFileURL(path.join(repoRoot, 'data', 'plantCatalogStarter.js')).href;
  const fishModule = await import(fishUrl);
  const plantModule = await import(plantUrl);

  const fish = Array.isArray(fishModule.FISH_CATALOG_STARTER)
    ? fishModule.FISH_CATALOG_STARTER
    : [];
  const plants = Array.isArray(plantModule.PLANT_CATALOG_STARTER)
    ? plantModule.PLANT_CATALOG_STARTER
    : [];

  return { fish, plants };
}

function stripUndefinedFields(record) {
  const next = {};
  Object.entries(record ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      next[key] = value;
    }
  });
  return next;
}

async function syncCollection({
  db,
  collectionName,
  prefix,
  records,
  dryRun,
  prune,
}) {
  const collectionRef = db.collection(collectionName);
  const snapshot = await collectionRef.get();
  const existingIds = new Set(snapshot.docs.map((doc) => doc.id));

  let upserts = 0;
  let deletes = 0;
  const incomingIds = new Set();

  for (const record of records) {
    const id = String(record?.id ?? '').trim() || buildFallbackId(prefix, record?.latinName);
    incomingIds.add(id);

    const payload = stripUndefinedFields({
      ...record,
      commonNameNormalized: String(record?.commonName ?? '')
        .trim()
        .toLowerCase(),
      latinNameNormalized: normalizeLatinCatalogKey(record?.latinName),
      source: String(record?.source ?? 'starter').trim() || 'starter',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(existingIds.has(id)
        ? {}
        : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    });

    if (dryRun) {
      continue;
    }
    await collectionRef.doc(id).set(payload, { merge: true });
    upserts += 1;
  }

  if (prune) {
    for (const id of existingIds) {
      if (incomingIds.has(id)) {
        continue;
      }
      if (!dryRun) {
        await collectionRef.doc(id).delete();
      }
      deletes += 1;
    }
  }

  return {
    collectionName,
    seedCount: records.length,
    existingCount: existingIds.size,
    upserts,
    deletes,
  };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  assertEnv();

  const repoRoot = path.resolve(__dirname, '..');
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT;

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });

  const db = admin.firestore();
  const { fish, plants } = await loadSeedCatalogs(repoRoot);

  const [fishResult, plantResult] = await Promise.all([
    syncCollection({
      db,
      collectionName: 'fishCatalog',
      prefix: 'fish',
      records: fish,
      dryRun: flags.dryRun,
      prune: flags.prune,
    }),
    syncCollection({
      db,
      collectionName: 'plantCatalog',
      prefix: 'plant',
      records: plants,
      dryRun: flags.dryRun,
      prune: flags.prune,
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        dryRun: flags.dryRun,
        prune: flags.prune,
        results: [fishResult, plantResult],
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('sync-fish-plant-catalog failed:', error.message);
  process.exitCode = 1;
});
