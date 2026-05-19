#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const admin = require('firebase-admin');

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

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function buildFallbackId(name) {
  const slug = normalizeText(name)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `plant_issue_${slug || 'unknown'}`;
}

async function loadPlantDiseaseCatalog(repoRoot) {
  const catalogUrl = pathToFileURL(
    path.join(repoRoot, 'data', 'plantDiseaseCatalog.js')
  ).href;
  const catalogModule = await import(catalogUrl);
  const records = Array.isArray(catalogModule.PLANT_DISEASE_CATALOG)
    ? catalogModule.PLANT_DISEASE_CATALOG
    : [];

  const byId = new Map();
  records.forEach((item) => {
    const id = String(item?.id ?? '').trim().toLowerCase();
    const fallbackId = buildFallbackId(item?.name);
    const finalId = id || fallbackId;
    if (!finalId || byId.has(finalId)) {
      return;
    }
    byId.set(finalId, {
      ...item,
      id: finalId,
    });
  });

  return [...byId.values()];
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

async function syncPlantDiseaseCatalog({ db, records, dryRun, prune }) {
  const collectionName = 'plantDiseaseCatalog';
  const collectionRef = db.collection(collectionName);
  const snapshot = await collectionRef.get();
  const existingIds = new Set(snapshot.docs.map((doc) => doc.id));

  let upserts = 0;
  let deletes = 0;
  const incomingIds = new Set();

  for (const record of records) {
    const id = String(record?.id ?? '').trim() || buildFallbackId(record?.name);
    incomingIds.add(id);

    const payload = stripUndefinedFields({
      ...record,
      id,
      name: String(record?.name ?? '').trim(),
      nameNormalized: normalizeText(record?.name),
      severity: String(record?.severity ?? 'medium').trim().toLowerCase() || 'medium',
      source: String(record?.source ?? 'catalog').trim() || 'catalog',
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
  const records = await loadPlantDiseaseCatalog(repoRoot);
  const result = await syncPlantDiseaseCatalog({
    db,
    records,
    dryRun: flags.dryRun,
    prune: flags.prune,
  });

  console.log(
    JSON.stringify(
      {
        dryRun: flags.dryRun,
        prune: flags.prune,
        result,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('sync-plant-disease-catalog failed:', error.message);
  process.exitCode = 1;
});

