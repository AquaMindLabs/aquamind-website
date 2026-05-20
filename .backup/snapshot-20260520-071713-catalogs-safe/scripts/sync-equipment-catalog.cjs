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

function resolveProjectIdFromFirebaserc() {
  try {
    const firebasercPath = path.join(__dirname, '..', '.firebaserc');
    const raw = fs.readFileSync(firebasercPath, 'utf8');
    const parsed = JSON.parse(raw);
    return String(parsed?.projects?.default ?? '').trim();
  } catch {
    return '';
  }
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

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeItem(raw) {
  const id = String(raw?.id ?? '').trim().toLowerCase();
  const type = String(raw?.type ?? '').trim().toLowerCase();
  if (!id || !type) {
    return null;
  }

  const item = {
    id,
    type,
    brand: String(raw?.brand ?? '').trim(),
    model: String(raw?.model ?? '').trim(),
    source: 'catalog',
  };

  if (type === 'heater') {
    const powerW = toFiniteNumber(raw?.powerW);
    if (!powerW || powerW <= 0) {
      return null;
    }
    item.powerW = powerW;
  } else if (type === 'filter') {
    const flowLh = toFiniteNumber(raw?.flowLh);
    if (!flowLh || flowLh <= 0) {
      return null;
    }
    item.flowLh = flowLh;
    const filterType = normalizeFilterType(raw?.filterType);
    if (filterType) {
      item.filterType = filterType;
      item.filterEfficiencyFactor = FILTER_FACTOR_BY_TYPE[filterType];
    }
  } else if (type === 'light') {
    const lumens = toFiniteNumber(raw?.lumens);
    if (!lumens || lumens <= 0) {
      return null;
    }
    item.lumens = lumens;
  } else {
    return null;
  }

  const minL = toFiniteNumber(raw?.tankMinLiters);
  const maxL = toFiniteNumber(raw?.tankMaxLiters);
  if (minL !== null) {
    item.tankMinLiters = minL;
  }
  if (maxL !== null) {
    item.tankMaxLiters = maxL;
  }

  return item;
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
  const catalog = loadEquipmentCatalog()
    .map((item) => sanitizeItem(item))
    .filter(Boolean);

  let upserted = 0;
  let batch = db.batch();
  let ops = 0;

  for (const item of catalog) {
    const ref = db.collection('equipmentCatalog').doc(item.id);
    batch.set(ref, item, { merge: true });
    upserted += 1;
    ops += 1;

    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) {
    await batch.commit();
  }

  console.log(`Done. Upserted equipment records: ${upserted}`);
}

main().catch((error) => {
  console.error('sync-equipment-catalog failed:', error.message);
  process.exitCode = 1;
});
