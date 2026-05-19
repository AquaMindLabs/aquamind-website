import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js';

const STORAGE_KEY = 'aquamind_admin_firebase_config_v1';
const REQUIRED_CONFIG_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];

const COLLECTIONS = Object.freeze({
  fish: 'fishCatalog',
  plant: 'plantCatalog',
  algae: 'algaeCatalog',
  fishDisease: 'fishDiseaseCatalog',
  plantDisease: 'plantDiseaseCatalog',
  fishRequests: 'fishCatalogRequests',
  plantRequests: 'plantCatalogRequests',
  userSubscriptions: 'userSubscriptions',
});

const USER_ID_SOURCE_COLLECTIONS = ['tanks', 'measurements', 'stockItems', 'tankDiseaseCases'];
const PAGE_SIZE = 20;

const state = {
  app: null,
  auth: null,
  db: null,
  user: null,
  isAdmin: false,
  activeSection: 'fish',
  fish: [],
  plant: [],
  algae: [],
  fishDisease: [],
  plantDisease: [],
  requests: [],
  users: [],
  subscriptionsByUid: new Map(),
  pagination: {
    fish: 1,
    plant: 1,
    algae: 1,
    fishDisease: 1,
    plantDisease: 1,
    requests: 1,
    users: 1,
  },
  editor: {
    section: 'fish',
    mode: 'create',
    id: null,
  },
};

const ui = {
  configCard: byId('configCard'),
  toggleConfigBtn: byId('toggleConfigBtn'),
  authCard: byId('authCard'),
  panelCard: byId('panelCard'),
  editorCard: byId('editorCard'),
  status: byId('status'),

  cfgApiKey: byId('cfgApiKey'),
  cfgAuthDomain: byId('cfgAuthDomain'),
  cfgProjectId: byId('cfgProjectId'),
  cfgStorageBucket: byId('cfgStorageBucket'),
  cfgMessagingSenderId: byId('cfgMessagingSenderId'),
  cfgAppId: byId('cfgAppId'),
  saveConfigBtn: byId('saveConfigBtn'),
  clearConfigBtn: byId('clearConfigBtn'),

  loginEmail: byId('loginEmail'),
  loginPassword: byId('loginPassword'),
  loginBtn: byId('loginBtn'),
  authLogoutBtn: byId('authLogoutBtn'),
  logoutBtn: byId('logoutBtn'),
  refreshBtn: byId('refreshBtn'),

  sessionMeta: byId('sessionMeta'),
  adminStateBadge: byId('adminStateBadge'),

  addFishBtn: byId('addFishBtn'),
  addPlantBtn: byId('addPlantBtn'),
  addAlgaeBtn: byId('addAlgaeBtn'),
  addFishDiseaseBtn: byId('addFishDiseaseBtn'),
  addPlantDiseaseBtn: byId('addPlantDiseaseBtn'),
  addUserPlanBtn: byId('addUserPlanBtn'),
  refreshRequestsBtn: byId('refreshRequestsBtn'),
  refreshUsersBtn: byId('refreshUsersBtn'),

  fishSearch: byId('fishSearch'),
  plantSearch: byId('plantSearch'),
  algaeSearch: byId('algaeSearch'),
  fishDiseaseSearch: byId('fishDiseaseSearch'),
  plantDiseaseSearch: byId('plantDiseaseSearch'),
  requestSearch: byId('requestSearch'),
  userSearch: byId('userSearch'),

  fishTableBody: byId('fishTableBody'),
  plantTableBody: byId('plantTableBody'),
  algaeTableBody: byId('algaeTableBody'),
  fishDiseaseTableBody: byId('fishDiseaseTableBody'),
  plantDiseaseTableBody: byId('plantDiseaseTableBody'),
  requestsTableBody: byId('requestsTableBody'),
  usersTableBody: byId('usersTableBody'),

  fishPrevBtn: byId('fishPrevBtn'),
  fishNextBtn: byId('fishNextBtn'),
  fishPageInfo: byId('fishPageInfo'),
  plantPrevBtn: byId('plantPrevBtn'),
  plantNextBtn: byId('plantNextBtn'),
  plantPageInfo: byId('plantPageInfo'),
  algaePrevBtn: byId('algaePrevBtn'),
  algaeNextBtn: byId('algaeNextBtn'),
  algaePageInfo: byId('algaePageInfo'),
  fishDiseasePrevBtn: byId('fishDiseasePrevBtn'),
  fishDiseaseNextBtn: byId('fishDiseaseNextBtn'),
  fishDiseasePageInfo: byId('fishDiseasePageInfo'),
  plantDiseasePrevBtn: byId('plantDiseasePrevBtn'),
  plantDiseaseNextBtn: byId('plantDiseaseNextBtn'),
  plantDiseasePageInfo: byId('plantDiseasePageInfo'),
  requestsPrevBtn: byId('requestsPrevBtn'),
  requestsNextBtn: byId('requestsNextBtn'),
  requestsPageInfo: byId('requestsPageInfo'),
  usersPrevBtn: byId('usersPrevBtn'),
  usersNextBtn: byId('usersNextBtn'),
  usersPageInfo: byId('usersPageInfo'),

  sectionTabs: Array.from(document.querySelectorAll('.tab[data-section]')),
  sectionPanels: Array.from(document.querySelectorAll('.section-panel')),

  editorTitle: byId('editorTitle'),
  editorHint: byId('editorHint'),
  catalogForm: byId('catalogForm'),
  cancelEditBtn: byId('cancelEditBtn'),

  stockFields: byId('stockFields'),
  fishExtraFields: byId('fishExtraFields'),
  algaeFields: byId('algaeFields'),
  diseaseFields: byId('diseaseFields'),
  userSubscriptionFields: byId('userSubscriptionFields'),

  fCommonName: byId('fCommonName'),
  fLatinName: byId('fLatinName'),
  fPhMin: byId('fPhMin'),
  fPhMax: byId('fPhMax'),
  fGhMin: byId('fGhMin'),
  fGhMax: byId('fGhMax'),
  fTempMin: byId('fTempMin'),
  fTempMax: byId('fTempMax'),
  fMinLiters: byId('fMinLiters'),
  fSource: byId('fSource'),
  fImagePreviewUrl: byId('fImagePreviewUrl'),
  fImageUrl: byId('fImageUrl'),
  fImageLink: byId('fImageLink'),
  fNotes: byId('fNotes'),
  fAggressionLevel: byId('fAggressionLevel'),
  fMinGroupSize: byId('fMinGroupSize'),
  fIsSchooling: byId('fIsSchooling'),

  aId: byId('aId'),
  aName: byId('aName'),
  aSeverity: byId('aSeverity'),
  aSuggestedRemedy: byId('aSuggestedRemedy'),
  aImageSourceLabel: byId('aImageSourceLabel'),
  aSymptoms: byId('aSymptoms'),
  aImageUrl: byId('aImageUrl'),
  aImagePreviewUrl: byId('aImagePreviewUrl'),
  aImageLink: byId('aImageLink'),
  aImageFallbackUrl: byId('aImageFallbackUrl'),
  aImageFallbackPreviewUrl: byId('aImageFallbackPreviewUrl'),
  aSummary: byId('aSummary'),
  aCauses: byId('aCauses'),
  aRemoveActions: byId('aRemoveActions'),
  aPreventionActions: byId('aPreventionActions'),
  aCaution: byId('aCaution'),

  dId: byId('dId'),
  dName: byId('dName'),
  dSeverity: byId('dSeverity'),
  dSuggestedRemedy: byId('dSuggestedRemedy'),
  dImageSourceLabel: byId('dImageSourceLabel'),
  dSymptoms: byId('dSymptoms'),
  dImageUrl: byId('dImageUrl'),
  dImagePreviewUrl: byId('dImagePreviewUrl'),
  dImageFallbackUrl: byId('dImageFallbackUrl'),
  dImageFallbackPreviewUrl: byId('dImageFallbackPreviewUrl'),
  dSummary: byId('dSummary'),
  dTreatment: byId('dTreatment'),
  dCaution: byId('dCaution'),

  uUid: byId('uUid'),
  uEmail: byId('uEmail'),
  uTier: byId('uTier'),
  uStatus: byId('uStatus'),
  uSource: byId('uSource'),
  uStartedAt: byId('uStartedAt'),
  uExpiresAt: byId('uExpiresAt'),
  uRenewsAt: byId('uRenewsAt'),
  uLastValidatedAt: byId('uLastValidatedAt'),
  uPlanVersion: byId('uPlanVersion'),
};

boot();

function boot() {
  bindUiEvents();

  const resolvedConfig = getResolvedConfig();
  if (resolvedConfig) {
    writeConfigToInputs(resolvedConfig);
    setConfigCardVisible(false);
    initializeFirebase(resolvedConfig);
  } else {
    setConfigCardVisible(true);
    setStatus('Wprowadz konfiguracje Firebase, aby uruchomic panel.', 'info');
    show(ui.authCard, false);
    show(ui.panelCard, false);
  }
}

function bindUiEvents() {
  ui.toggleConfigBtn.addEventListener('click', () =>
    setConfigCardVisible(ui.configCard.classList.contains('hidden'))
  );

  ui.saveConfigBtn.addEventListener('click', handleSaveConfig);
  ui.clearConfigBtn.addEventListener('click', handleClearConfig);

  ui.loginBtn.addEventListener('click', handleLogin);
  ui.authLogoutBtn.addEventListener('click', handleLogout);
  ui.logoutBtn.addEventListener('click', handleLogout);

  ui.refreshBtn.addEventListener('click', loadAllAdminData);
  ui.refreshRequestsBtn.addEventListener('click', loadRequests);
  ui.refreshUsersBtn.addEventListener('click', loadUsersAndSubscriptions);

  ui.addFishBtn.addEventListener('click', () => openEditor('fish'));
  ui.addPlantBtn.addEventListener('click', () => openEditor('plant'));
  ui.addAlgaeBtn.addEventListener('click', () => openEditor('algae'));
  ui.addFishDiseaseBtn.addEventListener('click', () => openEditor('fishDisease'));
  ui.addPlantDiseaseBtn.addEventListener('click', () => openEditor('plantDisease'));
  ui.addUserPlanBtn.addEventListener('click', () => openEditor('users'));

  ui.catalogForm.addEventListener('submit', handleEditorSave);
  ui.cancelEditBtn.addEventListener('click', closeEditor);

  ui.sectionTabs.forEach((tab) => {
    tab.addEventListener('click', () => switchSection(tab.dataset.section || 'fish'));
  });

  ui.fishSearch.addEventListener('input', () => {
    state.pagination.fish = 1;
    renderFishTable();
  });
  ui.plantSearch.addEventListener('input', () => {
    state.pagination.plant = 1;
    renderPlantTable();
  });
  ui.algaeSearch.addEventListener('input', () => {
    state.pagination.algae = 1;
    renderAlgaeTable();
  });
  ui.fishDiseaseSearch.addEventListener('input', () => {
    state.pagination.fishDisease = 1;
    renderFishDiseaseTable();
  });
  ui.plantDiseaseSearch.addEventListener('input', () => {
    state.pagination.plantDisease = 1;
    renderPlantDiseaseTable();
  });
  ui.requestSearch.addEventListener('input', () => {
    state.pagination.requests = 1;
    renderRequestsTable();
  });
  ui.userSearch.addEventListener('input', () => {
    state.pagination.users = 1;
    renderUsersTable();
  });

  bindPagination('fish');
  bindPagination('plant');
  bindPagination('algae');
  bindPagination('fishDisease');
  bindPagination('plantDisease');
  bindPagination('requests');
  bindPagination('users');

  ui.fishTableBody.addEventListener('click', (event) => handleTableAction(event, 'fish'));
  ui.plantTableBody.addEventListener('click', (event) => handleTableAction(event, 'plant'));
  ui.algaeTableBody.addEventListener('click', (event) => handleTableAction(event, 'algae'));
  ui.fishDiseaseTableBody.addEventListener('click', (event) =>
    handleTableAction(event, 'fishDisease')
  );
  ui.plantDiseaseTableBody.addEventListener('click', (event) =>
    handleTableAction(event, 'plantDisease')
  );
  ui.requestsTableBody.addEventListener('click', (event) => handleTableAction(event, 'requests'));
  ui.usersTableBody.addEventListener('click', (event) => handleTableAction(event, 'users'));
}

function handleSaveConfig() {
  const config = readConfigFromInputs();
  const missing = Object.entries(config)
    .filter(([, value]) => !String(value || '').trim())
    .map(([key]) => key);

  if (missing.length > 0) {
    setStatus(`Brakuje pol konfiguracji: ${missing.join(', ')}`, 'error');
    return;
  }

  saveConfig(config);
  setConfigCardVisible(false);
  setStatus('Konfiguracja zapisana. Lacze z Firebase...', 'info');
  initializeFirebase(config);
}

function handleClearConfig() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function initializeFirebase(config) {
  if (state.app) {
    setStatus('Konfiguracja jest juz aktywna. Odswiez strone, jesli chcesz ja zmienic.', 'info');
    return;
  }

  try {
    state.app = initializeApp(config);
    state.auth = getAuth(state.app);
    state.db = getFirestore(state.app);

    show(ui.authCard, true);
    setStatus('Polaczono z Firebase. Zaloguj sie kontem admina.', 'ok');

    onAuthStateChanged(state.auth, async (user) => {
      state.user = user || null;
      state.isAdmin = false;

      if (!user) {
        show(ui.authCard, true);
        show(ui.authLogoutBtn, false);
        show(ui.panelCard, false);
        show(ui.editorCard, false);
        setAdminBadge(false);
        ui.sessionMeta.textContent = '-';
        setStatus('Nie jestes zalogowany.', 'info');
        return;
      }

      try {
        const tokenResult = await user.getIdTokenResult(true);
        state.isAdmin = tokenResult.claims.admin === true;

        if (!state.isAdmin) {
          show(ui.authCard, true);
          show(ui.authLogoutBtn, true);
          show(ui.panelCard, false);
          show(ui.editorCard, false);
          setAdminBadge(false);
          ui.sessionMeta.textContent = `${user.email || user.uid} (bez roli admin)`;
          setStatus('To konto nie ma roli admin. Nadaj custom claim `admin: true`.', 'error');
          return;
        }

        show(ui.authCard, false);
        show(ui.authLogoutBtn, false);
        show(ui.panelCard, true);
        setAdminBadge(true);
        ui.sessionMeta.textContent = `${user.email || user.uid} (admin)`;
        await loadAllAdminData();
      } catch (error) {
        show(ui.authCard, true);
        show(ui.authLogoutBtn, true);
        show(ui.panelCard, false);
        show(ui.editorCard, false);
        setAdminBadge(false);
        setStatus(formatError('Nie udalo sie zweryfikowac roli admin', error), 'error');
      }
    });
  } catch (error) {
    state.app = null;
    state.auth = null;
    state.db = null;
    setStatus(formatError('Nie udalo sie uruchomic Firebase', error), 'error');
  }
}

async function handleLogin() {
  if (!state.auth) {
    setStatus('Najpierw zapisz konfiguracje Firebase.', 'error');
    return;
  }

  const email = ui.loginEmail.value.trim();
  const password = ui.loginPassword.value;

  if (!email || !password) {
    setStatus('Podaj email i haslo.', 'error');
    return;
  }

  try {
    await signInWithEmailAndPassword(state.auth, email, password);
    ui.loginPassword.value = '';
    setStatus('Logowanie zakonczone.', 'ok');
  } catch (error) {
    setStatus(formatError('Logowanie nie powiodlo sie', error), 'error');
  }
}

async function handleLogout() {
  if (!state.auth) {
    return;
  }

  try {
    await signOut(state.auth);
    setStatus('Wylogowano.', 'info');
  } catch (error) {
    setStatus(formatError('Nie udalo sie wylogowac', error), 'error');
  }
}

async function loadAllAdminData() {
  if (!state.db || !state.isAdmin) {
    return;
  }

  setStatus('Pobieram dane panelu...', 'info');
  await Promise.all([loadCatalogs(), loadRequests(), loadUsersAndSubscriptions()]);
  renderAllTables();
  setStatus('Dane panelu sa aktualne.', 'ok');
}

async function loadCatalogs() {
  state.fish = await safeLoadCollection(COLLECTIONS.fish, sortByCommonName);
  state.plant = await safeLoadCollection(COLLECTIONS.plant, sortByCommonName);
  state.algae = await safeLoadCollection(COLLECTIONS.algae, sortByAlgae);
  state.fishDisease = await safeLoadCollection(
    COLLECTIONS.fishDisease,
    sortByDisease
  );
  state.plantDisease = await safeLoadCollection(
    COLLECTIONS.plantDisease,
    sortByDisease
  );
}

async function loadRequests() {
  const [fishRequests, plantRequests] = await Promise.all([
    safeLoadCollection(COLLECTIONS.fishRequests, sortByCreatedAtDesc),
    safeLoadCollection(COLLECTIONS.plantRequests, sortByCreatedAtDesc),
  ]);

  state.requests = [
    ...fishRequests.map((item) => ({ ...item, requestType: 'fish' })),
    ...plantRequests.map((item) => ({ ...item, requestType: 'plant' })),
  ].sort(sortByCreatedAtDesc);
}

async function safeLoadCollection(collectionName, sorter) {
  try {
    const snapshot = await getDocs(collection(state.db, collectionName));
    return snapshot.docs
      .map((entry) => ({ id: entry.id, ...entry.data() }))
      .sort(sorter);
  } catch (error) {
    setStatus(formatError(`Blad pobierania ${collectionName}`, error), 'error');
    return [];
  }
}

async function loadUsersAndSubscriptions() {
  if (!state.db || !state.isAdmin) {
    return;
  }

  const userIds = new Set();
  const sourceCountsByUid = new Map();
  const emailByUid = new Map();
  const rememberEmail = (uidValue, emailValue) => {
    const uid = String(uidValue ?? '').trim();
    const email = String(emailValue ?? '').trim();
    if (!uid || !email) {
      return;
    }
    if (!emailByUid.has(uid)) {
      emailByUid.set(uid, email);
    }
  };

  for (const collectionName of USER_ID_SOURCE_COLLECTIONS) {
    try {
      const snapshot = await getDocs(collection(state.db, collectionName));
      snapshot.docs.forEach((item) => {
        const data = item.data();
        const uid = String(data?.userId ?? '').trim();
        if (!uid) {
          return;
        }

        userIds.add(uid);
        const counts = sourceCountsByUid.get(uid) ?? {};
        counts[collectionName] = (counts[collectionName] ?? 0) + 1;
        sourceCountsByUid.set(uid, counts);
      });
    } catch (error) {
      setStatus(
        formatError(`Nie udalo sie odczytac ${collectionName} (sprawdz reguly admin read)`, error),
        'error'
      );
    }
  }

  for (const collectionName of [COLLECTIONS.fishRequests, COLLECTIONS.plantRequests]) {
    try {
      const snapshot = await getDocs(collection(state.db, collectionName));
      snapshot.docs.forEach((item) => {
        const data = item.data();
        const uid = String(data?.userId ?? '').trim();
        if (!uid) {
          return;
        }

        userIds.add(uid);
        rememberEmail(uid, data?.userEmail);
      });
    } catch (error) {
      setStatus(
        formatError(`Nie udalo sie odczytac ${collectionName} (dla emaili uzytkownikow)`, error),
        'error'
      );
    }
  }

  const subscriptionsByUid = new Map();
  try {
    const subscriptionSnapshot = await getDocs(
      collection(state.db, COLLECTIONS.userSubscriptions)
    );

    subscriptionSnapshot.docs.forEach((entry) => {
      const data = entry.data() || {};
      const uid = String(data.userId ?? entry.id).trim();
      if (!uid) {
        return;
      }

      userIds.add(uid);
      rememberEmail(uid, data.userEmail);
      subscriptionsByUid.set(uid, { id: entry.id, ...data, userId: uid });
    });
  } catch (error) {
    setStatus(
      formatError('Nie udalo sie odczytac userSubscriptions (sprawdz reguly)', error),
      'error'
    );
  }

  state.subscriptionsByUid = subscriptionsByUid;
  state.users = Array.from(userIds)
    .map((uid) => {
      const subscription = subscriptionsByUid.get(uid) || {};
      const sourceCounts = sourceCountsByUid.get(uid) || {};
      const email =
        String(subscription.userEmail ?? '').trim() ||
        String(emailByUid.get(uid) ?? '').trim();

      return {
        uid,
        email,
        tier: String(subscription.tier ?? 'free').trim() || 'free',
        status: String(subscription.status ?? 'active').trim() || 'active',
        source: String(subscription.source ?? 'system').trim() || 'system',
        startedAt: String(subscription.startedAt ?? '').trim(),
        expiresAt: String(subscription.expiresAt ?? '').trim(),
        renewsAt: String(subscription.renewsAt ?? '').trim(),
        lastValidatedAt: String(subscription.lastValidatedAt ?? '').trim(),
        planVersion: Number.isFinite(Number(subscription.planVersion))
          ? Number(subscription.planVersion)
          : 3,
        sourceCounts,
      };
    })
    .sort((a, b) => a.uid.localeCompare(b.uid));
}

function renderAllTables() {
  renderFishTable();
  renderPlantTable();
  renderAlgaeTable();
  renderFishDiseaseTable();
  renderPlantDiseaseTable();
  renderRequestsTable();
  renderUsersTable();
}

function renderFishTable() {
  const q = ui.fishSearch.value.trim().toLowerCase();
  const filtered = state.fish
    .filter((item) => !q || `${item.commonName || ''} ${item.latinName || ''}`.toLowerCase().includes(q))
  const { pageItems, page, pageCount } = paginate('fish', filtered);
  const rows = pageItems
    .map((item) => {
      const rangePh = `${fmtNum(item.phMin)}-${fmtNum(item.phMax)}`;
      const rangeGh = `${fmtNum(item.ghMin)}-${fmtNum(item.ghMax)}`;
      const rangeTemp = `${fmtNum(item.tempMin)}-${fmtNum(item.tempMax)}`;

      return `
        <tr>
          <td>${esc(item.commonName)}</td>
          <td class="mono">${esc(item.latinName)}</td>
          <td>${esc(rangePh)}</td>
          <td>${esc(rangeGh)}</td>
          <td>${esc(rangeTemp)}</td>
          <td>${esc(fmtNum(item.minLiters))}</td>
          <td>${item.isSchooling ? 'tak' : 'nie'}</td>
          <td>${esc(fmtNum(item.minGroupSize))}</td>
          <td>${esc(item.aggressionLevel || 'peaceful')}</td>
          <td>${esc(item.source || '')}</td>
          <td class="wrap-cell">${esc(item.notes || '')}</td>
          <td class="mono">${esc(item.imagePreviewUrl || '')}</td>
          <td class="mono">${esc(item.imageUrl || '')}</td>
          <td class="mono">${esc(item.imageLink || '')}</td>
          <td class="mono">${esc(item.commonNameNormalized || '')}</td>
          <td class="mono">${esc(item.latinNameNormalized || '')}</td>
          <td>
            <div class="table-actions">
              <button class="btn-mini" data-action="open-image" data-url="${esc(resolveBestImageUrl(item))}">Podglad</button>
              <button class="btn-mini" data-action="edit" data-id="${item.id}">Edytuj</button>
              <button class="btn-mini danger" data-action="delete" data-id="${item.id}">Usun</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  ui.fishTableBody.innerHTML = rows || '<tr><td colspan="17">Brak wynikow.</td></tr>';
  updatePaginationUi('fish', page, pageCount);
}

function renderPlantTable() {
  const q = ui.plantSearch.value.trim().toLowerCase();
  const filtered = state.plant
    .filter((item) => !q || `${item.commonName || ''} ${item.latinName || ''}`.toLowerCase().includes(q))
  const { pageItems, page, pageCount } = paginate('plant', filtered);
  const rows = pageItems
    .map((item) => {
      const rangePh = `${fmtNum(item.phMin)}-${fmtNum(item.phMax)}`;
      const rangeGh = `${fmtNum(item.ghMin)}-${fmtNum(item.ghMax)}`;
      const rangeTemp = `${fmtNum(item.tempMin)}-${fmtNum(item.tempMax)}`;

      return `
        <tr>
          <td>${esc(item.commonName)}</td>
          <td class="mono">${esc(item.latinName)}</td>
          <td>${esc(rangePh)}</td>
          <td>${esc(rangeGh)}</td>
          <td>${esc(rangeTemp)}</td>
          <td>${esc(fmtNum(item.minLiters))}</td>
          <td>${esc(item.source || '')}</td>
          <td class="wrap-cell">${esc(item.notes || '')}</td>
          <td class="mono">${esc(item.imagePreviewUrl || '')}</td>
          <td class="mono">${esc(item.imageUrl || '')}</td>
          <td class="mono">${esc(item.imageLink || '')}</td>
          <td class="mono">${esc(item.commonNameNormalized || '')}</td>
          <td class="mono">${esc(item.latinNameNormalized || '')}</td>
          <td>
            <div class="table-actions">
              <button class="btn-mini" data-action="open-image" data-url="${esc(resolveBestImageUrl(item))}">Podglad</button>
              <button class="btn-mini" data-action="edit" data-id="${item.id}">Edytuj</button>
              <button class="btn-mini danger" data-action="delete" data-id="${item.id}">Usun</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  ui.plantTableBody.innerHTML = rows || '<tr><td colspan="14">Brak wynikow.</td></tr>';
  updatePaginationUi('plant', page, pageCount);
}

function renderAlgaeTable() {
  const q = ui.algaeSearch.value.trim().toLowerCase();
  const filtered = state.algae
    .filter((item) => !q || `${item.name || ''} ${item.id || ''}`.toLowerCase().includes(q))
  const { pageItems, page, pageCount } = paginate('algae', filtered);
  const rows = pageItems
    .map((item) => {
      const symptomSummary = Array.isArray(item.symptoms) ? item.symptoms.join(', ') : '';

      return `
        <tr>
          <td class="mono">${esc(item.id)}</td>
          <td>${esc(item.name || '')}</td>
          <td>${esc(item.severity || '')}</td>
          <td class="wrap-cell">${esc(symptomSummary)}</td>
          <td>${esc(item.suggestedRemedy || '')}</td>
          <td>${esc(item.imageSourceLabel || '')}</td>
          <td class="mono">${esc(item.imagePreviewUrl || '')}</td>
          <td class="mono">${esc(item.imageUrl || '')}</td>
          <td class="mono">${esc(item.imageLink || '')}</td>
          <td>
            <div class="table-actions">
              <button class="btn-mini" data-action="open-image" data-url="${esc(resolveBestImageUrl(item))}">Podglad</button>
              <button class="btn-mini" data-action="edit" data-id="${item.id}">Edytuj</button>
              <button class="btn-mini danger" data-action="delete" data-id="${item.id}">Usun</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  ui.algaeTableBody.innerHTML = rows || '<tr><td colspan="10">Brak wynikow.</td></tr>';
  updatePaginationUi('algae', page, pageCount);
}

function renderFishDiseaseTable() {
  const q = ui.fishDiseaseSearch.value.trim().toLowerCase();
  const filtered = state.fishDisease.filter(
    (item) =>
      !q || `${item.name || ''} ${item.id || ''}`.toLowerCase().includes(q)
  );
  const { pageItems, page, pageCount } = paginate('fishDisease', filtered);
  const rows = pageItems
    .map((item) => {
      const symptomSummary = Array.isArray(item.symptoms)
        ? item.symptoms.join(', ')
        : '';

      return `
        <tr>
          <td class="mono">${esc(item.id)}</td>
          <td>${esc(item.name || '')}</td>
          <td>${esc(item.severity || '')}</td>
          <td class="wrap-cell">${esc(symptomSummary)}</td>
          <td>${esc(item.suggestedRemedy || '')}</td>
          <td>${esc(item.imageSourceLabel || '')}</td>
          <td>
            <div class="table-actions">
              <button class="btn-mini" data-action="edit" data-id="${item.id}">Edytuj</button>
              <button class="btn-mini danger" data-action="delete" data-id="${item.id}">Usun</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  ui.fishDiseaseTableBody.innerHTML = rows || '<tr><td colspan="7">Brak wynikow.</td></tr>';
  updatePaginationUi('fishDisease', page, pageCount);
}

function renderPlantDiseaseTable() {
  const q = ui.plantDiseaseSearch.value.trim().toLowerCase();
  const filtered = state.plantDisease.filter(
    (item) =>
      !q || `${item.name || ''} ${item.id || ''}`.toLowerCase().includes(q)
  );
  const { pageItems, page, pageCount } = paginate('plantDisease', filtered);
  const rows = pageItems
    .map((item) => {
      const symptomSummary = Array.isArray(item.symptoms)
        ? item.symptoms.join(', ')
        : '';

      return `
        <tr>
          <td class="mono">${esc(item.id)}</td>
          <td>${esc(item.name || '')}</td>
          <td>${esc(item.severity || '')}</td>
          <td class="wrap-cell">${esc(symptomSummary)}</td>
          <td>${esc(item.suggestedRemedy || '')}</td>
          <td>${esc(item.imageSourceLabel || '')}</td>
          <td>
            <div class="table-actions">
              <button class="btn-mini" data-action="edit" data-id="${item.id}">Edytuj</button>
              <button class="btn-mini danger" data-action="delete" data-id="${item.id}">Usun</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  ui.plantDiseaseTableBody.innerHTML = rows || '<tr><td colspan="7">Brak wynikow.</td></tr>';
  updatePaginationUi('plantDisease', page, pageCount);
}

function renderRequestsTable() {
  const q = ui.requestSearch.value.trim().toLowerCase();
  const filtered = state.requests.filter((item) => {
    if (!q) {
      return true;
    }
    return `${item.commonName || ''} ${item.latinName || ''} ${item.userEmail || ''} ${item.userId || ''} ${item.tankName || ''}`
      .toLowerCase()
      .includes(q);
  });
  const { pageItems, page, pageCount } = paginate('requests', filtered);
  const rows = pageItems
    .map((item) => {
      const typeLabel = item.requestType === 'fish' ? 'ryba' : 'roslina';
      const status = String(item.status || 'new').trim() || 'new';
      return `
        <tr>
          <td>${esc(typeLabel)}</td>
          <td>${esc(item.commonName || '')}</td>
          <td class="mono">${esc(item.latinName || '')}</td>
          <td>${esc(status)}</td>
          <td class="mono">${esc(item.userId || '')}</td>
          <td>${esc(item.userEmail || '')}</td>
          <td>${esc(item.tankName || '')}</td>
          <td>${esc(formatDateTime(item.createdAt))}</td>
          <td>
            <div class="table-actions">
              <button class="btn-mini accept" data-action="request-accept" data-id="${item.id}" data-kind="${item.requestType}">Akceptuj</button>
              <button class="btn-mini reject" data-action="request-reject" data-id="${item.id}" data-kind="${item.requestType}">Odrzuc</button>
              <button class="btn-mini" data-action="request-new" data-id="${item.id}" data-kind="${item.requestType}">Ustaw new</button>
              <button class="btn-mini danger" data-action="request-delete" data-id="${item.id}" data-kind="${item.requestType}">Usun</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  ui.requestsTableBody.innerHTML = rows || '<tr><td colspan="9">Brak sugestii.</td></tr>';
  updatePaginationUi('requests', page, pageCount);
}

function renderUsersTable() {
  const q = ui.userSearch.value.trim().toLowerCase();
  const filtered = state.users
    .filter((item) =>
      !q || `${item.uid || ''} ${item.email || ''} ${item.tier || ''} ${item.status || ''}`.toLowerCase().includes(q)
    )
  const { pageItems, page, pageCount } = paginate('users', filtered);
  const rows = pageItems
    .map((item) => {
      return `
        <tr>
          <td class="mono">${esc(item.uid)}</td>
          <td>${esc(item.email || '')}</td>
          <td>${esc(item.tier || 'free')}</td>
          <td>${esc(item.status || 'active')}</td>
          <td>${esc(item.source || 'system')}</td>
          <td>${esc(item.startedAt || '-')}</td>
          <td>${esc(item.expiresAt || '-')}</td>
          <td>${esc(item.renewsAt || '-')}</td>
          <td>${esc(item.lastValidatedAt || '-')}</td>
          <td>${esc(String(item.planVersion ?? 3))}</td>
          <td>
            <div class="table-actions">
              <button class="btn-mini" data-action="edit-sub" data-id="${item.uid}">Edytuj plan</button>
              <button class="btn-mini danger" data-action="clear-sub" data-id="${item.uid}">Usun plan</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  ui.usersTableBody.innerHTML = rows || '<tr><td colspan="11">Brak danych o uzytkownikach.</td></tr>';
  updatePaginationUi('users', page, pageCount);
}

function bindPagination(key) {
  const prev = ui[`${key}PrevBtn`];
  const next = ui[`${key}NextBtn`];

  prev.addEventListener('click', () => {
    state.pagination[key] = Math.max(1, Number(state.pagination[key] || 1) - 1);
    renderTableByKey(key);
  });

  next.addEventListener('click', () => {
    state.pagination[key] = Number(state.pagination[key] || 1) + 1;
    renderTableByKey(key);
  });
}

function paginate(key, items) {
  const safeItems = Array.isArray(items) ? items : [];
  const pageCount = Math.max(1, Math.ceil(safeItems.length / PAGE_SIZE));
  const requestedPage = Number(state.pagination[key] || 1);
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  state.pagination[key] = page;

  const start = (page - 1) * PAGE_SIZE;
  const pageItems = safeItems.slice(start, start + PAGE_SIZE);

  return { pageItems, page, pageCount };
}

function updatePaginationUi(key, page, pageCount) {
  const prev = ui[`${key}PrevBtn`];
  const next = ui[`${key}NextBtn`];
  const info = ui[`${key}PageInfo`];

  info.textContent = `Strona ${page}/${pageCount}`;
  prev.disabled = page <= 1;
  next.disabled = page >= pageCount;
}

function renderTableByKey(key) {
  if (key === 'fish') return renderFishTable();
  if (key === 'plant') return renderPlantTable();
  if (key === 'algae') return renderAlgaeTable();
  if (key === 'fishDisease') return renderFishDiseaseTable();
  if (key === 'plantDisease') return renderPlantDiseaseTable();
  if (key === 'requests') return renderRequestsTable();
  if (key === 'users') return renderUsersTable();
}

function switchSection(section) {
  state.activeSection = ['fish', 'plant', 'algae', 'fishDisease', 'plantDisease', 'requests', 'users'].includes(section)
    ? section
    : 'fish';

  ui.sectionTabs.forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.section === state.activeSection);
  });

  ui.sectionPanels.forEach((panel) => {
    show(panel, panel.dataset.panel === state.activeSection);
  });
}

function handleTableAction(event, section) {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const url = String(button.dataset.url || '').trim();
  const id = button.dataset.id;

  if (action === 'open-image') {
    openImageLink(url);
    return;
  }

  if (
    section === 'fish' ||
    section === 'plant' ||
    section === 'algae' ||
    section === 'fishDisease' ||
    section === 'plantDisease'
  ) {
    const items = state[section] || [];
    const item = items.find((entry) => String(entry.id) === String(id));
    if (!item) {
      return;
    }

    if (action === 'edit') {
      openEditor(section, item);
      return;
    }

    if (action === 'delete') {
      deleteCatalogItem(section, item);
    }

    return;
  }

  if (section === 'users') {
    const user = state.users.find((entry) => String(entry.uid) === String(id));
    if (!user) {
      return;
    }

    if (action === 'edit-sub') {
      openEditor('users', user);
      return;
    }

    if (action === 'clear-sub') {
      deleteSubscription(user.uid);
    }
  }

  if (section === 'requests') {
    const kind = button.dataset.kind === 'plant' ? 'plant' : 'fish';
    if (action === 'request-accept') {
      updateRequestStatus(kind, id, 'accepted');
      return;
    }
    if (action === 'request-reject') {
      updateRequestStatus(kind, id, 'rejected');
      return;
    }
    if (action === 'request-new') {
      updateRequestStatus(kind, id, 'new');
      return;
    }
    if (action === 'request-delete') {
      deleteRequest(kind, id);
    }
  }
}

function openEditor(section, item = null) {
  state.editor.section = section;
  state.editor.mode = item ? 'edit' : 'create';
  state.editor.id = item?.id || item?.uid || null;

  ui.catalogForm.reset();

  show(ui.stockFields, section === 'fish' || section === 'plant');
  show(ui.fishExtraFields, section === 'fish');
  show(ui.algaeFields, section === 'algae');
  show(ui.diseaseFields, section === 'fishDisease' || section === 'plantDisease');
  show(ui.userSubscriptionFields, section === 'users');

  if (section === 'fish' || section === 'plant') {
    ui.editorTitle.textContent =
      state.editor.mode === 'create'
        ? `Dodaj ${section === 'fish' ? 'rybe' : 'rosline'}`
        : `Edytuj ${section === 'fish' ? 'rybe' : 'rosline'}`;
    ui.editorHint.textContent = `Kolekcja: ${COLLECTIONS[section]}`;

    ui.fCommonName.value = item?.commonName || '';
    ui.fLatinName.value = item?.latinName || '';
    ui.fPhMin.value = toInputNumber(item?.phMin);
    ui.fPhMax.value = toInputNumber(item?.phMax);
    ui.fGhMin.value = toInputNumber(item?.ghMin);
    ui.fGhMax.value = toInputNumber(item?.ghMax);
    ui.fTempMin.value = toInputNumber(item?.tempMin);
    ui.fTempMax.value = toInputNumber(item?.tempMax);
    ui.fMinLiters.value = toInputNumber(item?.minLiters);
    ui.fSource.value = normalizeCatalogSource(item?.source);
    ui.fImagePreviewUrl.value = item?.imagePreviewUrl || '';
    ui.fImageUrl.value = item?.imageUrl || '';
    ui.fImageLink.value = item?.imageLink || '';
    ui.fNotes.value = item?.notes || '';

    ui.fAggressionLevel.value = item?.aggressionLevel || 'peaceful';
    ui.fMinGroupSize.value = toInputNumber(item?.minGroupSize);
    ui.fIsSchooling.checked = Boolean(item?.isSchooling);
  }

  if (section === 'algae') {
    ui.editorTitle.textContent = state.editor.mode === 'create' ? 'Dodaj glon' : 'Edytuj glon';
    ui.editorHint.textContent = `Kolekcja: ${COLLECTIONS.algae}`;

    ui.aId.value = item?.id || '';
    ui.aName.value = item?.name || '';
    ui.aSeverity.value = normalizeSeverity(item?.severity);
    ui.aSuggestedRemedy.value = item?.suggestedRemedy || '';
    ui.aImageSourceLabel.value = item?.imageSourceLabel || '';
    ui.aSymptoms.value = Array.isArray(item?.symptoms) ? item.symptoms.join(',') : '';
    ui.aImageUrl.value = item?.imageUrl || '';
    ui.aImagePreviewUrl.value = item?.imagePreviewUrl || '';
    ui.aImageLink.value = item?.imageLink || '';
    ui.aImageFallbackUrl.value = item?.imageFallbackUrl || '';
    ui.aImageFallbackPreviewUrl.value = item?.imageFallbackPreviewUrl || '';
    ui.aSummary.value = item?.summary || '';
    ui.aCauses.value = Array.isArray(item?.causes) ? item.causes.join('\n') : '';
    ui.aRemoveActions.value = Array.isArray(item?.removeActions)
      ? item.removeActions.join('\n')
      : '';
    ui.aPreventionActions.value = Array.isArray(item?.preventionActions)
      ? item.preventionActions.join('\n')
      : '';
    ui.aCaution.value = item?.caution || '';
  }

  if (section === 'fishDisease' || section === 'plantDisease') {
    const sectionLabel = section === 'fishDisease' ? 'chorobe ryb' : 'chorobe roslin';
    ui.editorTitle.textContent =
      state.editor.mode === 'create' ? `Dodaj ${sectionLabel}` : `Edytuj ${sectionLabel}`;
    ui.editorHint.textContent = `Kolekcja: ${COLLECTIONS[section]}`;

    ui.dId.value = item?.id || '';
    ui.dName.value = item?.name || '';
    ui.dSeverity.value = normalizeSeverity(item?.severity);
    ui.dSuggestedRemedy.value = item?.suggestedRemedy || '';
    ui.dImageSourceLabel.value = item?.imageSourceLabel || '';
    ui.dSymptoms.value = Array.isArray(item?.symptoms) ? item.symptoms.join(',') : '';
    ui.dImageUrl.value = item?.imageUrl || '';
    ui.dImagePreviewUrl.value = item?.imagePreviewUrl || '';
    ui.dImageFallbackUrl.value = item?.imageFallbackUrl || '';
    ui.dImageFallbackPreviewUrl.value = item?.imageFallbackPreviewUrl || '';
    ui.dSummary.value = item?.summary || '';
    ui.dTreatment.value = Array.isArray(item?.treatment) ? item.treatment.join('\n') : '';
    ui.dCaution.value = item?.caution || '';
  }

  if (section === 'users') {
    ui.editorTitle.textContent = 'Edytuj plan subskrypcji';
    ui.editorHint.textContent = `Kolekcja: ${COLLECTIONS.userSubscriptions}`;

    ui.uUid.value = item?.uid || '';
    ui.uEmail.value = item?.email || '';
    ui.uTier.value = normalizeTier(item?.tier || 'free');
    ui.uStatus.value = normalizeSubscriptionStatus(item?.status || 'active');
    ui.uSource.value = normalizeSubscriptionSource(item?.source || 'admin');
    ui.uStartedAt.value = item?.startedAt || '';
    ui.uExpiresAt.value = item?.expiresAt || '';
    ui.uRenewsAt.value = item?.renewsAt || '';
    ui.uLastValidatedAt.value = item?.lastValidatedAt || '';
    ui.uPlanVersion.value = toInputNumber(item?.planVersion || 3);
  }

  show(ui.editorCard, true);
  ui.editorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeEditor() {
  show(ui.editorCard, false);
}

async function handleEditorSave(event) {
  event.preventDefault();

  if (!state.db || !state.isAdmin) {
    setStatus('Brak uprawnien admina.', 'error');
    return;
  }

  const section = state.editor.section;

  try {
    if (section === 'fish' || section === 'plant') {
      const payload = buildStockPayload(section);

      if (state.editor.mode === 'create') {
        await addDoc(collection(state.db, COLLECTIONS[section]), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(state.db, COLLECTIONS[section], state.editor.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
      }

      await loadCatalogs();
      renderAllTables();
      closeEditor();
      setStatus('Zapisano wpis katalogu.', 'ok');
      return;
    }

    if (section === 'algae') {
      const payload = buildAlgaePayload();
      const algaeId = payload.id;

      if (!algaeId) {
        throw new Error('Id glonu jest wymagane.');
      }

      if (state.editor.mode === 'create') {
        await setDoc(doc(state.db, COLLECTIONS.algae, algaeId), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(state.db, COLLECTIONS.algae, state.editor.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
      }

      await loadCatalogs();
      renderAllTables();
      closeEditor();
      setStatus('Zapisano wpis glonow.', 'ok');
      return;
    }

    if (section === 'fishDisease' || section === 'plantDisease') {
      const payload = buildDiseasePayload();
      const diseaseId = payload.id;

      if (!diseaseId) {
        throw new Error('Id choroby jest wymagane.');
      }

      if (state.editor.mode === 'create') {
        await setDoc(doc(state.db, COLLECTIONS[section], diseaseId), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(state.db, COLLECTIONS[section], state.editor.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
      }

      await loadCatalogs();
      renderAllTables();
      closeEditor();
      setStatus('Zapisano wpis katalogu chorob.', 'ok');
      return;
    }

    if (section === 'users') {
      const payload = buildUserSubscriptionPayload();

      await setDoc(doc(state.db, COLLECTIONS.userSubscriptions, payload.userId), {
        ...payload,
        updatedAt: serverTimestamp(),
      });

      await loadUsersAndSubscriptions();
      renderUsersTable();
      closeEditor();
      setStatus('Zapisano plan subskrypcji uzytkownika.', 'ok');
    }
  } catch (error) {
    setStatus(formatError('Nie udalo sie zapisac', error), 'error');
  }
}

async function deleteCatalogItem(section, item) {
  const collectionName = COLLECTIONS[section];
  const ok = confirm(`Usunac wpis \"${item.commonName || item.name || item.id}\" z kolekcji ${collectionName}?`);
  if (!ok) {
    return;
  }

  try {
    await deleteDoc(doc(state.db, collectionName, item.id));
    await loadCatalogs();
    renderAllTables();
    setStatus('Wpis usuniety.', 'ok');
  } catch (error) {
    setStatus(formatError('Nie udalo sie usunac wpisu', error), 'error');
  }
}

async function deleteSubscription(uid) {
  const ok = confirm(`Usunac dokument subskrypcji dla UID ${uid}?`);
  if (!ok) {
    return;
  }

  try {
    await deleteDoc(doc(state.db, COLLECTIONS.userSubscriptions, uid));
    await loadUsersAndSubscriptions();
    renderUsersTable();
    setStatus('Subskrypcja usunieta.', 'ok');
  } catch (error) {
    setStatus(formatError('Nie udalo sie usunac subskrypcji', error), 'error');
  }
}

async function updateRequestStatus(kind, requestId, nextStatus) {
  const collectionName =
    kind === 'plant' ? COLLECTIONS.plantRequests : COLLECTIONS.fishRequests;

  try {
    await updateDoc(doc(state.db, collectionName, requestId), {
      status: nextStatus,
      reviewedAt: serverTimestamp(),
      reviewedBy: state.user?.uid || null,
    });
    await loadRequests();
    renderRequestsTable();
    setStatus(`Zaktualizowano status sugestii na "${nextStatus}".`, 'ok');
  } catch (error) {
    setStatus(formatError('Nie udalo sie zaktualizowac sugestii', error), 'error');
  }
}

async function deleteRequest(kind, requestId) {
  const collectionName =
    kind === 'plant' ? COLLECTIONS.plantRequests : COLLECTIONS.fishRequests;
  const ok = confirm(`Usunac sugestie ${requestId}?`);
  if (!ok) {
    return;
  }

  try {
    await deleteDoc(doc(state.db, collectionName, requestId));
    await loadRequests();
    renderRequestsTable();
    setStatus('Sugestia usunieta.', 'ok');
  } catch (error) {
    setStatus(formatError('Nie udalo sie usunac sugestii', error), 'error');
  }
}

function buildStockPayload(section) {
  const commonName = ui.fCommonName.value.trim();
  const latinName = ui.fLatinName.value.trim();

  if (!commonName || !latinName) {
    throw new Error('Nazwa potoczna i nazwa lacinska sa wymagane.');
  }

  const phMin = asNumber(ui.fPhMin.value, 'pH min');
  const phMax = asNumber(ui.fPhMax.value, 'pH max');
  const ghMin = asNumber(ui.fGhMin.value, 'GH min');
  const ghMax = asNumber(ui.fGhMax.value, 'GH max');
  const tempMin = asNumber(ui.fTempMin.value, 'Temp min');
  const tempMax = asNumber(ui.fTempMax.value, 'Temp max');
  const minLiters = asNumber(ui.fMinLiters.value, 'Min litraz', { integer: true });

  if (phMin > phMax || ghMin > ghMax || tempMin > tempMax) {
    throw new Error('W kazdym zakresie wartosc min musi byc <= max.');
  }

  const payload = {
    commonName,
    commonNameNormalized: normalizeText(commonName),
    latinName,
    latinNameNormalized: normalizeText(latinName),
    phMin,
    phMax,
    ghMin,
    ghMax,
    tempMin,
    tempMax,
    minLiters,
    source: normalizeCatalogSource(ui.fSource.value),
    imagePreviewUrl: ui.fImagePreviewUrl.value.trim(),
    imageUrl: ui.fImageUrl.value.trim(),
    imageLink: ui.fImageLink.value.trim(),
    notes: ui.fNotes.value.trim(),
  };

  if (section === 'fish') {
    const isSchooling = Boolean(ui.fIsSchooling.checked);
    const rawMinGroup = ui.fMinGroupSize.value.trim();
    const minGroupSize = rawMinGroup
      ? asNumber(rawMinGroup, 'Minimalna grupa', { integer: true })
      : isSchooling
        ? 6
        : 0;

    payload.isSchooling = isSchooling;
    payload.minGroupSize = isSchooling ? Math.max(1, Number(minGroupSize)) : 0;
    payload.aggressionLevel = normalizeAggressionLevel(ui.fAggressionLevel.value.trim() || 'peaceful');
  }

  return payload;
}

function buildAlgaePayload() {
  const id = ui.aId.value.trim();
  const name = ui.aName.value.trim();
  const severity = normalizeSeverity(ui.aSeverity.value);
  const summary = ui.aSummary.value.trim();

  if (!id || !name || !summary) {
    throw new Error('Dla glonow wymagane sa: id, nazwa i podsumowanie.');
  }

  return {
    id,
    name,
    severity,
    summary,
    suggestedRemedy: ui.aSuggestedRemedy.value.trim(),
    imageSourceLabel: ui.aImageSourceLabel.value.trim(),
    symptoms: splitByComma(ui.aSymptoms.value),
    causes: splitByLines(ui.aCauses.value),
    removeActions: splitByLines(ui.aRemoveActions.value),
    preventionActions: splitByLines(ui.aPreventionActions.value),
    caution: ui.aCaution.value.trim(),
    imageUrl: ui.aImageUrl.value.trim(),
    imagePreviewUrl: ui.aImagePreviewUrl.value.trim(),
    imageLink: ui.aImageLink.value.trim(),
    imageFallbackUrl: ui.aImageFallbackUrl.value.trim(),
    imageFallbackPreviewUrl: ui.aImageFallbackPreviewUrl.value.trim(),
  };
}

function buildDiseasePayload() {
  const id = ui.dId.value.trim();
  const name = ui.dName.value.trim();
  const severity = normalizeSeverity(ui.dSeverity.value);
  const summary = ui.dSummary.value.trim();

  if (!id || !name || !summary) {
    throw new Error('Dla chorob wymagane sa: id, nazwa i podsumowanie.');
  }

  const treatment = splitByLines(ui.dTreatment.value);
  if (treatment.length === 0) {
    throw new Error('Dodaj przynajmniej 1 krok leczenia.');
  }

  return {
    id,
    name,
    severity,
    summary,
    suggestedRemedy: ui.dSuggestedRemedy.value.trim(),
    imageSourceLabel: ui.dImageSourceLabel.value.trim(),
    symptoms: splitByComma(ui.dSymptoms.value),
    treatment,
    caution: ui.dCaution.value.trim(),
    imageUrl: ui.dImageUrl.value.trim(),
    imagePreviewUrl: ui.dImagePreviewUrl.value.trim(),
    imageFallbackUrl: ui.dImageFallbackUrl.value.trim(),
    imageFallbackPreviewUrl: ui.dImageFallbackPreviewUrl.value.trim(),
  };
}

function buildUserSubscriptionPayload() {
  const userId = ui.uUid.value.trim();
  if (!userId) {
    throw new Error('UID uzytkownika jest wymagany.');
  }

  return {
    userId,
    userEmail: ui.uEmail.value.trim(),
    tier: normalizeTier(ui.uTier.value),
    status: normalizeSubscriptionStatus(ui.uStatus.value.trim()),
    source: normalizeSubscriptionSource(ui.uSource.value.trim()),
    startedAt: normalizeOptionalIso(ui.uStartedAt.value),
    expiresAt: normalizeOptionalIso(ui.uExpiresAt.value),
    renewsAt: normalizeOptionalIso(ui.uRenewsAt.value),
    lastValidatedAt: normalizeOptionalIso(ui.uLastValidatedAt.value),
    planVersion: Number.isFinite(Number(ui.uPlanVersion.value))
      ? Math.max(1, Math.round(Number(ui.uPlanVersion.value)))
      : 3,
  };
}

function readConfigFromInputs() {
  return {
    apiKey: ui.cfgApiKey.value.trim(),
    authDomain: ui.cfgAuthDomain.value.trim(),
    projectId: ui.cfgProjectId.value.trim(),
    storageBucket: ui.cfgStorageBucket.value.trim(),
    messagingSenderId: ui.cfgMessagingSenderId.value.trim(),
    appId: ui.cfgAppId.value.trim(),
  };
}

function writeConfigToInputs(config) {
  ui.cfgApiKey.value = config.apiKey || '';
  ui.cfgAuthDomain.value = config.authDomain || '';
  ui.cfgProjectId.value = config.projectId || '';
  ui.cfgStorageBucket.value = config.storageBucket || '';
  ui.cfgMessagingSenderId.value = config.messagingSenderId || '';
  ui.cfgAppId.value = config.appId || '';
}

function getResolvedConfig() {
  const localFileConfig = getLocalFileConfig();
  if (localFileConfig) {
    saveConfig(localFileConfig);
    return localFileConfig;
  }

  const savedConfig = loadConfig();
  if (savedConfig) {
    return savedConfig;
  }

  return null;
}

function getLocalFileConfig() {
  const source = globalThis.__AQUAMIND_ADMIN_FIREBASE_CONFIG__;
  if (!source || typeof source !== 'object') {
    return null;
  }

  const normalized = {
    apiKey: String(source.apiKey ?? '').trim(),
    authDomain: String(source.authDomain ?? '').trim(),
    projectId: String(source.projectId ?? '').trim(),
    storageBucket: String(source.storageBucket ?? '').trim(),
    messagingSenderId: String(source.messagingSenderId ?? '').trim(),
    appId: String(source.appId ?? '').trim(),
  };

  const missing = REQUIRED_CONFIG_KEYS.filter(
    (key) => !String(normalized[key] ?? '').trim()
  );

  return missing.length === 0 ? normalized : null;
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function setConfigCardVisible(shouldShow) {
  show(ui.configCard, shouldShow);
  ui.toggleConfigBtn.textContent = shouldShow ? 'Ukryj konfiguracje' : 'Konfiguracja';
}

function setAdminBadge(isActive) {
  if (isActive) {
    ui.adminStateBadge.textContent = 'Admin aktywny';
    ui.adminStateBadge.classList.remove('badge-error');
    ui.adminStateBadge.classList.add('badge-ok');
    return;
  }

  ui.adminStateBadge.textContent = 'Brak roli admin';
  ui.adminStateBadge.classList.remove('badge-ok');
  ui.adminStateBadge.classList.add('badge-error');
}

function setStatus(message, tone = 'info') {
  ui.status.textContent = message;

  if (tone === 'error') {
    ui.status.style.color = '#922b34';
    return;
  }

  if (tone === 'ok') {
    ui.status.style.color = '#0b6a56';
    return;
  }

  ui.status.style.color = '#214567';
}

function show(element, shouldShow) {
  if (!element) {
    return;
  }
  element.classList.toggle('hidden', !shouldShow);
}

function byId(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Brakuje elementu #${id}`);
  }
  return element;
}

function resolveBestImageUrl(item) {
  return String(
    item?.imageUrl ?? item?.imagePreviewUrl ?? item?.imageLink ?? ''
  ).trim();
}

function openImageLink(url) {
  const normalized = String(url ?? '').trim();
  if (!normalized) {
    setStatus('Brak linku do podgladu.', 'info');
    return;
  }

  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Nieprawidlowy protokol URL.');
    }
    window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
  } catch {
    setStatus('Niepoprawny link obrazu.', 'error');
  }
}

function splitByLines(value) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitByComma(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function asNumber(value, label, options = {}) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    throw new Error(`Pole "${label}" musi byc liczba.`);
  }

  if (options.integer && !Number.isInteger(numeric)) {
    throw new Error(`Pole "${label}" musi byc liczba calkowita.`);
  }

  return numeric;
}

function toInputNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : '';
}

function fmtNum(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : '-';
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeAggressionLevel(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'aggressive') return 'aggressive';
  if (normalized === 'semi-aggressive' || normalized === 'semi aggressive') return 'semi-aggressive';
  return 'peaceful';
}

function normalizeCatalogSource(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  const allowed = new Set(['manual', 'starter', 'expanded', 'community', 'imported']);
  return allowed.has(normalized) ? normalized : 'manual';
}

function normalizeSeverity(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  const allowed = new Set(['low', 'medium', 'high', 'critical']);
  return allowed.has(normalized) ? normalized : 'medium';
}

function normalizeTier(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'premium' || normalized === 'pro') {
    return normalized;
  }
  return 'free';
}

function normalizeSubscriptionStatus(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  const allowed = new Set(['active', 'inactive', 'grace_period', 'paused', 'cancelled']);
  return allowed.has(normalized) ? normalized : 'active';
}

function normalizeSubscriptionSource(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  const allowed = new Set(['system', 'local', 'app_store', 'play_store', 'stripe', 'promo', 'admin']);
  return allowed.has(normalized) ? normalized : 'admin';
}

function normalizeOptionalIso(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  const time = Date.parse(raw);
  if (!Number.isFinite(time)) {
    throw new Error(`Niepoprawna data ISO: ${raw}`);
  }

  return new Date(time).toISOString();
}

function sortByCommonName(a, b) {
  return String(a.commonName || '').localeCompare(String(b.commonName || ''), 'pl');
}

function sortByAlgae(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), 'pl');
}

function sortByDisease(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), 'pl');
}

function toMs(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function sortByCreatedAtDesc(a, b) {
  return toMs(b.createdAt) - toMs(a.createdAt);
}

function formatDateTime(value) {
  const ms = toMs(value);
  if (!ms) return '-';
  return new Date(ms).toLocaleString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatError(prefix, error) {
  const suffix = error instanceof Error ? error.message : String(error || 'nieznany blad');
  return `${prefix}: ${suffix}`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
