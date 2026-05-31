const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const {
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  getDocs,
  doc,
  collection,
  query,
  where,
} = require('firebase/firestore');

const projectId = `aquarium-mobile-rules-${Date.now()}`;
const rulesPath = path.resolve(__dirname, '..', 'firestore.rules');
const rules = fs.readFileSync(rulesPath, 'utf8');

let testEnv;

function asUser(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

function asAdmin(uid = 'admin_user') {
  return testEnv.authenticatedContext(uid, { admin: true }).firestore();
}

async function seedDoc(collectionName, docId, payload) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), collectionName, docId), payload);
  });
}

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });
});

test.afterEach(async () => {
  await testEnv.clearFirestore();
});

test.after(async () => {
  await testEnv.cleanup();
});

test('owner can create/read/update/delete own tank', async () => {
  const db = asUser('user_a');
  const tankRef = doc(db, 'tanks', 'tank_a');
  const createdAt = new Date('2026-05-07T09:00:00.000Z');

  await assertSucceeds(
    setDoc(tankRef, {
      userId: 'user_a',
      name: 'Moje Akwarium',
      liters: 112,
      aquariumType: 'mixed',
      createdAt,
    })
  );

  await assertSucceeds(getDoc(tankRef));
  await assertSucceeds(
    updateDoc(tankRef, {
      liters: 140,
      updatedAt: new Date('2026-05-07T10:00:00.000Z'),
    })
  );
  await assertSucceeds(deleteDoc(tankRef));
});

test('cannot create tank with foreign userId', async () => {
  const db = asUser('user_a');
  const tankRef = doc(db, 'tanks', 'tank_foreign');

  await assertFails(
    setDoc(tankRef, {
      userId: 'user_b',
      name: 'Podszywanie',
      liters: 100,
      createdAt: new Date('2026-05-07T09:00:00.000Z'),
    })
  );
});

test('owner can update tank lighting fields used by lamp catalog', async () => {
  const db = asUser('user_a');
  const tankRef = doc(db, 'tanks', 'tank_light_a');

  await assertSucceeds(
    setDoc(tankRef, {
      userId: 'user_a',
      name: 'Akwarium Light',
      liters: 180,
      createdAt: new Date('2026-05-07T09:00:00.000Z'),
    })
  );

  await assertSucceeds(
    updateDoc(tankRef, {
      lightModelId: 'chihiros-a2-601',
      lightModelName: 'Chihiros A2 601',
      lightLumens: 5800,
      lightIntensity: 'medium',
      lightHours: 8,
      updatedAt: new Date('2026-05-07T10:00:00.000Z'),
    })
  );
});

test('owner can persist extended tank model fields used by domain analysis', async () => {
  const db = asUser('user_a');
  const tankRef = doc(db, 'tanks', 'tank_extended_a');
  const createdAt = new Date('2026-05-07T09:00:00.000Z');

  await assertSucceeds(
    setDoc(tankRef, {
      userId: 'user_a',
      name: 'Akwarium Extended',
      liters: 240,
      aquariumType: 'general',
      substrateType: 'sand',
      substrateTypes: ['sand', 'gravel'],
      waterProfile: 'low_tech',
      targetTemperatureC: 25,
      ambientTemperatureC: 20,
      roomTemperatureMode: 'normal',
      lengthCm: 120,
      widthCm: 40,
      heightCm: 50,
      plantDensity: 'medium',
      hardscapeDensity: 'high',
      hidingPlacesCount: 8,
      hidingPlacesEstimated: 'high',
      lineOfSightBreaks: 'medium',
      zones: {
        openSwimmingSpace: 'medium',
        bottomArea: 'high',
        caveArea: 'medium',
        plantArea: 'low',
      },
      createdAt,
    })
  );

  await assertSucceeds(
    updateDoc(tankRef, {
      roomTemperatureMode: 'custom',
      ambientTemperatureC: 22,
      waterProfile: 'single_species',
      updatedAt: new Date('2026-05-07T10:00:00.000Z'),
    })
  );
});

test('owner can save new onboarding modes for tank', async () => {
  const db = asUser('user_a');
  const tankRef = doc(db, 'tanks', 'tank_onboarding_modes');
  const createdAt = new Date('2026-05-07T09:00:00.000Z');

  await assertSucceeds(
    setDoc(tankRef, {
      userId: 'user_a',
      name: 'Akwarium Onboarding',
      liters: 150,
      onboardingMode: 'restart',
      onboardingStartAt: createdAt,
      createdAt,
    })
  );

  await assertSucceeds(
    updateDoc(tankRef, {
      onboardingMode: 'mature_media_start',
      onboardingStartAt: new Date('2026-05-08T09:00:00.000Z'),
      updatedAt: new Date('2026-05-08T09:05:00.000Z'),
    })
  );
});

test('owner can update onboardingEnabled and onboardingMode with valid values only', async () => {
  const db = asUser('user_a');
  const tankRef = doc(db, 'tanks', 'tank_onboarding_toggle');
  const createdAt = new Date('2026-05-10T09:00:00.000Z');

  await assertSucceeds(
    setDoc(tankRef, {
      userId: 'user_a',
      name: 'Akwarium Toggle',
      liters: 120,
      onboardingEnabled: true,
      onboardingMode: 'fresh_start',
      onboardingStartAt: createdAt,
      createdAt,
    })
  );

  await assertSucceeds(
    updateDoc(tankRef, {
      onboardingEnabled: false,
      onboardingMode: 'restart',
      onboardingStartAt: new Date('2026-05-11T09:00:00.000Z'),
      updatedAt: new Date('2026-05-11T09:05:00.000Z'),
    })
  );

  await assertFails(
    updateDoc(tankRef, {
      onboardingEnabled: 'false',
      updatedAt: new Date('2026-05-11T09:06:00.000Z'),
    })
  );

  await assertFails(
    updateDoc(tankRef, {
      onboardingMode: 'new_from_scratch',
      updatedAt: new Date('2026-05-11T09:07:00.000Z'),
    })
  );
});

test('owner can update maintenanceActionState map for action calendar', async () => {
  const db = asUser('user_a');
  const tankRef = doc(db, 'tanks', 'tank_maintenance_state');
  const createdAt = new Date('2026-05-10T09:00:00.000Z');

  await assertSucceeds(
    setDoc(tankRef, {
      userId: 'user_a',
      name: 'Akwarium Maintenance',
      liters: 200,
      onboardingMode: 'fresh_start',
      onboardingStartAt: createdAt,
      createdAt,
    })
  );

  await assertSucceeds(
    updateDoc(tankRef, {
      maintenanceActionState: {
        water_change: {
          lastCompletedAtMs: Date.parse('2026-05-11T08:00:00.000Z'),
          lastSkippedAtMs: null,
          postponedUntilMs: null,
          updatedAtMs: Date.parse('2026-05-11T08:10:00.000Z'),
        },
        water_tests: {
          lastCompletedAtMs: Date.parse('2026-05-11T08:30:00.000Z'),
          lastSkippedAtMs: null,
          postponedUntilMs: Date.parse('2026-05-12T08:30:00.000Z'),
          updatedAtMs: Date.parse('2026-05-11T08:31:00.000Z'),
        },
      },
      updatedAt: new Date('2026-05-11T08:40:00.000Z'),
    })
  );
});

test('owner can update acceptedProblemAcks map for dismissed review issues', async () => {
  const db = asUser('user_a');
  const tankRef = doc(db, 'tanks', 'tank_problem_acks');
  const createdAt = new Date('2026-05-12T09:00:00.000Z');

  await assertSucceeds(
    setDoc(tankRef, {
      userId: 'user_a',
      name: 'Akwarium Alerty',
      liters: 160,
      createdAt,
    })
  );

  await assertSucceeds(
    updateDoc(tankRef, {
      acceptedProblemAcks: {
        'title:water:no2 za wysokie': {
          title: 'NO2 za wysokie',
          area: 'Woda',
          severity: 'critical',
          source: 'review',
          acceptedAt: '2026-05-12T10:00:00.000Z',
        },
      },
      updatedAt: new Date('2026-05-12T10:01:00.000Z'),
    })
  );
});

test('cannot read or mutate another user tank', async () => {
  await seedDoc('tanks', 'tank_owned_by_a', {
    userId: 'user_a',
    name: 'Akwarium A',
    liters: 100,
    createdAt: new Date('2026-05-07T09:00:00.000Z'),
  });

  const dbB = asUser('user_b');
  const foreignTankRef = doc(dbB, 'tanks', 'tank_owned_by_a');

  await assertFails(getDoc(foreignTankRef));
  await assertFails(updateDoc(foreignTankRef, { liters: 120 }));
  await assertFails(deleteDoc(foreignTankRef));
});

test('measurements are isolated per user and query must include owner constraint', async () => {
  await seedDoc('measurements', 'm_a', {
    userId: 'user_a',
    tankId: 'tank_a',
    tankName: 'Akwarium A',
    ph: 7.1,
    createdAt: new Date('2026-05-07T09:00:00.000Z'),
  });
  await seedDoc('measurements', 'm_b', {
    userId: 'user_b',
    tankId: 'tank_b',
    tankName: 'Akwarium B',
    ph: 7.4,
    createdAt: new Date('2026-05-07T09:01:00.000Z'),
  });

  const dbA = asUser('user_a');

  await assertFails(getDocs(collection(dbA, 'measurements')));

  const ownQuery = query(
    collection(dbA, 'measurements'),
    where('userId', '==', 'user_a')
  );
  const ownDocs = await assertSucceeds(getDocs(ownQuery));
  assert.equal(ownDocs.docs.length, 1);
  assert.equal(ownDocs.docs[0].id, 'm_a');
});

test('cannot update measurement owner identity fields', async () => {
  await seedDoc('measurements', 'm_owner', {
    userId: 'user_a',
    tankId: 'tank_a',
    tankName: 'Akwarium A',
    no3: 20,
    createdAt: new Date('2026-05-07T09:00:00.000Z'),
  });

  const dbA = asUser('user_a');
  const measurementRef = doc(dbA, 'measurements', 'm_owner');

  await assertFails(updateDoc(measurementRef, { userId: 'user_b' }));
  await assertFails(updateDoc(measurementRef, { tankId: 'tank_b' }));
});

test('measurement create/update supports extended parameters within rules ranges', async () => {
  const dbA = asUser('user_a');
  const measurementRef = doc(dbA, 'measurements', 'm_extended_1');

  await assertSucceeds(
    setDoc(measurementRef, {
      userId: 'user_a',
      tankId: 'tank_a',
      tankName: 'Akwarium A',
      note: 'Pomiar rozszerzony',
      measuredAt: new Date('2026-05-10T08:00:00.000Z'),
      ph: 6.9,
      gh: 8,
      kh: 4,
      no2: 0,
      no3: 18,
      temperature: 25.2,
      nh3nh4: 0,
      po4: 0.7,
      fe: 0.1,
      ca: 42,
      mg: 11,
      k: 16,
      tds: 210,
      co2: 19,
      createdAt: new Date('2026-05-10T08:01:00.000Z'),
    })
  );

  await assertSucceeds(
    updateDoc(measurementRef, {
      no3: 22,
      nh3nh4: 0.02,
      po4: 0.9,
      co2: 24,
      updatedAt: new Date('2026-05-10T09:00:00.000Z'),
    })
  );

  await assertFails(
    updateDoc(measurementRef, {
      co2: 250,
      updatedAt: new Date('2026-05-10T09:05:00.000Z'),
    })
  );
});

test('stock item field validation blocks invalid plant payload', async () => {
  const dbA = asUser('user_a');
  const stockCollection = collection(dbA, 'stockItems');

  await assertFails(
    addDoc(stockCollection, {
      userId: 'user_a',
      tankId: 'tank_a',
      tankName: 'Akwarium A',
      type: 'plant',
      name: 'Anubias',
      commonName: 'Anubias',
      latinName: 'Anubias barteri',
      catalogPlantId: 'plant_1',
      phMin: 6.0,
      phMax: 7.8,
      ghMin: 3,
      ghMax: 14,
      tempMin: 22,
      tempMax: 28,
      minLiters: 20,
      notes: '',
      aggressionLevel: 'peaceful',
      createdAt: new Date('2026-05-07T09:00:00.000Z'),
    })
  );
});

test('stock item plant payload accepts lighting requirement fields', async () => {
  const dbA = asUser('user_a');
  const stockCollection = collection(dbA, 'stockItems');

  await assertSucceeds(
    addDoc(stockCollection, {
      userId: 'user_a',
      tankId: 'tank_a',
      tankName: 'Akwarium A',
      type: 'plant',
      name: 'Anubias',
      commonName: 'Anubias',
      latinName: 'Anubias barteri',
      catalogPlantId: 'plant_1',
      lightLumenMinPerLiter: 10,
      lightLumenMaxPerLiter: 25,
      lightHoursMin: 6,
      lightHoursMax: 9,
      lightDemand: 'low',
      co2Demand: 'low',
      growthRate: 'medium',
      difficulty: 'easy',
      fertilizationDemand: 'low',
      plantType: 'epiphyte',
      placementZone: 'hardscape',
      carboSensitivity: 'medium',
      parameterStabilitySensitivity: 'medium',
      minTankHeightCm: 20,
      minTankVolumeL: 20,
      compatibleWithDiggers: true,
      phMin: 6,
      phMax: 7.8,
      ghMin: 3,
      ghMax: 14,
      tempMin: 22,
      tempMax: 28,
      quantity: 1,
      minLiters: 20,
      notes: '',
      createdAt: new Date('2026-05-07T09:00:00.000Z'),
    })
  );
});

test('stock item plant payload blocks invalid v2 demand fields', async () => {
  const dbA = asUser('user_a');
  const stockCollection = collection(dbA, 'stockItems');

  await assertFails(
    addDoc(stockCollection, {
      userId: 'user_a',
      tankId: 'tank_a',
      tankName: 'Akwarium A',
      type: 'plant',
      name: 'Anubias',
      commonName: 'Anubias',
      latinName: 'Anubias barteri',
      catalogPlantId: 'plant_1',
      lightDemand: 'very_high',
      phMin: 6,
      phMax: 7.8,
      ghMin: 3,
      ghMax: 14,
      tempMin: 22,
      tempMax: 28,
      quantity: 1,
      minLiters: 20,
      notes: '',
      createdAt: new Date('2026-05-07T09:00:00.000Z'),
    })
  );
});

test('tank disease case can be closed only by owner', async () => {
  await seedDoc('tankDiseaseCases', 'case_1', {
    userId: 'user_a',
    tankId: 'tank_a',
    tankName: 'Akwarium A',
    caseType: 'disease',
    issueId: 'ich',
    issueName: 'Ospa',
    diseaseId: 'ich',
    diseaseName: 'Ospa',
    severity: 'high',
    diseaseSummary: 'Opis',
    causes: [],
    caution: 'Uwaga',
    treatmentPlan: ['krok 1'],
    schedule: [],
    status: 'active',
    createdAt: new Date('2026-05-07T09:00:00.000Z'),
    startedAt: new Date('2026-05-07T09:00:00.000Z'),
    nextReviewAt: new Date('2026-05-08T09:00:00.000Z'),
  });

  const dbA = asUser('user_a');
  const dbB = asUser('user_b');

  await assertSucceeds(
    updateDoc(doc(dbA, 'tankDiseaseCases', 'case_1'), {
      status: 'resolved',
      closedAt: new Date('2026-05-09T09:00:00.000Z'),
      closedReason: 'resolved',
    })
  );

  await assertFails(
    updateDoc(doc(dbB, 'tankDiseaseCases', 'case_1'), {
      status: 'removed',
      closedAt: new Date('2026-05-09T10:00:00.000Z'),
      closedReason: 'removed',
    })
  );
});

test('owner can create and update AI algae suspicion in tankDiseaseCases', async () => {
  const dbA = asUser('user_a');
  const dbB = asUser('user_b');
  const caseRef = doc(dbA, 'tankDiseaseCases', 'algae_ai_case_1');
  const createdAt = new Date('2026-05-10T09:00:00.000Z');

  await assertSucceeds(
    setDoc(caseRef, {
      userId: 'user_a',
      tankId: 'tank_a',
      tankName: 'Akwarium A',
      caseType: 'algae',
      issueId: 'ai_algae_1',
      issueName: 'Podejrzenie AI: Krasnorosty',
      diseaseId: null,
      diseaseName: 'Krasnorosty',
      severity: 'medium',
      diseaseSummary: 'Mozliwe podejrzenie glonow na podstawie opisu i kontekstu.',
      causes: ['Niestabilne CO2', 'Za dlugi czas swiecenia'],
      caution: 'Podejrzenie AI - wynik orientacyjny.',
      treatmentPlan: ['Sprawdz NO3 i PO4', 'Skoryguj czas swiecenia'],
      schedule: [],
      status: 'suspected',
      source: 'ai',
      suspectedAlgae: [
        {
          algaeId: null,
          name: 'Krasnorosty',
          confidence: 0.62,
          confidenceLabel: 'medium',
          reason: 'Czarne kepki na lisciach i dekoracjach.',
        },
      ],
      locationTags: ['plants', 'hardscape'],
      appearanceTags: ['black_brush_tufts'],
      userDescription: 'Czarne kepki na lisciach i korzeniu.',
      durationLabel: '2-3 dni',
      imageUrls: ['https://example.com/algae-photo-1.jpg'],
      aiSummary: 'AI wskazuje mozliwe krasnorosty.',
      verificationSteps: ['Zweryfikuj NO3 i PO4', 'Sprawdz cyrkulacje'],
      recommendations: ['Usun mechanicznie glony', 'Ogranicz karmienie'],
      warnings: ['Wynik orientacyjny, to nie jest pewna diagnoza.'],
      createdAt,
      startedAt: createdAt,
      nextReviewAt: new Date('2026-05-12T09:00:00.000Z'),
      updatedAt: createdAt,
    })
  );

  await assertSucceeds(
    updateDoc(caseRef, {
      status: 'adjusting',
      updatedAt: new Date('2026-05-11T09:00:00.000Z'),
    })
  );

  await assertSucceeds(
    updateDoc(caseRef, {
      status: 'resolved',
      closedAt: new Date('2026-05-12T09:00:00.000Z'),
      resolvedAt: new Date('2026-05-12T09:00:00.000Z'),
      closedReason: 'resolved',
      updatedAt: new Date('2026-05-12T09:00:00.000Z'),
    })
  );

  await assertFails(
    updateDoc(doc(dbB, 'tankDiseaseCases', 'algae_ai_case_1'), {
      status: 'dismissed',
      updatedAt: new Date('2026-05-12T10:00:00.000Z'),
    })
  );
});

test('non-admin cannot write fish catalog, admin can write', async () => {
  const userDb = asUser('user_a');
  const adminDb = asAdmin('admin_a');
  const fishRefUser = doc(userDb, 'fishCatalog', 'fish_1');
  const fishRefAdmin = doc(adminDb, 'fishCatalog', 'fish_2');

  await assertFails(
    setDoc(fishRefUser, {
      commonName: 'Skalar',
      latinName: 'Pterophyllum scalare',
      phMin: 6,
      phMax: 7.5,
      ghMin: 3,
      ghMax: 12,
      tempMin: 24,
      tempMax: 29,
      minLiters: 120,
      source: 'manual',
      createdAt: new Date('2026-05-07T09:00:00.000Z'),
    })
  );

  await assertSucceeds(
    setDoc(fishRefAdmin, {
      commonName: 'Gupik',
      latinName: 'Poecilia reticulata',
      phMin: 7,
      phMax: 8,
      ghMin: 8,
      ghMax: 20,
      tempMin: 22,
      tempMax: 28,
      minLiters: 40,
      source: 'starter',
      createdAt: new Date('2026-05-07T09:00:00.000Z'),
    })
  );
});

test('non-admin cannot write plant catalog, admin can write', async () => {
  const userDb = asUser('user_a');
  const adminDb = asAdmin('admin_a');
  const plantRefUser = doc(userDb, 'plantCatalog', 'plant_1');
  const plantRefAdmin = doc(adminDb, 'plantCatalog', 'plant_2');

  await assertFails(
    setDoc(plantRefUser, {
      commonName: 'Anubias',
      latinName: 'Anubias barteri',
      phMin: 6,
      phMax: 7.8,
      ghMin: 3,
      ghMax: 14,
      tempMin: 22,
      tempMax: 28,
      minLiters: 20,
      source: 'manual',
      createdAt: new Date('2026-05-07T09:00:00.000Z'),
    })
  );

  await assertSucceeds(
    setDoc(plantRefAdmin, {
      commonName: 'Moczarka',
      latinName: 'Egeria densa',
      phMin: 6.2,
      phMax: 7.8,
      ghMin: 4,
      ghMax: 16,
      tempMin: 20,
      tempMax: 28,
      minLiters: 20,
      source: 'expanded',
      createdAt: new Date('2026-05-07T09:00:00.000Z'),
    })
  );
});

test('authenticated user can read fish and plant catalog', async () => {
  await seedDoc('fishCatalog', 'fish_read_1', {
    commonName: 'Skalar',
    latinName: 'Pterophyllum scalare',
  });
  await seedDoc('plantCatalog', 'plant_read_1', {
    commonName: 'Anubias',
    latinName: 'Anubias barteri',
  });

  const userDb = asUser('user_a');

  await assertSucceeds(getDoc(doc(userDb, 'fishCatalog', 'fish_read_1')));
  await assertSucceeds(getDoc(doc(userDb, 'plantCatalog', 'plant_read_1')));
});

test('authenticated user can read algae catalog, but only admin can write', async () => {
  await seedDoc('algaeCatalog', 'algae_read_1', {
    id: 'green-dust-algae',
    name: 'Zielenice pylowe',
    severity: 'medium',
  });

  const userDb = asUser('user_a');
  const adminDb = asAdmin('admin_a');

  await assertSucceeds(getDoc(doc(userDb, 'algaeCatalog', 'algae_read_1')));

  await assertFails(
    setDoc(doc(userDb, 'algaeCatalog', 'algae_user_write'), {
      id: 'x',
      name: 'test',
      severity: 'low',
    })
  );

  await assertSucceeds(
    setDoc(doc(adminDb, 'algaeCatalog', 'algae_admin_write'), {
      id: 'x',
      name: 'test',
      severity: 'low',
    })
  );
});

test('authenticated user can read disease catalogs, but only admin can write', async () => {
  await seedDoc('fishDiseaseCatalog', 'ich', {
    id: 'ich',
    name: 'Ospa rybia',
    severity: 'high',
  });
  await seedDoc('plantDiseaseCatalog', 'potassium_deficiency', {
    id: 'potassium_deficiency',
    name: 'Niedobor potasu',
    severity: 'medium',
  });

  const userDb = asUser('user_a');
  const adminDb = asAdmin('admin_a');

  await assertSucceeds(getDoc(doc(userDb, 'fishDiseaseCatalog', 'ich')));
  await assertSucceeds(
    getDoc(doc(userDb, 'plantDiseaseCatalog', 'potassium_deficiency'))
  );

  await assertFails(
    setDoc(doc(userDb, 'fishDiseaseCatalog', 'user_write'), {
      id: 'x',
      name: 'test',
      severity: 'low',
    })
  );
  await assertFails(
    setDoc(doc(userDb, 'plantDiseaseCatalog', 'user_write'), {
      id: 'x',
      name: 'test',
      severity: 'low',
    })
  );

  await assertSucceeds(
    setDoc(doc(adminDb, 'fishDiseaseCatalog', 'admin_write_fish'), {
      id: 'x',
      name: 'test',
      severity: 'low',
    })
  );
  await assertSucceeds(
    setDoc(doc(adminDb, 'plantDiseaseCatalog', 'admin_write_plant'), {
      id: 'x',
      name: 'test',
      severity: 'low',
    })
  );
});

test('userSubscriptions: admin can write, owner can read only own doc', async () => {
  const adminDb = asAdmin('admin_a');
  const userDb = asUser('user_a');
  const otherUserDb = asUser('user_b');

  await assertSucceeds(
    setDoc(doc(adminDb, 'userSubscriptions', 'user_a'), {
      userId: 'user_a',
      tier: 'premium',
      status: 'active',
      source: 'admin',
      startedAt: '2026-05-08T10:00:00.000Z',
      expiresAt: '2026-06-08T10:00:00.000Z',
      renewsAt: null,
      lastValidatedAt: '2026-05-08T10:00:00.000Z',
      planVersion: 3,
    })
  );

  await assertSucceeds(getDoc(doc(adminDb, 'userSubscriptions', 'user_a')));
  await assertSucceeds(getDoc(doc(userDb, 'userSubscriptions', 'user_a')));
  await assertFails(getDoc(doc(otherUserDb, 'userSubscriptions', 'user_a')));
  await assertFails(
    setDoc(doc(userDb, 'userSubscriptions', 'user_a'), {
      userId: 'user_a',
      tier: 'pro',
      status: 'active',
      source: 'admin',
      startedAt: '2026-05-08T10:00:00.000Z',
      expiresAt: '2026-06-08T10:00:00.000Z',
      renewsAt: null,
      lastValidatedAt: '2026-05-08T10:00:00.000Z',
      planVersion: 3,
    })
  );
});

test('aiAssistantHistory: owner can create/read/delete own history entry', async () => {
  const userDb = asUser('user_a');
  const historyRef = doc(userDb, 'users', 'user_a', 'aiAssistantHistory', 'ai-chat-1');
  const createdAt = new Date('2026-05-30T10:00:00.000Z');

  await assertSucceeds(
    setDoc(historyRef, {
      userId: 'user_a',
      id: 'ai-chat-1',
      type: 'chat',
      createdAtMs: createdAt.getTime(),
      createdAtLabel: '30.05.2026, 12:00:00',
      question: 'Co zrobic z glonami?',
      answer: 'Ogranicz swiatlo i sprawdz NO3 oraz PO4.',
      recommendations: ['Skroc swiecenie', 'Zrob pomiary'],
      warnings: ['To nie porada weterynaryjna.'],
      hadEmptyDataFallback: false,
      createdAt,
      updatedAt: createdAt,
      schemaVersion: 1,
    })
  );

  await assertSucceeds(getDoc(historyRef));
  await assertSucceeds(getDocs(collection(userDb, 'users', 'user_a', 'aiAssistantHistory')));
  await assertSucceeds(deleteDoc(historyRef));
});

test('aiAssistantHistory: user cannot access or write foreign history', async () => {
  const userDb = asUser('user_a');
  const otherDb = asUser('user_b');
  const createdAt = new Date('2026-05-30T10:00:00.000Z');

  await assertFails(getDocs(collection(userDb, 'users', 'user_b', 'aiAssistantHistory')));
  await assertFails(
    setDoc(doc(userDb, 'users', 'user_b', 'aiAssistantHistory', 'ai-chat-foreign'), {
      userId: 'user_b',
      id: 'ai-chat-foreign',
      type: 'chat',
      createdAtMs: createdAt.getTime(),
      createdAtLabel: '30.05.2026, 12:00:00',
      question: 'Czy moge zapisac cudza historie?',
      answer: 'Nie.',
      recommendations: [],
      warnings: [],
      hadEmptyDataFallback: false,
      createdAt,
      updatedAt: createdAt,
      schemaVersion: 1,
    })
  );
  await assertFails(
    setDoc(doc(otherDb, 'users', 'user_b', 'aiAssistantHistory', 'ai-chat-bad-owner'), {
      userId: 'user_a',
      id: 'ai-chat-bad-owner',
      type: 'chat',
      createdAtMs: createdAt.getTime(),
      createdAtLabel: '30.05.2026, 12:00:00',
      question: 'Czy moge podszyc userId?',
      answer: 'Nie.',
      recommendations: [],
      warnings: [],
      hadEmptyDataFallback: false,
      createdAt,
      updatedAt: createdAt,
      schemaVersion: 1,
    })
  );
});

test('admin can read and update fish/plant catalog requests', async () => {
  await seedDoc('fishCatalogRequests', 'fish_req_1', {
    type: 'missing_fish',
    commonName: 'Nowa ryba',
    latinName: 'Fishus testus',
    userId: 'user_a',
    userEmail: 'a@example.com',
    tankId: 'tank_a',
    tankName: 'Akwarium A',
    status: 'new',
    createdAt: new Date('2026-05-07T09:00:00.000Z'),
  });

  await seedDoc('plantCatalogRequests', 'plant_req_1', {
    type: 'missing_plant',
    commonName: 'Nowa roslina',
    latinName: 'Plantus testus',
    userId: 'user_a',
    userEmail: 'a@example.com',
    tankId: 'tank_a',
    tankName: 'Akwarium A',
    status: 'new',
    createdAt: new Date('2026-05-07T09:00:00.000Z'),
  });

  const adminDb = asAdmin('admin_a');

  await assertSucceeds(getDoc(doc(adminDb, 'fishCatalogRequests', 'fish_req_1')));
  await assertSucceeds(getDoc(doc(adminDb, 'plantCatalogRequests', 'plant_req_1')));

  await assertSucceeds(
    updateDoc(doc(adminDb, 'fishCatalogRequests', 'fish_req_1'), {
      status: 'accepted',
    })
  );
});
