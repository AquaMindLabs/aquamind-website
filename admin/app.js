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
  equipment: 'equipmentCatalog',
  algae: 'algaeCatalog',
  fishDisease: 'fishDiseaseCatalog',
  plantDisease: 'plantDiseaseCatalog',
  fishRequests: 'fishCatalogRequests',
  plantRequests: 'plantCatalogRequests',
});
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
  equipment: [],
  algae: [],
  fishDisease: [],
  plantDisease: [],
  requests: [],
  pagination: {
    fish: 1,
    plant: 1,
    equipment: 1,
    algae: 1,
    fishDisease: 1,
    plantDisease: 1,
    requests: 1,
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
  kpiFishCount: byId('kpiFishCount'),
  kpiPlantCount: byId('kpiPlantCount'),
  kpiEquipmentCount: byId('kpiEquipmentCount'),
  kpiAlgaeCount: byId('kpiAlgaeCount'),
  kpiDiseaseCount: byId('kpiDiseaseCount'),
  kpiRequestsCount: byId('kpiRequestsCount'),

  tabCountFish: byId('tabCountFish'),
  tabCountPlant: byId('tabCountPlant'),
  tabCountEquipment: byId('tabCountEquipment'),
  tabCountAlgae: byId('tabCountAlgae'),
  tabCountFishDisease: byId('tabCountFishDisease'),
  tabCountPlantDisease: byId('tabCountPlantDisease'),
  tabCountRequests: byId('tabCountRequests'),

  fishResultMeta: byId('fishResultMeta'),
  plantResultMeta: byId('plantResultMeta'),
  equipmentResultMeta: byId('equipmentResultMeta'),
  algaeResultMeta: byId('algaeResultMeta'),
  fishDiseaseResultMeta: byId('fishDiseaseResultMeta'),
  plantDiseaseResultMeta: byId('plantDiseaseResultMeta'),
  requestsResultMeta: byId('requestsResultMeta'),

  addFishBtn: byId('addFishBtn'),
  addPlantBtn: byId('addPlantBtn'),
  addEquipmentBtn: byId('addEquipmentBtn'),
  addAlgaeBtn: byId('addAlgaeBtn'),
  addFishDiseaseBtn: byId('addFishDiseaseBtn'),
  addPlantDiseaseBtn: byId('addPlantDiseaseBtn'),
  refreshEquipmentBtn: byId('refreshEquipmentBtn'),
  refreshRequestsBtn: byId('refreshRequestsBtn'),

  fishSearch: byId('fishSearch'),
  plantSearch: byId('plantSearch'),
  equipmentSearch: byId('equipmentSearch'),
  algaeSearch: byId('algaeSearch'),
  fishDiseaseSearch: byId('fishDiseaseSearch'),
  plantDiseaseSearch: byId('plantDiseaseSearch'),
  requestSearch: byId('requestSearch'),
  equipmentTypeFilter: byId('equipmentTypeFilter'),
  fishImageFilter: byId('fishImageFilter'),
  plantImageFilter: byId('plantImageFilter'),
  algaeImageFilter: byId('algaeImageFilter'),
  fishDiseaseImageFilter: byId('fishDiseaseImageFilter'),
  plantDiseaseImageFilter: byId('plantDiseaseImageFilter'),

  fishTableBody: byId('fishTableBody'),
  plantTableBody: byId('plantTableBody'),
  equipmentTableBody: byId('equipmentTableBody'),
  algaeTableBody: byId('algaeTableBody'),
  fishDiseaseTableBody: byId('fishDiseaseTableBody'),
  plantDiseaseTableBody: byId('plantDiseaseTableBody'),
  requestsTableBody: byId('requestsTableBody'),

  fishPrevBtn: byId('fishPrevBtn'),
  fishNextBtn: byId('fishNextBtn'),
  fishPageInfo: byId('fishPageInfo'),
  plantPrevBtn: byId('plantPrevBtn'),
  plantNextBtn: byId('plantNextBtn'),
  plantPageInfo: byId('plantPageInfo'),
  equipmentPrevBtn: byId('equipmentPrevBtn'),
  equipmentNextBtn: byId('equipmentNextBtn'),
  equipmentPageInfo: byId('equipmentPageInfo'),
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

  sectionTabs: Array.from(document.querySelectorAll('.tab[data-section]')),
  sectionPanels: Array.from(document.querySelectorAll('.section-panel')),
  editorSlots: new Map(
    Array.from(document.querySelectorAll('[data-editor-slot]')).map((slot) => [
      slot.dataset.editorSlot,
      slot,
    ])
  ),

  editorTitle: byId('editorTitle'),
  editorHint: byId('editorHint'),
  catalogForm: byId('catalogForm'),
  cancelEditBtn: byId('cancelEditBtn'),

  stockFields: byId('stockFields'),
  fishExtraFields: byId('fishExtraFields'),
  algaeFields: byId('algaeFields'),
  diseaseFields: byId('diseaseFields'),
  equipmentFields: byId('equipmentFields'),

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
  fWasteProductionLevel: byId('fWasteProductionLevel'),
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

  eId: byId('eId'),
  eType: byId('eType'),
  eBrand: byId('eBrand'),
  eModel: byId('eModel'),
  ePowerW: byId('ePowerW'),
  eFlowLh: byId('eFlowLh'),
  eLumens: byId('eLumens'),
  eFilterType: byId('eFilterType'),
  eTankMinLiters: byId('eTankMinLiters'),
  eTankMaxLiters: byId('eTankMaxLiters'),
  eSource: byId('eSource'),
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
  ui.refreshEquipmentBtn.addEventListener('click', async () => {
    await loadCatalogs();
    renderEquipmentTable();
    setStatus('Lista sprzetu odswiezona.', 'ok');
  });
  ui.refreshRequestsBtn.addEventListener('click', loadRequests);

  ui.addFishBtn.addEventListener('click', () => openEditor('fish'));
  ui.addPlantBtn.addEventListener('click', () => openEditor('plant'));
  ui.addEquipmentBtn.addEventListener('click', () => openEditor('equipment'));
  ui.addAlgaeBtn.addEventListener('click', () => openEditor('algae'));
  ui.addFishDiseaseBtn.addEventListener('click', () => openEditor('fishDisease'));
  ui.addPlantDiseaseBtn.addEventListener('click', () => openEditor('plantDisease'));

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
  ui.equipmentSearch.addEventListener('input', () => {
    state.pagination.equipment = 1;
    renderEquipmentTable();
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
  ui.equipmentTypeFilter.addEventListener('change', () => {
    state.pagination.equipment = 1;
    renderEquipmentTable();
  });
  ui.fishImageFilter.addEventListener('change', () => {
    state.pagination.fish = 1;
    renderFishTable();
  });
  ui.plantImageFilter.addEventListener('change', () => {
    state.pagination.plant = 1;
    renderPlantTable();
  });
  ui.algaeImageFilter.addEventListener('change', () => {
    state.pagination.algae = 1;
    renderAlgaeTable();
  });
  ui.fishDiseaseImageFilter.addEventListener('change', () => {
    state.pagination.fishDisease = 1;
    renderFishDiseaseTable();
  });
  ui.plantDiseaseImageFilter.addEventListener('change', () => {
    state.pagination.plantDisease = 1;
    renderPlantDiseaseTable();
  });

  bindPagination('fish');
  bindPagination('plant');
  bindPagination('equipment');
  bindPagination('algae');
  bindPagination('fishDisease');
  bindPagination('plantDisease');
  bindPagination('requests');

  ui.fishTableBody.addEventListener('click', (event) => handleTableAction(event, 'fish'));
  ui.plantTableBody.addEventListener('click', (event) => handleTableAction(event, 'plant'));
  ui.equipmentTableBody.addEventListener('click', (event) => handleTableAction(event, 'equipment'));
  ui.algaeTableBody.addEventListener('click', (event) => handleTableAction(event, 'algae'));
  ui.fishDiseaseTableBody.addEventListener('click', (event) =>
    handleTableAction(event, 'fishDisease')
  );
  ui.plantDiseaseTableBody.addEventListener('click', (event) =>
    handleTableAction(event, 'plantDisease')
  );
  ui.requestsTableBody.addEventListener('click', (event) => handleTableAction(event, 'requests'));
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
  await Promise.all([loadCatalogs(), loadRequests()]);
  renderAllTables();
  setStatus('Dane panelu sa aktualne.', 'ok');
}

async function loadCatalogs() {
  state.fish = await safeLoadCollection(COLLECTIONS.fish, sortByCommonName);
  state.plant = await safeLoadCollection(COLLECTIONS.plant, sortByCommonName);
  state.equipment = await safeLoadCollection(COLLECTIONS.equipment, sortByEquipment);
  state.algae = await safeLoadCollection(COLLECTIONS.algae, sortByAlgae);
  state.fishDisease = await safeLoadCollection(
    COLLECTIONS.fishDisease,
    sortByDisease
  );
  state.plantDisease = await safeLoadCollection(
    COLLECTIONS.plantDisease,
    sortByDisease
  );
  updateDashboardCounters();
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
  updateDashboardCounters();
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

function renderAllTables() {
  renderFishTable();
  renderPlantTable();
  renderEquipmentTable();
  renderAlgaeTable();
  renderFishDiseaseTable();
  renderPlantDiseaseTable();
  renderRequestsTable();
}

function renderFishTable() {
  const q = ui.fishSearch.value.trim().toLowerCase();
  const imageFilter = String(ui.fishImageFilter.value || 'all');
  const filtered = state.fish
    .filter((item) => !q || `${item.commonName || ''} ${item.latinName || ''}`.toLowerCase().includes(q))
    .filter((item) => matchesImageFilter(item, imageFilter));
  const missingImages = filtered.filter((item) => !resolveBestImageUrl(item)).length;
  const { pageItems, page, pageCount } = paginate('fish', filtered);
  const rows = pageItems
    .map((item) => {
      const rangePh = `${fmtNum(item.phMin)}-${fmtNum(item.phMax)}`;
      const rangeGh = `${fmtNum(item.ghMin)}-${fmtNum(item.ghMax)}`;
      const rangeTemp = `${fmtNum(item.tempMin)}-${fmtNum(item.tempMax)}`;

      return `
        <tr>
          <td>
            <div class="table-actions">
              <button class="btn-mini" data-action="open-image" data-url="${esc(resolveBestImageUrl(item))}">Podglad</button>
              <button class="btn-mini" data-action="edit" data-id="${item.id}">Edytuj</button>
              <button class="btn-mini danger" data-action="delete" data-id="${item.id}">Usun</button>
            </div>
          </td>
          <td>${esc(item.commonName)}</td>
          <td class="mono">${esc(item.latinName)}</td>
          <td>${esc(rangePh)}</td>
          <td>${esc(rangeGh)}</td>
          <td>${esc(rangeTemp)}</td>
          <td>${esc(fmtNum(item.minLiters))}</td>
          <td>${item.isSchooling ? 'tak' : 'nie'}</td>
          <td>${esc(fmtNum(item.minGroupSize))}</td>
          <td>${esc(item.aggressionLevel || 'peaceful')}</td>
          <td>${esc(fmtNum(item.wasteProductionLevel))}</td>
          <td>${esc(item.source || '')}</td>
          <td class="wrap-cell">${esc(item.notes || '')}</td>
          <td class="mono">${esc(item.imagePreviewUrl || '')}</td>
          <td class="mono">${esc(item.imageUrl || '')}</td>
          <td class="mono">${esc(item.imageLink || '')}</td>
          <td class="mono">${esc(item.commonNameNormalized || '')}</td>
          <td class="mono">${esc(item.latinNameNormalized || '')}</td>
        </tr>
      `;
    })
    .join('');

  ui.fishTableBody.innerHTML = rows || '<tr><td colspan="18">Brak wynikow.</td></tr>';
  updatePaginationUi('fish', page, pageCount);
  setResultMeta(ui.fishResultMeta, filtered.length, state.fish.length, `bez zdjec: ${missingImages}`);
}

function renderPlantTable() {
  const q = ui.plantSearch.value.trim().toLowerCase();
  const imageFilter = String(ui.plantImageFilter.value || 'all');
  const filtered = state.plant
    .filter((item) => !q || `${item.commonName || ''} ${item.latinName || ''}`.toLowerCase().includes(q))
    .filter((item) => matchesImageFilter(item, imageFilter));
  const missingImages = filtered.filter((item) => !resolveBestImageUrl(item)).length;
  const { pageItems, page, pageCount } = paginate('plant', filtered);
  const rows = pageItems
    .map((item) => {
      const rangePh = `${fmtNum(item.phMin)}-${fmtNum(item.phMax)}`;
      const rangeGh = `${fmtNum(item.ghMin)}-${fmtNum(item.ghMax)}`;
      const rangeTemp = `${fmtNum(item.tempMin)}-${fmtNum(item.tempMax)}`;

      return `
        <tr>
          <td>
            <div class="table-actions">
              <button class="btn-mini" data-action="open-image" data-url="${esc(resolveBestImageUrl(item))}">Podglad</button>
              <button class="btn-mini" data-action="edit" data-id="${item.id}">Edytuj</button>
              <button class="btn-mini danger" data-action="delete" data-id="${item.id}">Usun</button>
            </div>
          </td>
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
        </tr>
      `;
    })
    .join('');

  ui.plantTableBody.innerHTML = rows || '<tr><td colspan="14">Brak wynikow.</td></tr>';
  updatePaginationUi('plant', page, pageCount);
  setResultMeta(
    ui.plantResultMeta,
    filtered.length,
    state.plant.length,
    `bez zdjec: ${missingImages}`
  );
}

function renderEquipmentTable() {
  const q = ui.equipmentSearch.value.trim().toLowerCase();
  const typeFilter = String(ui.equipmentTypeFilter.value || 'all').trim().toLowerCase();
  const filtered = state.equipment
    .filter((item) => {
      if (typeFilter === 'all') {
        return true;
      }
      return String(item.type || '').trim().toLowerCase() === typeFilter;
    })
    .filter((item) => {
      if (!q) {
        return true;
      }
      return `${item.brand || ''} ${item.model || ''} ${item.id || ''} ${item.type || ''}`
        .toLowerCase()
        .includes(q);
    });

  const { pageItems, page, pageCount } = paginate('equipment', filtered);
  const rows = pageItems
    .map((item) => `
      <tr>
        <td>
          <div class="table-actions">
            <button class="btn-mini" data-action="edit" data-id="${esc(item.id || '')}">Edytuj</button>
            <button class="btn-mini danger" data-action="delete" data-id="${esc(item.id || '')}">Usun</button>
          </div>
        </td>
        <td>${esc(getEquipmentTypeLabel(item.type))}</td>
        <td>${esc(item.brand || '')}</td>
        <td>${esc(item.model || '')}</td>
        <td>${esc(fmtNum(item.powerW))}</td>
        <td>${esc(fmtNum(item.flowLh))}</td>
        <td>${esc(item.filterType || '')}</td>
        <td>${esc(fmtNum(item.lumens))}</td>
        <td>${esc(fmtNum(item.tankMinLiters))}</td>
        <td>${esc(fmtNum(item.tankMaxLiters))}</td>
        <td>${esc(item.source || '')}</td>
        <td class="mono">${esc(item.id || '')}</td>
      </tr>
    `)
    .join('');

  ui.equipmentTableBody.innerHTML = rows || '<tr><td colspan="12">Brak wynikow.</td></tr>';
  updatePaginationUi('equipment', page, pageCount);
  setResultMeta(
    ui.equipmentResultMeta,
    filtered.length,
    state.equipment.length,
    `typ: ${typeFilter === 'all' ? 'wszystkie' : getEquipmentTypeLabel(typeFilter)}`
  );
}

function renderAlgaeTable() {
  const q = ui.algaeSearch.value.trim().toLowerCase();
  const imageFilter = String(ui.algaeImageFilter.value || 'all');
  const filtered = state.algae
    .filter((item) => !q || `${item.name || ''} ${item.id || ''}`.toLowerCase().includes(q))
    .filter((item) => matchesImageFilter(item, imageFilter));
  const missingImages = filtered.filter((item) => !resolveBestImageUrl(item)).length;
  const { pageItems, page, pageCount } = paginate('algae', filtered);
  const rows = pageItems
    .map((item) => {
      const symptomSummary = Array.isArray(item.symptoms) ? item.symptoms.join(', ') : '';

      return `
        <tr>
          <td>
            <div class="table-actions">
              <button class="btn-mini" data-action="open-image" data-url="${esc(resolveBestImageUrl(item))}">Podglad</button>
              <button class="btn-mini" data-action="edit" data-id="${item.id}">Edytuj</button>
              <button class="btn-mini danger" data-action="delete" data-id="${item.id}">Usun</button>
            </div>
          </td>
          <td class="mono">${esc(item.id)}</td>
          <td>${esc(item.name || '')}</td>
          <td>${esc(item.severity || '')}</td>
          <td class="wrap-cell">${esc(symptomSummary)}</td>
          <td>${esc(item.suggestedRemedy || '')}</td>
          <td>${esc(item.imageSourceLabel || '')}</td>
          <td class="mono">${esc(item.imagePreviewUrl || '')}</td>
          <td class="mono">${esc(item.imageUrl || '')}</td>
          <td class="mono">${esc(item.imageLink || '')}</td>
        </tr>
      `;
    })
    .join('');

  ui.algaeTableBody.innerHTML = rows || '<tr><td colspan="10">Brak wynikow.</td></tr>';
  updatePaginationUi('algae', page, pageCount);
  setResultMeta(
    ui.algaeResultMeta,
    filtered.length,
    state.algae.length,
    `bez zdjec: ${missingImages}`
  );
}

function renderFishDiseaseTable() {
  const q = ui.fishDiseaseSearch.value.trim().toLowerCase();
  const imageFilter = String(ui.fishDiseaseImageFilter.value || 'all');
  const filtered = state.fishDisease.filter(
    (item) =>
      (!q || `${item.name || ''} ${item.id || ''}`.toLowerCase().includes(q)) &&
      matchesImageFilter(item, imageFilter)
  );
  const missingImages = filtered.filter((item) => !resolveBestImageUrl(item)).length;
  const { pageItems, page, pageCount } = paginate('fishDisease', filtered);
  const rows = pageItems
    .map((item) => {
      const symptomSummary = Array.isArray(item.symptoms)
        ? item.symptoms.join(', ')
        : '';

      return `
        <tr>
          <td>
            <div class="table-actions">
              <button class="btn-mini" data-action="edit" data-id="${item.id}">Edytuj</button>
              <button class="btn-mini danger" data-action="delete" data-id="${item.id}">Usun</button>
            </div>
          </td>
          <td class="mono">${esc(item.id)}</td>
          <td>${esc(item.name || '')}</td>
          <td>${esc(item.severity || '')}</td>
          <td class="wrap-cell">${esc(symptomSummary)}</td>
          <td>${esc(item.suggestedRemedy || '')}</td>
          <td>${esc(item.imageSourceLabel || '')}</td>
        </tr>
      `;
    })
    .join('');

  ui.fishDiseaseTableBody.innerHTML = rows || '<tr><td colspan="7">Brak wynikow.</td></tr>';
  updatePaginationUi('fishDisease', page, pageCount);
  setResultMeta(
    ui.fishDiseaseResultMeta,
    filtered.length,
    state.fishDisease.length,
    `bez zdjec: ${missingImages}`
  );
}

function renderPlantDiseaseTable() {
  const q = ui.plantDiseaseSearch.value.trim().toLowerCase();
  const imageFilter = String(ui.plantDiseaseImageFilter.value || 'all');
  const filtered = state.plantDisease.filter(
    (item) =>
      (!q || `${item.name || ''} ${item.id || ''}`.toLowerCase().includes(q)) &&
      matchesImageFilter(item, imageFilter)
  );
  const missingImages = filtered.filter((item) => !resolveBestImageUrl(item)).length;
  const { pageItems, page, pageCount } = paginate('plantDisease', filtered);
  const rows = pageItems
    .map((item) => {
      const symptomSummary = Array.isArray(item.symptoms)
        ? item.symptoms.join(', ')
        : '';

      return `
        <tr>
          <td>
            <div class="table-actions">
              <button class="btn-mini" data-action="edit" data-id="${item.id}">Edytuj</button>
              <button class="btn-mini danger" data-action="delete" data-id="${item.id}">Usun</button>
            </div>
          </td>
          <td class="mono">${esc(item.id)}</td>
          <td>${esc(item.name || '')}</td>
          <td>${esc(item.severity || '')}</td>
          <td class="wrap-cell">${esc(symptomSummary)}</td>
          <td>${esc(item.suggestedRemedy || '')}</td>
          <td>${esc(item.imageSourceLabel || '')}</td>
        </tr>
      `;
    })
    .join('');

  ui.plantDiseaseTableBody.innerHTML = rows || '<tr><td colspan="7">Brak wynikow.</td></tr>';
  updatePaginationUi('plantDisease', page, pageCount);
  setResultMeta(
    ui.plantDiseaseResultMeta,
    filtered.length,
    state.plantDisease.length,
    `bez zdjec: ${missingImages}`
  );
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
  const pendingCount = filtered.filter((item) => String(item.status || 'new') === 'new').length;
  const { pageItems, page, pageCount } = paginate('requests', filtered);
  const rows = pageItems
    .map((item) => {
      const typeLabel = item.requestType === 'fish' ? 'ryba' : 'roslina';
      const status = String(item.status || 'new').trim() || 'new';
      return `
        <tr>
          <td>
            <div class="table-actions">
              <button class="btn-mini accept" data-action="request-accept" data-id="${item.id}" data-kind="${item.requestType}">Akceptuj</button>
              <button class="btn-mini reject" data-action="request-reject" data-id="${item.id}" data-kind="${item.requestType}">Odrzuc</button>
              <button class="btn-mini" data-action="request-new" data-id="${item.id}" data-kind="${item.requestType}">Ustaw new</button>
              <button class="btn-mini danger" data-action="request-delete" data-id="${item.id}" data-kind="${item.requestType}">Usun</button>
            </div>
          </td>
          <td>${esc(typeLabel)}</td>
          <td>${esc(item.commonName || '')}</td>
          <td class="mono">${esc(item.latinName || '')}</td>
          <td>${esc(status)}</td>
          <td class="mono">${esc(item.userId || '')}</td>
          <td>${esc(item.userEmail || '')}</td>
          <td>${esc(item.tankName || '')}</td>
          <td>${esc(formatDateTime(item.createdAt))}</td>
        </tr>
      `;
    })
    .join('');

  ui.requestsTableBody.innerHTML = rows || '<tr><td colspan="9">Brak sugestii.</td></tr>';
  updatePaginationUi('requests', page, pageCount);
  setResultMeta(
    ui.requestsResultMeta,
    filtered.length,
    state.requests.length,
    `nowe: ${pendingCount}`
  );
}

function updateDashboardCounters() {
  setCountText(ui.kpiFishCount, state.fish.length);
  setCountText(ui.kpiPlantCount, state.plant.length);
  setCountText(ui.kpiEquipmentCount, state.equipment.length);
  setCountText(ui.kpiAlgaeCount, state.algae.length);
  setCountText(ui.kpiDiseaseCount, state.fishDisease.length + state.plantDisease.length);
  setCountText(ui.kpiRequestsCount, state.requests.length);

  setCountText(ui.tabCountFish, state.fish.length);
  setCountText(ui.tabCountPlant, state.plant.length);
  setCountText(ui.tabCountEquipment, state.equipment.length);
  setCountText(ui.tabCountAlgae, state.algae.length);
  setCountText(ui.tabCountFishDisease, state.fishDisease.length);
  setCountText(ui.tabCountPlantDisease, state.plantDisease.length);
  setCountText(ui.tabCountRequests, state.requests.length);
}

function setCountText(target, value) {
  if (!target) {
    return;
  }
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  target.textContent = String(safeValue);
}

function setResultMeta(target, visibleCount, totalCount, details = '') {
  if (!target) {
    return;
  }

  const visible = Number.isFinite(Number(visibleCount)) ? Number(visibleCount) : 0;
  const total = Number.isFinite(Number(totalCount)) ? Number(totalCount) : 0;
  const suffix = String(details || '').trim();
  target.textContent = suffix
    ? `${visible} / ${total} | ${suffix}`
    : `${visible} / ${total}`;
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
  if (key === 'equipment') return renderEquipmentTable();
  if (key === 'algae') return renderAlgaeTable();
  if (key === 'fishDisease') return renderFishDiseaseTable();
  if (key === 'plantDisease') return renderPlantDiseaseTable();
  if (key === 'requests') return renderRequestsTable();
}

function switchSection(section) {
  const nextSection = ['fish', 'plant', 'equipment', 'algae', 'fishDisease', 'plantDisease', 'requests'].includes(section)
    ? section
    : 'fish';
  if (!ui.editorCard.classList.contains('hidden') && state.editor.section !== nextSection) {
    closeEditor();
  }
  state.activeSection = nextSection;

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
    section === 'equipment' ||
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

function mountEditorInSection(section) {
  const slot = ui.editorSlots.get(section);
  if (!slot) {
    return;
  }

  if (ui.editorCard.parentElement !== slot) {
    slot.appendChild(ui.editorCard);
  }
}

function openEditor(section, item = null) {
  mountEditorInSection(section);
  state.editor.section = section;
  state.editor.mode = item ? 'edit' : 'create';
  state.editor.id = item?.id || null;

  ui.catalogForm.reset();
  if (ui.eId) {
    ui.eId.disabled = false;
  }

  show(ui.stockFields, section === 'fish' || section === 'plant');
  show(ui.fishExtraFields, section === 'fish');
  show(ui.algaeFields, section === 'algae');
  show(ui.diseaseFields, section === 'fishDisease' || section === 'plantDisease');
  show(ui.equipmentFields, section === 'equipment');

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
    ui.fWasteProductionLevel.value = toInputNumber(item?.wasteProductionLevel);
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

  if (section === 'equipment') {
    ui.editorTitle.textContent =
      state.editor.mode === 'create' ? 'Dodaj sprzet' : 'Edytuj sprzet';
    ui.editorHint.textContent = `Kolekcja: ${COLLECTIONS.equipment}`;

    ui.eId.value = item?.id || '';
    ui.eId.disabled = state.editor.mode === 'edit';
    ui.eType.value = normalizeEquipmentType(item?.type);
    ui.eBrand.value = item?.brand || '';
    ui.eModel.value = item?.model || '';
    ui.ePowerW.value = toInputNumber(item?.powerW);
    ui.eFlowLh.value = toInputNumber(item?.flowLh);
    ui.eLumens.value = toInputNumber(item?.lumens);
    ui.eFilterType.value = normalizeEquipmentFilterType(item?.filterType);
    ui.eTankMinLiters.value = toInputNumber(item?.tankMinLiters);
    ui.eTankMaxLiters.value = toInputNumber(item?.tankMaxLiters);
    ui.eSource.value = normalizeEquipmentSource(item?.source);
  }

  show(ui.editorCard, true);
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

    if (section === 'equipment') {
      const payload = buildEquipmentPayload();
      const equipmentId = payload.id;

      if (!equipmentId) {
        throw new Error('Id sprzetu jest wymagane.');
      }

      if (state.editor.mode === 'create') {
        await setDoc(doc(state.db, COLLECTIONS.equipment, equipmentId), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(state.db, COLLECTIONS.equipment, state.editor.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
      }

      await loadCatalogs();
      renderAllTables();
      closeEditor();
      setStatus('Zapisano wpis katalogu sprzetu.', 'ok');
      return;
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
    const rawWasteProductionLevel = ui.fWasteProductionLevel.value.trim();
    const minGroupSize = rawMinGroup
      ? asNumber(rawMinGroup, 'Minimalna grupa', { integer: true })
      : isSchooling
        ? 6
        : 0;
    const wasteProductionLevel = rawWasteProductionLevel
      ? asNumber(normalizeDecimalInput(rawWasteProductionLevel), 'Produkcja brudu')
      : null;

    if (Number.isFinite(Number(wasteProductionLevel))) {
      if (Number(wasteProductionLevel) < 0 || Number(wasteProductionLevel) > 10) {
        throw new Error('Produkcja brudu musi byc w zakresie 0-10.');
      }
    }

    payload.isSchooling = isSchooling;
    payload.minGroupSize = isSchooling ? Math.max(1, Number(minGroupSize)) : 0;
    payload.aggressionLevel = normalizeAggressionLevel(ui.fAggressionLevel.value.trim() || 'peaceful');
    payload.wasteProductionLevel = Number.isFinite(Number(wasteProductionLevel))
      ? Number(wasteProductionLevel)
      : null;
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

function buildEquipmentPayload() {
  const id = ui.eId.value.trim().toLowerCase();
  const type = normalizeEquipmentType(ui.eType.value);
  const brand = ui.eBrand.value.trim();
  const model = ui.eModel.value.trim();

  if (!id) {
    throw new Error('Id sprzetu jest wymagane.');
  }
  if (!brand || !model) {
    throw new Error('Marka i model sa wymagane.');
  }

  const payload = {
    id,
    type,
    brand,
    model,
    source: normalizeEquipmentSource(ui.eSource.value),
  };

  const tankMinLiters = toOptionalNumber(ui.eTankMinLiters.value);
  const tankMaxLiters = toOptionalNumber(ui.eTankMaxLiters.value);
  if (tankMinLiters !== null) payload.tankMinLiters = tankMinLiters;
  if (tankMaxLiters !== null) payload.tankMaxLiters = tankMaxLiters;
  if (tankMinLiters !== null && tankMaxLiters !== null && tankMinLiters > tankMaxLiters) {
    throw new Error('Zakres litrazu: min musi byc <= max.');
  }

  if (type === 'heater') {
    const powerW = asNumber(ui.ePowerW.value, 'Moc (W)', { integer: true });
    if (powerW <= 0) {
      throw new Error('Moc grzalki musi byc > 0.');
    }
    payload.powerW = powerW;
    payload.flowLh = null;
    payload.lumens = null;
    payload.filterType = '';
    payload.filterEfficiencyFactor = null;
  }

  if (type === 'filter') {
    const flowLh = asNumber(ui.eFlowLh.value, 'Przeplyw (L/h)', { integer: true });
    if (flowLh <= 0) {
      throw new Error('Przeplyw filtra musi byc > 0.');
    }
    const filterType = normalizeEquipmentFilterType(ui.eFilterType.value);
    payload.flowLh = flowLh;
    payload.filterType = filterType;
    payload.filterEfficiencyFactor = getFilterEfficiencyFactorByType(filterType);
    payload.powerW = null;
    payload.lumens = null;
  }

  if (type === 'light') {
    const lumens = asNumber(ui.eLumens.value, 'Lumeny', { integer: true });
    if (lumens <= 0) {
      throw new Error('Lumeny lampy musza byc > 0.');
    }
    payload.lumens = lumens;
    payload.powerW = null;
    payload.flowLh = null;
    payload.filterType = '';
    payload.filterEfficiencyFactor = null;
  }

  return payload;
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

function matchesImageFilter(item, mode) {
  const normalizedMode = String(mode ?? 'all').trim().toLowerCase();
  if (normalizedMode === 'all') {
    return true;
  }

  const hasImage = resolveBestImageUrl(item).length > 0;
  if (normalizedMode === 'missing') {
    return !hasImage;
  }

  if (normalizedMode === 'with') {
    return hasImage;
  }

  return true;
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

function normalizeDecimalInput(value) {
  return String(value ?? '').trim().replace(',', '.');
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

function normalizeEquipmentType(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  const allowed = new Set(['filter', 'heater', 'light']);
  return allowed.has(normalized) ? normalized : 'filter';
}

function normalizeEquipmentFilterType(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  const allowed = new Set(['internal', 'cascade', 'canister', 'sponge', 'sump_panel']);
  return allowed.has(normalized) ? normalized : '';
}

function normalizeEquipmentSource(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  const allowed = new Set(['catalog', 'manual', 'imported']);
  return allowed.has(normalized) ? normalized : 'catalog';
}

function getFilterEfficiencyFactorByType(filterType) {
  const map = {
    internal: 0.7,
    cascade: 0.65,
    canister: 0.55,
    sponge: 0.5,
    sump_panel: 0.7,
  };
  return Number.isFinite(Number(map[filterType])) ? Number(map[filterType]) : null;
}

function toOptionalNumber(raw) {
  const text = String(raw ?? '').trim();
  if (!text) {
    return null;
  }
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Pole liczbowe ma niepoprawna wartosc: ${text}`);
  }
  return numeric;
}

function getEquipmentTypeLabel(type) {
  const normalized = String(type ?? '').trim().toLowerCase();
  if (normalized === 'filter') return 'Filtr';
  if (normalized === 'heater') return 'Grzalka';
  if (normalized === 'light') return 'Lampa';
  return normalized || '-';
}

function sortByCommonName(a, b) {
  return String(a.commonName || '').localeCompare(String(b.commonName || ''), 'pl');
}

function sortByEquipment(a, b) {
  const typeCmp = String(a.type || '').localeCompare(String(b.type || ''), 'pl');
  if (typeCmp !== 0) return typeCmp;
  const brandCmp = String(a.brand || '').localeCompare(String(b.brand || ''), 'pl');
  if (brandCmp !== 0) return brandCmp;
  return String(a.model || '').localeCompare(String(b.model || ''), 'pl');
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
