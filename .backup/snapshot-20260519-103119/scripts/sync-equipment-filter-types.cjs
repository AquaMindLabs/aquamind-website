const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { initializeApp, applicationDefault, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const FILTER_FACTOR_BY_TYPE = {
  internal: 0.7,
  cascade: 0.65,
  canister: 0.55,
  sponge: 0.5,
  sump_panel: 0.7,
};

function loadEquipmentCatalog() {
  const filePath = path.join(__dirname, '..', 'data', 'equipmentCatalog.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const transformed = source.replace(
    /^\s*export const EQUIPMENT_CATALOG\s*=\s*/,
    'module.exports = '
  );

  const context = {
    module: { exports: [] },
    exports: {},
  };
  vm.runInNewContext(transformed, context, { filename: filePath });
  return Array.isArray(context.module.exports) ? context.module.exports : [];
}

function normalizeFilterType(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (
    normalized === 'internal' ||
    normalized === 'cascade' ||
    normalized === 'canister' ||
    normalized === 'sponge' ||
    normalized === 'sump_panel'
  ) {
    return normalized;
  }
  return '';
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function resolveProjectIdFromFirebaserc() {
  try {
    const firebasercPath = path.join(__dirname, '..', '.firebaserc');
    const raw = fs.readFileSync(firebasercPath, 'utf8');
    const parsed = JSON.parse(raw);
    const projectFromDefault = String(parsed?.projects?.default ?? '').trim();
    return projectFromDefault || '';
  } catch {
    return '';
  }
}

async function main() {
  const projectId = String(
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID ||
      resolveProjectIdFromFirebaserc() ||
      ''
  ).trim();

  if (!projectId) {
    throw new Error(
      'Brak projectId. Ustaw EXPO_PUBLIC_FIREBASE_PROJECT_ID/FIREBASE_PROJECT_ID lub projects.default w .firebaserc.'
    );
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId,
    });
  }

  const db = getFirestore();
  const catalog = loadEquipmentCatalog();
  const localFiltersById = new Map(
    catalog
      .filter((item) => String(item?.type ?? '').trim().toLowerCase() === 'filter')
      .map((item) => [String(item?.id ?? '').trim().toLowerCase(), item])
      .filter(([id]) => id)
  );

  const snapshot = await db.collection('equipmentCatalog').get();
  let checked = 0;
  let updated = 0;
  let skipped = 0;
  let batch = db.batch();
  let opsInBatch = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() || {};
    const dbType = String(data.type ?? '').trim().toLowerCase();
    if (dbType !== 'filter') {
      continue;
    }

    checked += 1;
    const idKey = String(data.id ?? docSnap.id ?? '').trim().toLowerCase();
    const localItem = localFiltersById.get(idKey);

    if (!localItem) {
      skipped += 1;
      continue;
    }

    const filterType = normalizeFilterType(localItem.filterType);
    if (!filterType) {
      skipped += 1;
      continue;
    }

    const targetFactor = FILTER_FACTOR_BY_TYPE[filterType];
    const currentType = normalizeFilterType(data.filterType);
    const currentFactor = toNumberOrNull(data.filterEfficiencyFactor);
    const patch = {};

    if (currentType !== filterType) {
      patch.filterType = filterType;
    }
    if (currentFactor !== targetFactor) {
      patch.filterEfficiencyFactor = targetFactor;
    }

    if (Object.keys(patch).length === 0) {
      continue;
    }

    batch.update(docSnap.ref, patch);
    opsInBatch += 1;
    updated += 1;

    if (opsInBatch >= 400) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) {
    await batch.commit();
  }

  console.log(
    `Done. Checked filters: ${checked}, updated: ${updated}, skipped(no local match): ${skipped}`
  );
}

main().catch((error) => {
  console.error('sync-equipment-filter-types failed:', error.message);
  process.exitCode = 1;
});
