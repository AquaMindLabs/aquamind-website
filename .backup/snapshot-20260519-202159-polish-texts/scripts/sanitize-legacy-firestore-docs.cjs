#!/usr/bin/env node
/* eslint-disable no-console */
const admin = require('firebase-admin');

const TANK_ALLOWED_FIELDS = new Set([
  'userId',
  'name',
  'liters',
  'aquariumType',
  'substrateType',
  'substrateTypes',
  'lightIntensity',
  'lightHours',
  'lightModelId',
  'lightModelName',
  'lightLumens',
  'targetTemperatureC',
  'ambientTemperatureC',
  'roomTemperatureMode',
  'lengthCm',
  'widthCm',
  'heightCm',
  'plantDensity',
  'hardscapeDensity',
  'hidingPlacesCount',
  'hidingPlacesEstimated',
  'lineOfSightBreaks',
  'zones',
  'waterProfile',
  'singleSpeciesFishId',
  'targetRanges',
  'onboardingMode',
  'onboardingStartAt',
  'onboardingTaskChecks',
  'plantFertilizationEntries',
  'heaterEquipments',
  'filterEquipments',
  'heaterEquipment',
  'filterEquipment',
  'createdAt',
  'updatedAt',
]);

const MEASUREMENT_ALLOWED_FIELDS = new Set([
  'userId',
  'tankId',
  'tankName',
  'note',
  'measuredAt',
  'ph',
  'gh',
  'kh',
  'no2',
  'no3',
  'temperature',
  'nh3nh4',
  'po4',
  'fe',
  'ca',
  'mg',
  'k',
  'tds',
  'co2',
  'createdAt',
  'updatedAt',
]);

function parseFlags(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

function assertEnv() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'Ustaw GOOGLE_APPLICATION_CREDENTIALS na sciezke do service account JSON.'
    );
  }
}

function buildDeletePatch(data, allowedFields) {
  const patch = {};
  Object.keys(data ?? {}).forEach((field) => {
    if (!allowedFields.has(field)) {
      patch[field] = admin.firestore.FieldValue.delete();
    }
  });
  return patch;
}

async function sanitizeCollection(db, name, allowedFields, dryRun) {
  const snap = await db.collection(name).get();
  let touched = 0;
  let changedFields = 0;

  for (const docSnap of snap.docs) {
    const patch = buildDeletePatch(docSnap.data(), allowedFields);
    const keys = Object.keys(patch);
    if (keys.length === 0) {
      continue;
    }
    touched += 1;
    changedFields += keys.length;
    if (!dryRun) {
      await docSnap.ref.update({
        ...patch,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  return {
    collection: name,
    docs: snap.size,
    touched,
    removedFields: changedFields,
  };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  assertEnv();

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT;

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });

  const db = admin.firestore();
  const [tanks, measurements] = await Promise.all([
    sanitizeCollection(db, 'tanks', TANK_ALLOWED_FIELDS, flags.dryRun),
    sanitizeCollection(
      db,
      'measurements',
      MEASUREMENT_ALLOWED_FIELDS,
      flags.dryRun
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        dryRun: flags.dryRun,
        results: [tanks, measurements],
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('sanitize-legacy-firestore-docs failed:', error.message);
  process.exitCode = 1;
});
