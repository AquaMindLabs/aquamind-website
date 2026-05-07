import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signOut,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import {
  Animated,
  Alert,
  BackHandler,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { createTranslator } from '@/constants/translations';
import { useAppTheme } from '@/features/aquarium/context/AppThemeContext';
import { useTank } from '@/features/aquarium/context/TankContext';
import {
  listSubscriptionCapabilityRows,
  listSubscriptionPlans,
} from '@/features/aquarium/subscription/subscriptionModel';
import { ALGAE_CATALOG, ALGAE_SYMPTOMS } from '@/data/algaeCatalog';
import { FISH_CATALOG_EXPANDED } from '@/data/fishCatalogExpanded';
import { FISH_CATALOG_STARTER } from '@/data/fishCatalogStarter';
import { EQUIPMENT_CATALOG } from '@/data/equipmentCatalog';
import { DISEASE_CATALOG, DISEASE_SYMPTOMS } from '@/data/diseaseCatalog';
import {
  PLANT_DISEASE_CATALOG,
  PLANT_DISEASE_SYMPTOMS,
} from '@/data/plantDiseaseCatalog';
import { PLANT_CATALOG_EXPANDED } from '@/data/plantCatalogExpanded';
import { PLANT_CATALOG_STARTER } from '@/data/plantCatalogStarter';
import { getSelectedTankStorageKey } from '@/features/aquarium/services/storageKeys';
import {
  buildTankEquipmentAssessment,
  normalizeEquipmentType,
  toFiniteNumber,
} from '@/logic/equipmentAnalysis';
import {
  analyzeMeasurement as analyzeMeasurementLogic,
  buildCurrentRiskNotes as buildCurrentRiskNotesLogic,
  buildWaterTestingSchedule as buildWaterTestingScheduleLogic,
  calculateCo2FromKhPh as calculateCo2FromKhPhLogic,
  getRecommendationDueAtMs as getRecommendationDueAtMsLogic,
} from '@/logic/waterAnalysis';
import { auth, db } from '@/shared/services/firebase';

let notificationsModulePromise = null;
let notificationsHandlerConfigured = false;
const NOTIFICATIONS_MODULE_NAME = 'expo-notifications';
WebBrowser.maybeCompleteAuthSession();
const IS_EXPO_GO =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === 'storeClient';
const IS_IOS_EXPO_GO = Platform.OS === 'ios' && IS_EXPO_GO;
const ENABLE_FISH_IMAGES = true;
const ENABLE_PLANT_IMAGES = false;
const CATALOG_EAGER_RENDER_LIMIT = 24;
const DISEASE_IMAGE_PLACEHOLDER_SOURCE = require('../assets/images/icon.png');
const REMOTE_JSON_REQUEST_HEADERS = Object.freeze({
  Accept: 'application/json',
  'User-Agent':
    'MyAquariumAssistant/1.0 (mobile app; https://my-aquarium-assistant.firebaseapp.com)',
});

function buildFishCommonsFallbackImageUrl(latinName, width = 420) {
  const words = String(latinName ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2) {
    return '';
  }

  const latinSpecies = `${words[0]} ${words[1]}`;
  const encodedTitle = encodeURIComponent(latinSpecies.replace(/\s+/g, '_'));
  const normalizedWidth = Number(width);
  const widthQuery =
    Number.isFinite(normalizedWidth) && normalizedWidth > 0
      ? `?width=${Math.round(normalizedWidth)}`
      : '';

  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodedTitle}.jpg${widthQuery}`;
}

function buildPlantCommonsFallbackImageUrl(latinName, width = 420) {
  const words = String(latinName ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2) {
    return '';
  }

  const latinSpecies = `${words[0]} ${words[1]}`;
  const encodedTitle = encodeURIComponent(latinSpecies.replace(/\s+/g, '_'));
  const normalizedWidth = Number(width);
  const widthQuery =
    Number.isFinite(normalizedWidth) && normalizedWidth > 0
      ? `?width=${Math.round(normalizedWidth)}`
      : '';

  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodedTitle}.jpg${widthQuery}`;
}

function buildCommonsFileThumbnailUrl(fileName, width = 420) {
  const normalizedFileName = String(fileName ?? '').trim();
  if (!normalizedFileName) {
    return '';
  }

  const encodedFileName = encodeURIComponent(normalizedFileName.replace(/\s+/g, '_'));
  const normalizedWidth = Number(width);
  const widthQuery =
    Number.isFinite(normalizedWidth) && normalizedWidth > 0
      ? `?width=${Math.round(normalizedWidth)}`
      : '';

  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodedFileName}${widthQuery}`;
}

function normalizeFishSearchPhrase(value) {
  return String(value ?? '')
    .trim()
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ');
}

function buildFishSearchPhrases(latinName) {
  const normalizedLatin = normalizeFishSearchPhrase(latinName);
  if (!normalizedLatin) {
    return [];
  }

  const withoutVariant = normalizedLatin
    .replace(/\s+var\.?\s+.+$/i, '')
    .replace(/\s+cf\.?\s+/gi, ' ')
    .replace(/\s+aff\.?\s+/gi, ' ')
    .replace(/\s+spp?\.?$/i, '')
    .replace(/\s+sp\.?$/i, '')
    .trim();
  const words = withoutVariant.split(/\s+/).filter(Boolean);
  const genusSpecies = words.slice(0, 2).join(' ').trim();
  const genusOnly = words[0] ?? '';

  return [...new Set([normalizedLatin, withoutVariant, genusSpecies, genusOnly].filter(Boolean))];
}

function getAndroidDiseaseImageUri(uri) {
  const normalizedUri = String(uri ?? '').trim();

  if (
    Platform.OS !== 'android' ||
    (!normalizedUri.includes('upload.wikimedia.org/') &&
      !normalizedUri.includes('commons.wikimedia.org/'))
  ) {
    return normalizedUri;
  }

  const proxyTarget = normalizedUri.replace(/^https?:\/\//, '');
  return `https://wsrv.nl/?url=${encodeURIComponent(proxyTarget)}`;
}

function getDiseaseRemoteImageSource(uri) {
  const normalizedUri = String(uri ?? '').trim();
  const imageUri = getAndroidDiseaseImageUri(normalizedUri);

  return imageUri ? { uri: imageUri } : DISEASE_IMAGE_PLACEHOLDER_SOURCE;
}

async function ensureNotificationsModule() {
  if (IS_EXPO_GO) {
    return null;
  }

  if (!notificationsModulePromise) {
    notificationsModulePromise = import(NOTIFICATIONS_MODULE_NAME).catch(
      () => null
    );
  }

  const Notifications = await notificationsModulePromise;

  if (!Notifications || notificationsHandlerConfigured) {
    return Notifications;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  notificationsHandlerConfigured = true;
  return Notifications;
}

// Safety fallback for stale Metro bundles on some Android devices.
// Current code path does not use this function directly.
// eslint-disable-next-line no-unused-vars
async function fetchWikimediaImageUrl() {
  return null;
}

function getOptionalEnvValue(value) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function parseNumberOrThrow(label, rawValue) {
  const normalized = rawValue.trim().replace(',', '.');

  if (!normalized) {
    throw new Error(`Pole ${label} jest wymagane`);
  }

  const value = Number(normalized);

  if (Number.isNaN(value)) {
    throw new Error(`Pole ${label} musi byc liczba`);
  }

  return value;
}

function parseOptionalNumberOrThrow(label, rawValue) {
  const normalized = String(rawValue ?? '')
    .trim()
    .replace(',', '.');

  if (!normalized) {
    return null;
  }

  return parseNumberOrThrow(label, normalized);
}

function parsePositiveNumberOrThrow(label, rawValue) {
  const value = parseNumberOrThrow(label, rawValue);

  if (value <= 0) {
    throw new Error(`Pole ${label} musi byc wieksze od 0`);
  }

  return value;
}

function parseOptionalNonNegativeNumberOrThrow(label, rawValue) {
  const value = parseOptionalNumberOrThrow(label, rawValue);

  if (value === null) {
    return null;
  }

  if (value < 0) {
    throw new Error(`Pole ${label} nie moze byc mniejsze od 0`);
  }

  return value;
}

function parseNonNegativeNumberOrThrow(label, rawValue) {
  const value = parseNumberOrThrow(label, rawValue);

  if (value < 0) {
    throw new Error(`Pole ${label} nie moze byc mniejsze od 0`);
  }

  return value;
}

function getCreatedAtMs(createdAt) {
  if (!createdAt) {
    return 0;
  }

  if (typeof createdAt.toMillis === 'function') {
    return createdAt.toMillis();
  }

  if (createdAt instanceof Date) {
    return createdAt.getTime();
  }

  const parsed = new Date(createdAt).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatCreatedAt(createdAt) {
  const ms = getCreatedAtMs(createdAt);

  if (!ms) {
    return '-';
  }

  return new Date(ms).toLocaleString();
}

function formatDateOnly(value) {
  const ms = getCreatedAtMs(value);

  if (!ms) {
    return '-';
  }

  return new Date(ms).toLocaleDateString();
}

function getWaterTestNotificationStorageKey(userId) {
  return `water_test_notification_${userId}`;
}

function getDayBucketMs(value) {
  const ms = getCreatedAtMs(value);

  if (!ms) {
    return 0;
  }

  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function formatLiters(liters) {
  const value = Number(liters);

  if (Number.isNaN(value)) {
    return '-';
  }

  return `${value} l`;
}

function formatEquipmentTankRange(item) {
  const minLiters = toFiniteNumber(item?.tankMinLiters);
  const maxLiters = toFiniteNumber(item?.tankMaxLiters);

  if (Number.isFinite(minLiters) && Number.isFinite(maxLiters)) {
    return `${minLiters}-${maxLiters} l`;
  }
  if (Number.isFinite(maxLiters)) {
    return `do ${maxLiters} l`;
  }
  if (Number.isFinite(minLiters)) {
    return `od ${minLiters} l`;
  }
  return '-';
}

function getEquipmentCatalogDescription(item) {
  const normalizedType = normalizeEquipmentType(item?.type);
  const maxLiters = toFiniteNumber(item?.tankMaxLiters) ?? 0;
  const flowLh = toFiniteNumber(item?.flowLh) ?? 0;

  if (normalizedType === 'heater') {
    if (maxLiters <= 60) {
      return 'Kompaktowa grzalka do stabilnego dogrzewania mniejszych zbiornikow.';
    }
    if (maxLiters <= 180) {
      return 'Uniwersalna grzalka do codziennego utrzymania temperatury w akwarium towarzyskim.';
    }
    return 'Mocniejsza grzalka do wiekszych zbiornikow lub pomieszczen z chlodniejszym otoczeniem.';
  }

  if (flowLh <= 500) {
    return 'Lagodniejsza filtracja do mniejszych akwariow i spokojniejszej obsady.';
  }
  if (flowLh <= 1200) {
    return 'Uniwersalny filtr do codziennej filtracji biologiczno-mechanicznej.';
  }
  return 'Wydajniejszy filtr do wiekszych zbiornikow albo mocniej obciazonej obsady.';
}

function getTankEquipmentListField(type) {
  return type === 'heater' ? 'heaterEquipments' : 'filterEquipments';
}

function getTankEquipmentLegacyField(type) {
  return type === 'heater' ? 'heaterEquipment' : 'filterEquipment';
}

function getTankEquipmentList(tank, type) {
  if (!tank) {
    return [];
  }

  const listField = getTankEquipmentListField(type);
  const legacyField = getTankEquipmentLegacyField(type);
  const fromList = Array.isArray(tank[listField])
    ? tank[listField]
        .filter(Boolean)
        .map((item) => ({
          ...item,
          type: normalizeEquipmentType(item?.type) || type,
        }))
    : [];

  if (fromList.length > 0) {
    return fromList;
  }

  if (!tank[legacyField]) {
    return [];
  }

  return [
    {
      ...tank[legacyField],
      type: normalizeEquipmentType(tank[legacyField]?.type) || type,
    },
  ];
}

function buildTankEquipmentFromCatalogItem(equipmentItem, equipmentType) {
  return equipmentType === 'heater'
    ? {
        id: equipmentItem.id,
        assignmentId: `${equipmentItem.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'heater',
        brand: equipmentItem.brand ?? '',
        model: equipmentItem.model ?? '',
        powerW: toFiniteNumber(equipmentItem.powerW),
        tankMinLiters: toFiniteNumber(equipmentItem.tankMinLiters),
        tankMaxLiters: toFiniteNumber(equipmentItem.tankMaxLiters),
        source: 'catalog',
      }
    : {
        id: equipmentItem.id,
        assignmentId: `${equipmentItem.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'filter',
        brand: equipmentItem.brand ?? '',
        model: equipmentItem.model ?? '',
        flowLh: toFiniteNumber(equipmentItem.flowLh),
        tankMinLiters: toFiniteNumber(equipmentItem.tankMinLiters),
        tankMaxLiters: toFiniteNumber(equipmentItem.tankMaxLiters),
        source: 'catalog',
      };
}

function hasMeasurementDisplayValue(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  return true;
}

function buildMeasurementDetailRows(measurement, enabledTests = {}) {
  if (!measurement) {
    return [];
  }

  const rows = [
    enabledTests.ph ? { key: 'ph', label: 'pH', value: measurement.ph } : null,
    enabledTests.gh ? { key: 'gh', label: 'GH', value: measurement.gh } : null,
    enabledTests.kh ? { key: 'kh', label: 'KH', value: measurement.kh } : null,
    enabledTests.ph && enabledTests.kh
      ? {
          key: 'co2',
          label: 'CO2',
          value: getMeasurementNumericValue(measurement, 'co2'),
        }
      : null,
    enabledTests.ca ? { key: 'ca', label: 'Ca', value: measurement.ca } : null,
    enabledTests.mg ? { key: 'mg', label: 'Mg', value: measurement.mg } : null,
    enabledTests.no2 ? { key: 'no2', label: 'NO2', value: measurement.no2 } : null,
    enabledTests.no3 ? { key: 'no3', label: 'NO3', value: measurement.no3 } : null,
    enabledTests.nh3nh4
      ? { key: 'nh3nh4', label: 'NH3/NH4', value: measurement.nh3nh4 }
      : null,
    enabledTests.po4 ? { key: 'po4', label: 'PO4', value: measurement.po4 } : null,
    enabledTests.fe ? { key: 'fe', label: 'Fe', value: measurement.fe } : null,
    enabledTests.temperature
      ? { key: 'temperature', label: 'Temp', value: measurement.temperature }
      : null,
  ];

  return rows.filter((item) => item && hasMeasurementDisplayValue(item.value));
}

function getMeasurementKeysFromRecommendationParameter(parameter) {
  const normalized = String(parameter ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const keys = [];
  const push = (key) => {
    if (!keys.includes(key)) {
      keys.push(key);
    }
  };

  if (/\bph\b/.test(normalized)) push('ph');
  if (/\bgh\b/.test(normalized)) push('gh');
  if (/\bkh\b/.test(normalized)) push('kh');
  if (/\bca\b/.test(normalized)) push('ca');
  if (/\bmg\b/.test(normalized)) push('mg');
  if (/\bno2\b/.test(normalized)) push('no2');
  if (/\bno3\b/.test(normalized)) push('no3');
  if (/nh3|nh4/.test(normalized)) push('nh3nh4');
  if (/\bpo4\b/.test(normalized)) push('po4');
  if (/\bfe\b/.test(normalized)) push('fe');
  if (/\bco2\b/.test(normalized)) push('co2');
  if (normalized.includes('temp')) push('temperature');
  if (normalized.includes('temperat')) push('temperature');
  if (normalized.includes('azotyn')) push('no2');
  if (normalized.includes('azotan')) push('no3');
  if (normalized.includes('amoniak')) push('nh3nh4');
  if (normalized.includes('fosforan')) push('po4');
  if (normalized.includes('zelazo')) push('fe');
  if (normalized.includes('twardosc ogolna')) push('gh');
  if (normalized.includes('twardosc weglanowa')) push('kh');
  if (normalized.includes('grzalk')) push('temperature');
  if (normalized.includes('temperatura')) push('temperature');

  return keys;
}

function getMeasurementSeverityFromValue(key, rawValue) {
  const normalizedRawValue =
    typeof rawValue === 'string' ? rawValue.trim().replace(',', '.') : rawValue;
  const value = Number(normalizedRawValue);

  if (!Number.isFinite(value)) {
    return 'ok';
  }

  if (key === 'ph') {
    if (value < 5.8 || value > 8.5) return 'critical';
    if (value < 6.5 || value > 7.8) return 'warning';
    return 'ok';
  }

  if (key === 'gh') {
    if (value < 3 || value > 22) return 'critical';
    if (value < 5 || value > 14) return 'warning';
    return 'ok';
  }

  if (key === 'kh') {
    if (value < 1 || value > 14) return 'critical';
    if (value < 3 || value > 8) return 'warning';
    return 'ok';
  }

  if (key === 'ca') {
    if (value < 10 || value > 100) return 'critical';
    if (value < 20 || value > 60) return 'warning';
    return 'ok';
  }

  if (key === 'mg') {
    if (value < 2 || value > 35) return 'critical';
    if (value < 5 || value > 20) return 'warning';
    return 'ok';
  }

  if (key === 'no2') {
    if (value > 0) return 'critical';
    return 'ok';
  }

  if (key === 'no3') {
    if (value > 80) return 'critical';
    if (value > 25) return 'warning';
    return 'ok';
  }

  if (key === 'nh3nh4') {
    if (value > 0.2) return 'critical';
    if (value > 0.05) return 'warning';
    return 'ok';
  }

  if (key === 'po4') {
    if (value > 2) return 'critical';
    if (value > 1) return 'warning';
    return 'ok';
  }

  if (key === 'fe') {
    if (value > 0.5) return 'critical';
    if (value > 0.2) return 'warning';
    return 'ok';
  }

  if (key === 'co2') {
    if (value > 40) return 'critical';
    if (value < 10 || value > 30) return 'warning';
    return 'ok';
  }

  if (key === 'temperature') {
    if (value < 22 || value > 29) return 'critical';
    if (value < 24 || value > 27) return 'warning';
    return 'ok';
  }

  return 'ok';
}

function getMeasurementTargetRangeLabel(key) {
  if (key === 'ph') return '6.5-7.8';
  if (key === 'gh') return '5-14 dGH';
  if (key === 'kh') return '3-8 dKH';
  if (key === 'ca') return '20-60 mg/l';
  if (key === 'mg') return '5-20 mg/l';
  if (key === 'no2') return '0 mg/l';
  if (key === 'no3') return '5-25 mg/l';
  if (key === 'nh3nh4') return '<= 0.05 mg/l';
  if (key === 'po4') return '0.1-1.0 mg/l';
  if (key === 'fe') return '0.02-0.2 mg/l';
  if (key === 'co2') return '10-30 mg/l';
  if (key === 'temperature') return '24-27 C';
  return '-';
}

function getMeasurementDefaultAction(key, severity) {
  if (severity === 'ok') {
    return 'Wynik jest w bezpiecznym zakresie. Kontynuuj obecna pielegnacje i regularne pomiary.';
  }

  if (key === 'no2') {
    return 'Podmien wode od razu, mocno napowietrz i sprawdz filtr biologiczny.';
  }

  if (key === 'no3') {
    return 'Wykonaj podmiane wody i ogranicz karmienie, a dodatkowo zwieksz mase roslin szybko rosnacych.';
  }

  if (key === 'temperature') {
    return 'Skoryguj ustawienia grzalki/chlodzenia stopniowo i obserwuj reakcje ryb.';
  }

  if (key === 'co2') {
    return 'Skoryguj dozowanie CO2 i utrzymuj stabilny poziom przez kolejne dni.';
  }

  return severity === 'critical'
    ? 'Wprowadz korekte jeszcze dzisiaj i powtorz pomiar po zmianach.'
    : 'Zaplanow korekte przy najblizszej pielegnacji i kontrolny pomiar.';
}

function getMeasurementDefaultImpact(key, severity) {
  if (severity === 'ok') {
    return 'Przy utrzymaniu tego poziomu parametr nie powinien teraz zwiekszac ryzyka dla obsady.';
  }

  if (key === 'no2') {
    return 'Podwyzszone NO2 szybko podnosi stres i moze prowadzic do zatruc.';
  }

  if (key === 'no3') {
    return 'Wysokie NO3 zwieksza ryzyko glonow, oslabienia ryb i gorszego samopoczucia obsady.';
  }

  if (key === 'nh3nh4') {
    return 'Podwyzszone NH3/NH4 zwieksza ryzyko podtrucia i problemow z oddychaniem u ryb.';
  }

  if (key === 'temperature') {
    return 'Niestabilna temperatura nasila stres i moze oslabic odpornosc ryb.';
  }

  if (key === 'ph') {
    return 'Odchylenie pH moze zwiekszac stres i podatnosc na infekcje.';
  }

  return severity === 'critical'
    ? 'Bez korekty moze dojsc do pogorszenia kondycji zbiornika i obsady.'
    : 'Bez korekty moze stopniowo obnizac komfort zycia ryb i roslin.';
}

function buildTrendSuggestedEnvironmentForTank({
  fishItems = [],
  plantItems = [],
  activeDiseaseCases = [],
  activePlantDiseaseCases = [],
  activeAlgaeCases = [],
  measurement = null,
  tankProfile = null,
}) {
  const fishTempRange = buildRecommendedRange(
    fishItems.map((item) => item.tempMin),
    fishItems.map((item) => item.tempMax)
  );
  const plantTempRange = buildRecommendedRange(
    plantItems.map((item) => item.tempMin),
    plantItems.map((item) => item.tempMax)
  );

  const baseTempRanges = [fishTempRange, plantTempRange].filter(Boolean);
  const baseTempRange =
    baseTempRanges.length === 0
      ? null
      : buildRecommendedRange(
          baseTempRanges.map((range) => range.min),
          baseTempRanges.map((range) => range.max)
        );

  const plantLightRanges = plantItems
    .map((item) => inferPlantLightRange(item))
    .filter(Boolean)
    .map((range) => ({
      min: Number(range.minHours),
      max: Number(range.maxHours),
    }))
    .filter(
      (range) =>
        Number.isFinite(range.min) &&
        Number.isFinite(range.max) &&
        range.min <= range.max
    );
  const baseLightRange =
    plantLightRanges.length === 0
      ? null
      : buildRecommendedRange(
          plantLightRanges.map((range) => range.min),
          plantLightRanges.map((range) => range.max)
        );

  let recommendedTempRange = baseTempRange;
  let recommendedLightRange = baseLightRange;

  const activeFishDiseaseIds = new Set(
    activeDiseaseCases.map((item) =>
      String(item.issueId ?? item.diseaseId ?? '').toLowerCase()
    )
  );
  const activePlantDiseaseIds = new Set(
    activePlantDiseaseCases.map((item) =>
      String(item.issueId ?? item.diseaseId ?? '').toLowerCase()
    )
  );
  const activeAlgaeIds = new Set(
    activeAlgaeCases.map((item) =>
      String(item.issueId ?? item.diseaseId ?? '').toLowerCase()
    )
  );

  if (activeFishDiseaseIds.has('ich')) {
    recommendedTempRange = { min: 28, max: 30, conflict: false };
    recommendedLightRange = { min: 6, max: 8, conflict: false };
  }

  if (activeFishDiseaseIds.has('velvet')) {
    recommendedTempRange = { min: 27, max: 28, conflict: false };
    recommendedLightRange = { min: 4, max: 6, conflict: false };
  }

  if (activePlantDiseaseIds.size > 0) {
    recommendedLightRange = { min: 6, max: 8, conflict: false };
  }

  if (activeAlgaeIds.has('black-beard-algae')) {
    recommendedLightRange = { min: 6, max: 7, conflict: false };
  } else if (activeAlgaeIds.has('cyanobacteria')) {
    recommendedLightRange = { min: 5, max: 6, conflict: false };
  } else if (activeAlgaeIds.has('green-hair-algae')) {
    recommendedLightRange = { min: 6, max: 7, conflict: false };
  }

  const latestTemperature = Number(measurement?.temperature);
  const currentTempValue = Number.isFinite(latestTemperature)
    ? roundToOneDecimal(latestTemperature)
    : null;
  const currentLightHours = Number(tankProfile?.lightHours);
  const currentLightValue = Number.isFinite(currentLightHours)
    ? roundToOneDecimal(currentLightHours)
    : null;

  const isTempWithinSuggested =
    recommendedTempRange && currentTempValue !== null
      ? currentTempValue >= recommendedTempRange.min &&
        currentTempValue <= recommendedTempRange.max
      : null;
  const isLightWithinSuggested =
    recommendedLightRange && currentLightValue !== null
      ? currentLightValue >= recommendedLightRange.min &&
        currentLightValue <= recommendedLightRange.max
      : null;

  return {
    recommendedTempRange,
    recommendedLightRange,
    currentTempValue,
    currentLightValue,
    isTempWithinSuggested,
    isLightWithinSuggested,
  };
}

function buildHomeSectionCounts({
  tank,
  measurement,
  stockItems = [],
  issueCases = [],
  enabledTests = {},
}) {
  if (!tank) {
    return {
      planCount: 0,
      attentionCount: 0,
    };
  }

  const tankLiters = Number(tank?.liters);
  const tankProfile = buildTankEnvironmentProfile(tank);
  const equipmentAssessment = buildTankEquipmentAssessment(tank, EQUIPMENT_CATALOG);
  const fishItems = stockItems.filter((item) => item.type === 'fish');
  const plantItems = stockItems.filter((item) => item.type === 'plant');
  const activeDiseaseCases = issueCases.filter(
    (item) => String(item.caseType ?? 'disease').toLowerCase() === 'disease'
  );
  const activePlantDiseaseCases = issueCases.filter(
    (item) => String(item.caseType ?? '').toLowerCase() === 'plant_disease'
  );
  const activeAlgaeCases = issueCases.filter(
    (item) => String(item.caseType ?? '').toLowerCase() === 'algae'
  );

  const fishCompatibilityResults = fishItems.map((item) => ({
    id: item.id,
    label: `${item.commonName ?? item.name ?? item.latinName ?? 'Ryba'} (${item.latinName ?? 'brak nazwy lacinskiej'})`,
    issues: checkFishCompatibility(item, measurement, tankLiters, tankProfile),
  }));
  const fishCompatibilitySummary = summarizeCompatibilityResults(
    fishCompatibilityResults
  );
  const incompatibleFishCount = fishCompatibilitySummary.speciesWithIssues;

  const fishSchoolingWarnings = fishItems
    .map((item) => {
      const schoolingProfile = resolveFishSchoolingProfile(item);
      const quantity = getFishQuantity(item);

      if (!schoolingProfile.isSchooling || quantity >= schoolingProfile.minGroupSize) {
        return null;
      }

      return {
        id: item.id,
        label: `${item.commonName ?? item.name ?? item.latinName ?? 'Ryba'} (${item.latinName ?? 'brak nazwy lacinskiej'})`,
        quantity,
        minGroupSize: schoolingProfile.minGroupSize,
      };
    })
    .filter(Boolean);
  const fishSchoolingWarningsCount = fishSchoolingWarnings.length;

  const fishAggressionConflicts = [];
  for (let index = 0; index < fishItems.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < fishItems.length; compareIndex += 1) {
      const conflict = getFishAggressionConflict(fishItems[index], fishItems[compareIndex]);
      if (conflict) {
        fishAggressionConflicts.push({
          id: `${fishItems[index].id}-${fishItems[compareIndex].id}`,
          firstFish: fishItems[index],
          secondFish: fishItems[compareIndex],
          ...conflict,
        });
      }
    }
  }
  const fishAggressionConflictsCount = fishAggressionConflicts.length;

  const plantCompatibilityResults = plantItems.map((item) => ({
    id: item.id,
    label: `${item.commonName ?? item.name ?? item.latinName ?? 'Roslina'} (${item.latinName ?? 'brak nazwy lacinskiej'})`,
    issues: checkPlantCompatibility(item, measurement, tankLiters, tankProfile),
  }));
  const plantCompatibilitySummary = summarizeCompatibilityResults(
    plantCompatibilityResults
  );
  const incompatiblePlantCount = plantCompatibilitySummary.speciesWithIssues;

  const fishStockingSummary = buildFishStockingSummary(stockItems, tankLiters);
  const activeIssueCasesCount = issueCases.length;

  const contextInsights = buildContextualEcosystemInsights({
    measurement,
    enabledTests,
    stockItems,
    tank,
    equipmentAssessment,
  });
  const baseAnalysis = measurement
    ? analyzeMeasurementLogic(measurement, enabledTests)
    : null;
  const analysis = mergeWaterAnalysisWithContext(baseAnalysis, contextInsights);
  const trendSuggestedEnvironment = buildTrendSuggestedEnvironmentForTank({
    fishItems,
    plantItems,
    activeDiseaseCases,
    activePlantDiseaseCases,
    activeAlgaeCases,
    measurement,
    tankProfile,
  });

  const attentionKeys = new Set();
  const addAttention = (key, condition) => {
    if (condition) {
      attentionKeys.add(key);
    }
  };

  addAttention(
    'equipment-heater',
    (equipmentAssessment.heater.status === 'warning' ||
      equipmentAssessment.heater.status === 'critical') &&
      (equipmentAssessment.heater.actions?.[0] || equipmentAssessment.heater.details)
  );
  addAttention(
    'equipment-filter',
    (equipmentAssessment.filter.status === 'warning' ||
      equipmentAssessment.filter.status === 'critical') &&
      (equipmentAssessment.filter.actions?.[0] || equipmentAssessment.filter.details)
  );
  addAttention(
    'temp',
    Boolean(
      trendSuggestedEnvironment.recommendedTempRange &&
        (trendSuggestedEnvironment.currentTempValue === null ||
          trendSuggestedEnvironment.isTempWithinSuggested === false)
    )
  );
  addAttention(
    'light',
    Boolean(
      trendSuggestedEnvironment.recommendedLightRange &&
        (trendSuggestedEnvironment.currentLightValue === null ||
          trendSuggestedEnvironment.isLightWithinSuggested === false)
    )
  );
  addAttention('fish-compat', incompatibleFishCount > 0);
  addAttention('fish-aggression', fishAggressionConflictsCount > 0);
  addAttention('fish-schooling', fishSchoolingWarningsCount > 0);
  addAttention(
    'stocking',
    fishStockingSummary.hasFish &&
      ((!fishStockingSummary.hasTankLiters && fishStockingSummary.hasFish) ||
        fishStockingSummary.ratio > 1.2 ||
        fishStockingSummary.isOverstocked)
  );
  addAttention('plant-compat', incompatiblePlantCount > 0);
  addAttention('issues', activeIssueCasesCount > 0);

  const planKeys = new Set();
  const addPlan = (key, condition = true) => {
    if (condition) {
      planKeys.add(key);
    }
  };

  (analysis?.recommendations ?? [])
    .slice(0, 3)
    .forEach((item, index) => {
      addPlan(`param-${item.parameter ?? index}`);
    });
  addPlan(
    'temp-fix',
    Boolean(
      trendSuggestedEnvironment.recommendedTempRange &&
        trendSuggestedEnvironment.isTempWithinSuggested === false
    )
  );
  addPlan(
    'light-fix',
    Boolean(
      trendSuggestedEnvironment.recommendedLightRange &&
        trendSuggestedEnvironment.isLightWithinSuggested === false
    )
  );
  addPlan(
    'equipment-heater',
    equipmentAssessment.heater.status === 'warning' ||
      equipmentAssessment.heater.status === 'critical'
  );
  addPlan(
    'equipment-filter',
    equipmentAssessment.filter.status === 'warning' ||
      equipmentAssessment.filter.status === 'critical'
  );
  addPlan('fish-aggression', fishAggressionConflictsCount > 0);
  addPlan('fish-compat', incompatibleFishCount > 0);
  addPlan('fish-schooling', fishSchoolingWarningsCount > 0);
  addPlan(
    'stocking',
    fishStockingSummary.hasFish &&
      fishStockingSummary.hasTankLiters &&
      (fishStockingSummary.ratio > 1.2 || fishStockingSummary.isOverstocked)
  );
  addPlan('plant-compat', incompatiblePlantCount > 0);
  addPlan('issues', activeIssueCasesCount > 0);
  [...activeDiseaseCases, ...activeAlgaeCases]
    .slice(0, 3)
    .forEach((item, index) => {
      addPlan(`therapy-${item.issueId ?? item.id ?? index}`);
    });

  return {
    planCount: Math.min(planKeys.size, 6),
    attentionCount: Math.min(attentionKeys.size, 6),
  };
}

function buildAttentionItemsForTank({
  hasEquipmentSaveAccess,
  equipmentAssessment,
  trendSuggestedEnvironment,
  fishCompatibilityResults = [],
  plantCompatibilityResults = [],
  fishAggressionConflictsCount = 0,
  fishAggressionConflicts = [],
  fishSchoolingWarningsCount = 0,
  fishSchoolingWarnings = [],
  fishStockingSummary,
  activeDiseaseCasesCount = 0,
  activeDiseaseCases = [],
  activePlantDiseaseCasesCount = 0,
  activePlantDiseaseCases = [],
  activeAlgaeCasesCount = 0,
  activeAlgaeCases = [],
  selectedTankHealthAssessment,
}) {
  const items = [];
  const seen = new Set();

  const getSuggestionPriorityScore = (severity, text) => {
    const normalized = String(text ?? '').toLowerCase();
    let score = severity === 'critical' ? 300 : 200;

    if (
      normalized.includes('konflikt') ||
      normalized.includes('agresj') ||
      normalized.includes('rozdziel') ||
      normalized.includes('aktywne problemy') ||
      normalized.includes('kryty')
    ) {
      score += 80;
    }

    if (
      normalized.includes('przerybienie') ||
      normalized.includes('zmniejsz obsade') ||
      normalized.includes('filtracj') ||
      normalized.includes('sprzet')
    ) {
      score += 50;
    }

    if (
      normalized.includes('uzupelnij') ||
      normalized.includes('dopasuj') ||
      normalized.includes('lekko')
    ) {
      score += 20;
    }

    return score;
  };

  const appendItem = (severity, text, details = []) => {
    const normalizedText = String(text ?? '').trim();
    if (!normalizedText) {
      return;
    }
    const key = normalizedText.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    items.push({
      id: key,
      severity: severity === 'critical' ? 'critical' : 'warning',
      text: normalizedText,
      details: Array.isArray(details)
        ? details
            .map((item) => String(item ?? '').trim())
            .filter(Boolean)
        : [],
      priority: getSuggestionPriorityScore(severity, normalizedText),
    });
  };

  if (hasEquipmentSaveAccess) {
    [equipmentAssessment.heater, equipmentAssessment.filter].forEach((entry) => {
      if (
        (entry.status === 'warning' || entry.status === 'critical') &&
        (entry.actions?.[0] || entry.details)
      ) {
        appendItem(
          entry.status,
          `Sprzet (${entry.title}) wymaga korekty.`,
          [
            entry.details,
            ...(Array.isArray(entry.actions) ? entry.actions.slice(0, 3) : []),
          ]
        );
      }
    });
  }

  if (
    trendSuggestedEnvironment.recommendedTempRange &&
    trendSuggestedEnvironment.currentTempValue === null
  ) {
    appendItem(
      'warning',
      `Dodaj aktualny pomiar temperatury i porownaj go z zakresem ${trendSuggestedEnvironment.recommendedTempRange.min}-${trendSuggestedEnvironment.recommendedTempRange.max} C.`
    );
  } else if (
    trendSuggestedEnvironment.recommendedTempRange &&
    trendSuggestedEnvironment.isTempWithinSuggested === false
  ) {
    appendItem(
      'critical',
      `Skoryguj temperature do ${trendSuggestedEnvironment.recommendedTempRange.min}-${trendSuggestedEnvironment.recommendedTempRange.max} C (aktualnie: ${trendSuggestedEnvironment.currentTempValue} C).`
    );
  }

  if (
    trendSuggestedEnvironment.recommendedLightRange &&
    trendSuggestedEnvironment.currentLightValue === null
  ) {
    appendItem(
      'warning',
      `Uzupelnij czas swiecenia lampy i porownaj go z zakresem ${trendSuggestedEnvironment.recommendedLightRange.min}-${trendSuggestedEnvironment.recommendedLightRange.max} h/dobe.`
    );
  } else if (
    trendSuggestedEnvironment.recommendedLightRange &&
    trendSuggestedEnvironment.isLightWithinSuggested === false
  ) {
    appendItem(
      'warning',
      `Skoryguj czas swiecenia do ${trendSuggestedEnvironment.recommendedLightRange.min}-${trendSuggestedEnvironment.recommendedLightRange.max} h/dobe (aktualnie: ${trendSuggestedEnvironment.currentLightValue} h).`
    );
  }

  const fishCompatibilitySummary = summarizeCompatibilityResults(
    fishCompatibilityResults
  );
  const fishMismatch = buildCompatibilityMismatchDetails(fishCompatibilityResults, {
    maxSpecies: 3,
    maxIssuesPerSpecies: 2,
  });
  const incompatibleFishCount = fishCompatibilitySummary.speciesWithIssues;
  const incompatibleFishMajorCount = fishCompatibilitySummary.speciesWithMajorIssues;
  const fishMismatchNames = formatCompactNameList(fishMismatch.names, 3);
  if (incompatibleFishCount > 0) {
      appendItem(
        incompatibleFishMajorCount >= 2 ? 'critical' : 'warning',
        fishMismatchNames
        ? `Niedopasowanie warunkow u ryb: ${fishMismatchNames}.`
        : `Wykryto niezgodnosci dla ryb (${incompatibleFishCount} gat.).`,
      [
        ...fishMismatch.details,
        `Mocniejsze odchylenia: ${incompatibleFishMajorCount}.`,
        'Dzialanie: dopasuj obsade do parametrow i litrazu akwarium.',
      ]
    );
  }

  const aggressionDetails = buildAggressionConflictDetails(
    fishAggressionConflicts,
    4
  );
  if (fishAggressionConflictsCount > 0) {
      appendItem(
        'critical',
        aggressionDetails.length > 0
        ? `Konflikty agresji: ${formatCompactNameList(aggressionDetails, 2)}.`
        : `Wykryto konflikty agresji miedzy rybami (${fishAggressionConflictsCount}).`,
      [
        ...aggressionDetails.map((pair) => `Konflikt: ${pair}.`),
        `Liczba konfliktow: ${fishAggressionConflictsCount}.`,
        'Dzialanie: rozdziel konfliktowe gatunki lub zmien obsade.',
      ]
    );
  }

  const schoolingDetails = buildSchoolingWarningDetails(fishSchoolingWarnings, 4);
  if (fishSchoolingWarningsCount > 0) {
      appendItem(
        'warning',
        schoolingDetails.length > 0
        ? `Za mala liczebnosc ryb stadnych: ${formatCompactNameList(
            fishSchoolingWarnings.map((item) => item?.label),
            3
          )}.`
        : `Za mala liczebnosc ryb stadnych (${fishSchoolingWarningsCount} gat.).`,
      [
        ...schoolingDetails,
        'Dzialanie: zwieksz liczebnosc ryb stadnych albo zmien gatunki.',
      ]
    );
  }

  if (fishStockingSummary.hasFish && !fishStockingSummary.hasTankLiters) {
    appendItem('warning', 'Uzupelnij litraz akwarium, aby poprawnie oceniac przerybienie.');
  } else if (
    fishStockingSummary.hasFish &&
    fishStockingSummary.hasTankLiters &&
    fishStockingSummary.ratio > 1.2
  ) {
    appendItem(
      'critical',
      `Zmniejsz obsade lub zwieksz litraz: przerybienie na poziomie ${Math.round(fishStockingSummary.ratio * 100)}%.`
    );
  } else if (fishStockingSummary.isOverstocked) {
    appendItem(
      'warning',
      `Obsada jest lekko za duza (${Math.round(fishStockingSummary.ratio * 100)}%). Warto odciazyc zbiornik.`
    );
  }

  const plantCompatibilitySummary = summarizeCompatibilityResults(
    plantCompatibilityResults
  );
  const plantMismatch = buildCompatibilityMismatchDetails(plantCompatibilityResults, {
    maxSpecies: 3,
    maxIssuesPerSpecies: 2,
  });
  const incompatiblePlantCount = plantCompatibilitySummary.speciesWithIssues;
  const incompatiblePlantMajorCount = plantCompatibilitySummary.speciesWithMajorIssues;
  const plantMismatchNames = formatCompactNameList(plantMismatch.names, 3);
  if (incompatiblePlantCount > 0) {
      appendItem(
        incompatiblePlantMajorCount >= 2 ? 'critical' : 'warning',
        plantMismatchNames
        ? `Niedopasowanie warunkow u roslin: ${plantMismatchNames}.`
        : `Wykryto niezgodnosci dla roslin (${incompatiblePlantCount} gat.).`,
      [
        ...plantMismatch.details,
        `Mocniejsze odchylenia: ${incompatiblePlantMajorCount}.`,
        'Dzialanie: dopasuj gatunki do pH, GH/KH, oswietlenia i temperatury.',
      ]
    );
  }

  const activeIssueCasesCount =
    activeDiseaseCasesCount + activePlantDiseaseCasesCount + activeAlgaeCasesCount;
  const activeIssueNames = formatCompactNameList(
    [
      ...activeDiseaseCases.map((item) => getIssueCaseDisplayName(item)),
      ...activePlantDiseaseCases.map((item) => getIssueCaseDisplayName(item)),
      ...activeAlgaeCases.map((item) => getIssueCaseDisplayName(item)),
    ],
    4
  );
  if (activeIssueCasesCount > 0) {
      appendItem(
        activeIssueCasesCount > 1 ? 'critical' : 'warning',
        activeIssueNames
        ? `Aktywne problemy: ${activeIssueNames}.`
        : `Masz aktywne problemy zdrowotne/glony (${activeIssueCasesCount}).`,
      [
        `Choroby ryb: ${activeDiseaseCasesCount}.`,
        `Choroby roslin: ${activePlantDiseaseCasesCount}.`,
        `Glony: ${activeAlgaeCasesCount}.`,
        'Dzialanie: realizuj plan leczenia i harmonogram dla aktywnych problemow.',
      ]
    );
  }

  if (items.length === 0 && selectedTankHealthAssessment?.score < 85) {
    (selectedTankHealthAssessment.penalties ?? [])
      .slice(0, 2)
      .forEach((penalty) =>
        appendItem(penalty.points >= 12 ? 'critical' : 'warning', penalty.text)
      );
  }

  return items
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, 6);
}

const SEVERITY_LABEL = {
  ok: 'OK',
  warning: 'UWAGA',
  critical: 'KRYTYCZNE',
};

const SEVERITY_COLOR = {
  ok: '#2f9e44',
  warning: '#e6a700',
  critical: '#d9480f',
};

const TEST_PARAMETER_OPTIONS = [
  { key: 'ph', label: 'pH' },
  { key: 'gh', label: 'GH' },
  { key: 'kh', label: 'KH' },
  { key: 'ca', label: 'Ca' },
  { key: 'mg', label: 'Mg' },
  { key: 'no2', label: 'NO2' },
  { key: 'no3', label: 'NO3' },
  { key: 'nh3nh4', label: 'NH3/NH4' },
  { key: 'po4', label: 'PO4' },
  { key: 'fe', label: 'Fe' },
  { key: 'temperature', label: 'Temp' },
];
const ALL_MEASUREMENT_TESTS = TEST_PARAMETER_OPTIONS.reduce((acc, option) => {
  acc[option.key] = true;
  return acc;
}, {});

const LANGUAGE_OPTIONS = [
  { value: 'pl', labelKey: 'polish' },
  { value: 'en', labelKey: 'englishSoon' },
  { value: 'de', labelKey: 'germanSoon' },
];

const HISTORY_CHART_PARAMETERS = [
  { key: 'ph', label: 'pH', unit: '' },
  { key: 'gh', label: 'GH', unit: 'dGH' },
  { key: 'kh', label: 'KH', unit: 'dKH' },
  { key: 'co2', label: 'CO2', unit: 'mg/l' },
  { key: 'ca', label: 'Ca', unit: 'mg/l' },
  { key: 'mg', label: 'Mg', unit: 'mg/l' },
  { key: 'no2', label: 'NO2', unit: 'mg/l' },
  { key: 'no3', label: 'NO3', unit: 'mg/l' },
  { key: 'nh3nh4', label: 'NH3/NH4', unit: 'mg/l' },
  { key: 'po4', label: 'PO4', unit: 'mg/l' },
  { key: 'fe', label: 'Fe', unit: 'mg/l' },
  { key: 'temperature', label: 'Temp', unit: 'C' },
];

const DISEASE_SEVERITY_PRIORITY = {
  low: 0,
  medium: 1,
  high: 2,
};

function getHighestSeverity(severities = []) {
  if (severities.some((severity) => severity === 'critical')) {
    return 'critical';
  }

  if (severities.some((severity) => severity === 'warning')) {
    return 'warning';
  }

  return 'none';
}

const SUBSTRATE_OPTIONS = [
  { value: 'sand', label: 'Piasek', labelKey: 'substrateSand' },
  { value: 'fine_gravel', label: 'Drobny zwir', labelKey: 'substrateFineGravel' },
  { value: 'gravel', label: 'Zwir', labelKey: 'substrateGravel' },
  { value: 'active_soil', label: 'Podloze aktywne', labelKey: 'substrateActiveSoil' },
  { value: 'mixed', label: 'Mieszane', labelKey: 'substrateMixed' },
  { value: 'other', label: 'Inne', labelKey: 'substrateOther' },
];

const LIGHT_INTENSITY_OPTIONS = [
  { value: 'low', label: 'Niska', labelKey: 'lightLow' },
  { value: 'medium', label: 'Srednia', labelKey: 'lightMedium' },
  { value: 'high', label: 'Wysoka', labelKey: 'lightHigh' },
];

const AQUARIUM_TYPE_OPTIONS = [
  { value: 'plant', label: 'Roslinne', labelKey: 'aquariumTypePlant' },
  { value: 'shrimp', label: 'Krewetkarskie', labelKey: 'aquariumTypeShrimp' },
  { value: 'mixed', label: 'Mieszane', labelKey: 'aquariumTypeMixed' },
];
const PLANT_FERTILIZATION_TYPE_ROOT_TABS = 'root_tabs';
const ROOT_TABS_DEFAULT_DURATION_DAYS = 90;
const ROOT_TABS_DUE_SOON_DAYS = 14;
const MAX_PLANT_FERTILIZATION_ENTRIES = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

const ONBOARDING_START_OPTIONS = [
  { value: 'existing_running', label: 'Nowe, ale juz dzialajace' },
  { value: 'fresh_start', label: 'Zakladam od zera (start cyklu)' },
];

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 .-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeLatinCatalogKey(value) {
  const normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (!normalized) {
    return '';
  }

  const tokens = normalized.split(' ').filter(Boolean);

  if (tokens.length >= 2) {
    const genus = tokens[0];
    const rank = tokens[1].replace(/\./g, '');

    if (rank === 'spp' || rank === 'sp') {
      return `${genus} spp`;
    }
  }

  return normalized
    .replace(/\bsp\.\b/g, 'sp')
    .replace(/\bspp\.\b/g, 'spp');
}

function normalizeSubstrateType(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeLightIntensity(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeAquariumType(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return AQUARIUM_TYPE_OPTIONS.some((item) => item.value === normalized)
    ? normalized
    : '';
}

function normalizeOnboardingMode(value) {
  return String(value ?? '').trim().toLowerCase() === 'fresh_start'
    ? 'fresh_start'
    : 'existing_running';
}

function normalizeOnboardingTaskChecks(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.entries(value).reduce((acc, [key, itemValue]) => {
    const normalizedKey = String(key ?? '').trim();
    if (!normalizedKey) {
      return acc;
    }
    acc[normalizedKey] = Boolean(itemValue);
    return acc;
  }, {});
}

function normalizePlantFertilizationType(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === PLANT_FERTILIZATION_TYPE_ROOT_TABS
    ? PLANT_FERTILIZATION_TYPE_ROOT_TABS
    : '';
}

function parsePositiveInteger(value, fallbackValue) {
  const normalized = Math.round(Number(value));
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return Math.max(1, Math.round(Number(fallbackValue) || 1));
  }
  return normalized;
}

function buildPlantFertilizationEntryId() {
  return `fert-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function resolveRootTabsEntryStatus(entry, nowMs = Date.now()) {
  if (normalizePlantFertilizationType(entry?.type) !== PLANT_FERTILIZATION_TYPE_ROOT_TABS) {
    return null;
  }

  const addedAtMs = getCreatedAtMs(entry?.createdAt);
  if (!addedAtMs) {
    return null;
  }

  const durationDays = parsePositiveInteger(
    entry?.durationDays,
    ROOT_TABS_DEFAULT_DURATION_DAYS
  );
  const endAtMs = addedAtMs + durationDays * DAY_MS;
  const daysLeft = Math.ceil((endAtMs - nowMs) / DAY_MS);
  const status =
    daysLeft <= 0
      ? 'expired'
      : daysLeft <= ROOT_TABS_DUE_SOON_DAYS
        ? 'due_soon'
        : 'active';

  return {
    addedAtMs,
    durationDays,
    endAtMs,
    daysLeft,
    status,
  };
}

function normalizePlantFertilizationEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      const type = normalizePlantFertilizationType(entry?.type);
      const productName = String(entry?.productName ?? entry?.name ?? '').trim();
      const note = String(entry?.note ?? '').trim();
      const addedAtMs = getCreatedAtMs(entry?.createdAt);

      if (!type || !productName || !addedAtMs) {
        return null;
      }

      const durationDays =
        type === PLANT_FERTILIZATION_TYPE_ROOT_TABS
          ? parsePositiveInteger(entry?.durationDays, ROOT_TABS_DEFAULT_DURATION_DAYS)
          : null;
      const quantity = parsePositiveInteger(entry?.quantity, 1);
      const normalizedNameToken = normalizeText(productName).replace(/\s+/g, '-');
      const fallbackId = `${type}-${addedAtMs}-${normalizedNameToken || 'entry'}`;

      return {
        id: String(entry?.id ?? fallbackId),
        type,
        productName,
        note,
        createdAt: entry.createdAt,
        quantity,
        durationDays,
      };
    })
    .filter(Boolean)
    .sort((a, b) => getCreatedAtMs(b.createdAt) - getCreatedAtMs(a.createdAt));
}

function summarizePlantFertilization(entries, nowMs = Date.now()) {
  const normalizedEntries = normalizePlantFertilizationEntries(entries);
  let rootTabsActiveCount = 0;
  let rootTabsDueSoonCount = 0;
  let rootTabsExpiredCount = 0;
  let rootTabsSupportDaysLeft = 0;

  normalizedEntries.forEach((entry) => {
    const rootTabsStatus = resolveRootTabsEntryStatus(entry, nowMs);
    if (!rootTabsStatus) {
      return;
    }

    if (rootTabsStatus.status === 'expired') {
      rootTabsExpiredCount += 1;
      return;
    }

    rootTabsActiveCount += 1;
    rootTabsSupportDaysLeft = Math.max(rootTabsSupportDaysLeft, rootTabsStatus.daysLeft);
    if (rootTabsStatus.status === 'due_soon') {
      rootTabsDueSoonCount += 1;
    }
  });

  return {
    entries: normalizedEntries,
    rootTabsActiveCount,
    rootTabsDueSoonCount,
    rootTabsExpiredCount,
    hasActiveRootTabs: rootTabsActiveCount > 0,
    rootTabsSupportDaysLeft,
  };
}

function getSubstrateLabel(value) {
  const normalized = normalizeSubstrateType(value);
  const option = SUBSTRATE_OPTIONS.find((item) => item.value === normalized);
  return option ? option.label : 'Brak danych';
}

function getLightIntensityLabel(value) {
  const normalized = normalizeLightIntensity(value);
  const option = LIGHT_INTENSITY_OPTIONS.find(
    (item) => item.value === normalized
  );
  return option ? option.label : 'Brak danych';
}

function getStockNameFingerprint(item) {
  return normalizeText(
    `${item.commonName ?? ''} ${item.latinName ?? ''} ${item.name ?? ''}`
  );
}

function inferFishSubstrateNeed(item) {
  const fingerprint = getStockNameFingerprint(item);
  const softBottomKeywords = [
    'corydoras',
    'kirys',
    'pangio',
    'piskorek',
    'botia',
    'bocja',
    'geophagus',
    'mikrogeophagus',
  ];

  if (softBottomKeywords.some((keyword) => fingerprint.includes(keyword))) {
    return 'soft';
  }

  return null;
}

function inferFishLightRange(item) {
  const fingerprint = getStockNameFingerprint(item);
  const dimmerKeywords = [
    'betta',
    'bojownik',
    'trichogaster',
    'trichopodus',
    'gurami',
    'apistogramma',
    'pielegniczka',
    'symphysodon',
    'dyskowiec',
    'pterophyllum',
    'skalar',
    'paracheirodon',
    'neon',
    'nannostomus',
  ];
  const brighterKeywords = [
    'mbuna',
    'pseudotropheus',
    'maylandia',
    'metriaclima',
    'chindongo',
    'tropheus',
  ];

  if (dimmerKeywords.some((keyword) => fingerprint.includes(keyword))) {
    return { min: 'low', max: 'medium' };
  }

  if (brighterKeywords.some((keyword) => fingerprint.includes(keyword))) {
    return { min: 'medium', max: 'high' };
  }

  return null;
}

function inferPlantSubstrateNeed(item) {
  const fingerprint = getStockNameFingerprint(item);
  const epiphytes = [
    'anubias',
    'microsorum',
    'bolbitis',
    'bucephalandra',
    'taxiphyllum',
    'vesicularia',
    'fissidens',
    'mch',
    'subwassertang',
    'lomariopsis',
  ];
  const rootFeeders = [
    'cryptocoryne',
    'kryptokoryna',
    'echinodorus',
    'zabienica',
    'helanthium',
    'vallisneria',
    'nurzaniec',
    'sagittaria',
    'nymphaea',
    'aponogeton',
    'crinum',
    'eriocaulon',
    'blyxa',
    'tonina',
  ];

  if (epiphytes.some((keyword) => fingerprint.includes(keyword))) {
    return 'neutral';
  }

  if (rootFeeders.some((keyword) => fingerprint.includes(keyword))) {
    return 'nutrient';
  }

  return null;
}

function inferPlantLightRange(item) {
  const fingerprint = getStockNameFingerprint(item);
  const highLight = [
    'alternanthera',
    'rotala',
    'ludwigia arcuata',
    'ludwigia inclinata',
    'hemianthus callitrichoides',
    'hemianthus cuba',
    'glossostigma',
    'eriocaulon',
    'tonina',
    'pogostemon erectus',
  ];
  const lowLight = [
    'anubias',
    'microsorum',
    'bolbitis',
    'bucephalandra',
    'taxiphyllum',
    'vesicularia',
    'fissidens',
    'cryptocoryne',
    'kryptokoryna',
    'mch',
  ];

  if (highLight.some((keyword) => fingerprint.includes(keyword))) {
    return { min: 'medium', max: 'high', minHours: 8, maxHours: 11 };
  }

  if (lowLight.some((keyword) => fingerprint.includes(keyword))) {
    return { min: 'low', max: 'medium', minHours: 6, maxHours: 9 };
  }

  return { min: 'low', max: 'high', minHours: 6, maxHours: 10 };
}

function lightLevelToRank(level) {
  if (level === 'low') {
    return 0;
  }

  if (level === 'medium') {
    return 1;
  }

  if (level === 'high') {
    return 2;
  }

  return null;
}

function isSoftBottomSubstrate(substrateType) {
  return (
    substrateType === 'sand' ||
    substrateType === 'fine_gravel' ||
    substrateType === 'active_soil' ||
    substrateType === 'mixed'
  );
}

function isNutrientSubstrate(substrateType) {
  return substrateType === 'active_soil' || substrateType === 'mixed';
}

function buildTankEnvironmentProfile(tank) {
  const lightHours = Number(tank?.lightHours);
  const fertilizationSummary = summarizePlantFertilization(tank?.plantFertilizationEntries);

  return {
    substrateType: normalizeSubstrateType(tank?.substrateType),
    lightIntensity: normalizeLightIntensity(tank?.lightIntensity),
    lightHours: Number.isFinite(lightHours) ? lightHours : null,
    hasActiveRootTabsSupport: fertilizationSummary.hasActiveRootTabs,
    rootTabsSupportDaysLeft: fertilizationSummary.rootTabsSupportDaysLeft,
  };
}

const EXPANDED_FISH_DEFAULTS = {
  phMin: 6.0,
  phMax: 8.0,
  ghMin: 3,
  ghMax: 18,
  tempMin: 22,
  tempMax: 28,
  minLiters: 80,
  notes:
    'Profil orientacyjny dla gatunku/rodzaju. Zweryfikuj docelowe parametry przed zakupem.',
};

const DEFAULT_SCHOOLING_GROUP_SIZE = 6;
const SCHOOLING_FISH_KEYWORDS = [
  'stadna',
  'lawic',
  'grupie',
  'paracheirodon',
  'neon',
  'hemigrammus',
  'hyphessobrycon',
  'tetra',
  'trigonostigma',
  'razbora',
  'boraras',
  'danio',
  'devario',
  'puntigrus',
  'puntius',
  'pethia',
  'brzanka',
  'chromobotia',
  'ambastaia',
  'botia',
  'bocja',
  'pangio',
  'piskorek',
  'corydoras',
  'kirys',
  'otocinclus',
  'otosek',
  'melanotaenia',
  'teczanka',
  'nematobrycon',
  'phenacogrammus',
  'gymnocorymbus',
  'inpaichthys',
  'sawbwa',
];
const AGGRESSION_COMPATIBILITY_MATRIX = {
  peaceful: {
    peaceful: false,
    'semi-aggressive': false,
    aggressive: true,
  },
  'semi-aggressive': {
    peaceful: true,
    'semi-aggressive': false,
    aggressive: true,
  },
  aggressive: {
    peaceful: true,
    'semi-aggressive': true,
    aggressive: true,
  },
};
const FISH_AGGRESSION_LEVEL_OVERRIDES = {
  'astronotus ocellatus': 'aggressive',
  'betta splendens': 'semi-aggressive',
  'carinotetraodon travancoricus': 'aggressive',
  'chindongo demasoni': 'aggressive',
  'chindongo saulosi': 'semi-aggressive',
  'colomesus asellus': 'aggressive',
  'cyphotilapia frontosa': 'aggressive',
  'dichotomyctere nigroviridis': 'aggressive',
  'epalzeorhynchos bicolor': 'aggressive',
  'epalzeorhynchos frenatum': 'semi-aggressive',
  'epalzeorhynchos kalopterus': 'semi-aggressive',
  'labidochromis caeruleus': 'semi-aggressive',
  'maylandia lombardoi': 'aggressive',
  'maylandia zebra': 'aggressive',
  'metriaclima estherae': 'semi-aggressive',
  'mikrogeophagus ramirezi': 'semi-aggressive',
  'pseudotropheus acei': 'semi-aggressive',
  'pseudotropheus cyaneorhabdos': 'semi-aggressive',
  'rocio octofasciata': 'aggressive',
  'trichromis salvini': 'aggressive',
  'trichopodus trichopterus': 'semi-aggressive',
  'puntigrus tetrazona': 'semi-aggressive',
  'pterophyllum scalare': 'semi-aggressive',
  'tropheus duboisi': 'aggressive',
  'tropheus moorii': 'aggressive',
};
const AGGRESSIVE_FISH_KEYWORDS = [
  'aggressive',
  'silnie terytorialny',
  'drapiez',
  'flowerhorn',
  'jack dempsey',
  'green terror',
  'oscar',
  'astronotus',
  'rozdymka',
  'puffer',
  'red tail shark',
  'frontosa',
  'tropheus',
  'maylandia',
  'metriaclima',
  'melanochromis',
  'pseudotropheus demasoni',
  'chindongo demasoni',
  'lombardoi',
  'salvini',
  'rocio octofasciata',
];
const SEMI_AGGRESSIVE_FISH_KEYWORDS = [
  'semi aggressive',
  'semi-aggressive',
  'terytorial',
  'moze podskubywac',
  'zaczepna',
  'bojownik',
  'betta',
  'skalar',
  'pterophyllum',
  'gurami',
  'trichopodus',
  'trichogaster',
  'trichopsis',
  'apistogramma',
  'pielegniczka',
  'barwniak',
  'pelvicachromis',
  'brzanka sumatrzanska',
  'puntigrus tetrazona',
  'epalzeorhynchos',
  'pyszczak',
];

function parseOptionalPositiveInteger(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.max(2, Math.round(parsed));
}

function inferFishSchooling(rawFish) {
  const fingerprint = normalizeText(
    `${rawFish?.commonName ?? ''} ${rawFish?.latinName ?? ''} ${rawFish?.notes ?? ''}`
  );

  return SCHOOLING_FISH_KEYWORDS.some((keyword) => fingerprint.includes(keyword));
}

function resolveFishSchoolingProfile(rawFish) {
  const normalizedExplicitFlag = String(rawFish?.isSchooling ?? '')
    .trim()
    .toLowerCase();
  const explicitIsSchooling =
    normalizedExplicitFlag === 'true'
      ? true
      : normalizedExplicitFlag === 'false'
        ? false
        : typeof rawFish?.isSchooling === 'boolean'
          ? rawFish.isSchooling
          : null;
  const isSchooling = explicitIsSchooling ?? inferFishSchooling(rawFish);
  const explicitMinGroupSize = parseOptionalPositiveInteger(rawFish?.minGroupSize);

  return {
    isSchooling,
    minGroupSize: isSchooling
      ? explicitMinGroupSize ?? DEFAULT_SCHOOLING_GROUP_SIZE
      : 0,
  };
}

function normalizeAggressionLevel(value) {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (normalized === 'aggressive') {
    return 'aggressive';
  }

  if (normalized === 'semi-aggressive' || normalized === 'semi aggressive') {
    return 'semi-aggressive';
  }

  return 'peaceful';
}

function inferFishAggressionLevel(rawFish) {
  const latinKey = normalizeLatinCatalogKey(rawFish?.latinName);
  const explicitOverride = FISH_AGGRESSION_LEVEL_OVERRIDES[latinKey];

  if (explicitOverride) {
    return explicitOverride;
  }

  const fingerprint = normalizeText(
    `${rawFish?.commonName ?? ''} ${rawFish?.latinName ?? ''} ${rawFish?.notes ?? ''}`
  );

  if (AGGRESSIVE_FISH_KEYWORDS.some((keyword) => fingerprint.includes(keyword))) {
    return 'aggressive';
  }

  if (
    SEMI_AGGRESSIVE_FISH_KEYWORDS.some((keyword) =>
      fingerprint.includes(keyword)
    )
  ) {
    return 'semi-aggressive';
  }

  return 'peaceful';
}

function resolveFishAggressionLevel(rawFish) {
  const explicitLevel = String(rawFish?.aggressionLevel ?? '').trim();

  if (explicitLevel) {
    return normalizeAggressionLevel(explicitLevel);
  }

  return inferFishAggressionLevel(rawFish);
}

function getFishAggressionConflict(firstFish, secondFish) {
  const firstLevel = resolveFishAggressionLevel(firstFish);
  const secondLevel = resolveFishAggressionLevel(secondFish);
  const hasConflict =
    AGGRESSION_COMPATIBILITY_MATRIX[firstLevel]?.[secondLevel] ?? false;

  if (!hasConflict) {
    return null;
  }

  return {
    firstLevel,
    secondLevel,
  };
}

const FISH_GENUS_POLISH_LABELS = {
  Ambastaia: 'Bocja',
  Anabas: 'Okoniec wspinaczkowy',
  Apistogramma: 'Pielegniczka',
  Aphyosemion: 'Szczupienczyk',
  Aspidoras: 'Kirysek',
  Badis: 'Badis',
  Balantiocheilos: 'Rekin',
  Boraras: 'Mikrorazbora',
  Botia: 'Bocja',
  Carnegiella: 'Topornica',
  Carinotetraodon: 'Rozdymka',
  Channa: 'Wezoglow',
  Chilatherina: 'Teczanka',
  Colomesus: 'Rozdymka',
  Copella: 'Kaseczka',
  Corydoras: 'Kirysek',
  Ctenopoma: 'Ktenopoma',
  Danio: 'Danio',
  Dario: 'Badis',
  Devario: 'Danio',
  Epalzeorhynchos: 'Grubowarg',
  Erpetoichthys: 'Trzciniak',
  Fundulopanchax: 'Szczupienczyk',
  Garra: 'Glonojad garra',
  Gasteropelecus: 'Topornica',
  Glossolepis: 'Teczanka',
  Hasemania: 'Tetra',
  Helostoma: 'Gurami',
  Hemichromis: 'Pielegnica',
  Hemigrammus: 'Tetra',
  Hyphessobrycon: 'Tetra',
  Iriatherina: 'Teczanka',
  Jordanella: 'Karpieniec',
  Kryptopterus: 'Sumik szklisty',
  Lamprologus: 'Muszlowiec',
  Leiarius: 'Sum',
  Macrognathus: 'Wegorz kolczasty',
  Mastacembelus: 'Wegorz kolczasty',
  Melanotaenia: 'Teczanka',
  Mikrogeophagus: 'Pielegniczka',
  Moenkhausia: 'Bystrzyk',
  Nannacara: 'Pstraznica',
  Nannostomus: 'Olowek',
  Nematobrycon: 'Tetra cesarska',
  Neolamprologus: 'Ksiezniczka',
  Nothobranchius: 'Szczupienczyk',
  Osphronemus: 'Gurami',
  Pangasianodon: 'Rekin sumi',
  Pangasius: 'Rekin sumi',
  Pangio: 'Piskorek',
  Paracheirodon: 'Neon',
  Parachanna: 'Wezoglow',
  Pelvicachromis: 'Barwniak',
  Pethia: 'Brzanka',
  Petitella: 'Zwinnik',
  Pimelodus: 'Sumik',
  Poecilia: 'Zyworodka',
  Polypterus: 'Wielopletwiec',
  Pseudomugil: 'Blekitnook',
  Pterophyllum: 'Skalar',
  Puntigrus: 'Brzanka',
  Rasbora: 'Razbora',
  Rhinogobius: 'Babka',
  Sahyadria: 'Brzanka',
  Stiphodon: 'Babka',
  Symphysodon: 'Dyskowiec',
  Synodontis: 'Sumik',
  Tateurndina: 'Babka pawiooka',
  Tanichthys: 'Kardynalek',
  Trichogaster: 'Pretnik',
  Trichopodus: 'Gurami',
  Trichopsis: 'Gurami',
  Trigonostigma: 'Razbora',
  Tropheus: 'Pyszczak Tropheus',
  Xiphophorus: 'Zmieniak',
};

const FISH_LATIN_TO_POLISH_COMMON = {
  'anabas testudineus': 'Okoniec wspinaczkowy',
  'ambastaia sidthimunki': 'Bocja karlowata',
  'apistogramma agassizii': 'Pielegniczka agassiza',
  'apistogramma borellii': 'Pielegniczka borelli',
  'apistogramma cacatuoides': 'Pielegniczka kakadu',
  'apistogramma macmasteri': 'Pielegniczka macmasteri',
  'apistogramma nijsseni': 'Pielegniczka nijsseni',
  'apistogramma trifasciata': 'Pielegniczka trojprega',
  'apistogramma viejita': 'Pielegniczka viejita',
  'aphyosemion australe': 'Szczupienczyk australe',
  'balantiocheilos melanopterus': 'Rekin bala',
  'badis badis': 'Badis niebieski',
  'carinotetraodon travancoricus': 'Rozdymka karlowata',
  'channa aurantimaculata': 'Wezoglow pomaranczowoplamy',
  'channa bleheri': 'Wezoglow teczowy',
  'channa gachua': 'Wezoglow karlowaty',
  'chilatherina bleheri': 'Teczanka Blehera',
  'colomesus asellus': 'Rozdymka amazonska',
  'corydoras axelrodi': 'Kirysek Axelroda',
  'corydoras bondi': 'Kirysek Bonda',
  'corydoras delphax': 'Kirysek Delphax',
  'corydoras geoffroy': 'Kirysek Geoffroya',
  'corydoras melanotaenia': 'Kirysek zloto-przegi',
  'corydoras nattereri': 'Kirysek Natterera',
  'corydoras ornatus': 'Kirysek ozdobny',
  'corydoras osteocarus': 'Kirysek Osteocarus',
  'corydoras pastazensis': 'Kirysek Pastaza',
  'corydoras xinguensis': 'Kirysek Xingu',
  'ctenopoma acutirostre': 'Ktenopoma lamparcia',
  'ctenopoma kingsleyae': 'Ktenopoma Kingsleya',
  'ctenopoma weeksii': 'Ktenopoma Weeksa',
  'crossocheilus langei': 'Glonojad syjamski',
  'danio choprae': 'Danio Choprae',
  'danio dangila': 'Danio pregowane',
  'danio kyathit': 'Danio kyathit',
  'danio tinwini': 'Danio tinwini',
  'devario aequipinnatus': 'Danio olbrzymie',
  'epalzeorhynchos bicolor': 'Grubowarg dwubarwny',
  'epalzeorhynchos frenatum': 'Grubowarg teczowy',
  'epalzeorhynchos kalopterus': 'Latajacy lis',
  'fundulopanchax gardneri': 'Szczupienczyk Gardnera',
  'garra flavatra': 'Garra panda',
  'garra rufa': 'Garra rufa',
  'glossolepis incisus': 'Teczanka czerwona',
  'hasemania nana': 'Tetra miedziana',
  'hemigrammus bleheri': 'Zwinnik czerwononosy',
  'hemichromis bimaculatus': 'Pielegnica klejnotowa',
  'helostoma temminckii': 'Gurami calujacy',
  'iratherina werneri': 'Teczanka wstegowa',
  'iriatherina werneri': 'Teczanka wstegowa',
  'julidochromis transcriptus': 'Naskalnik transcriptus',
  'lamprologus ocellatus': 'Muszlowiec oczkowany',
  'melanotaenia boesemani': 'Teczanka Boesemana',
  'melanotaenia parva': 'Teczanka mala',
  'melanotaenia praecox': 'Teczanka neonowa',
  'mikrogeophagus altispinosus': 'Pielgniczka boliwijska',
  'moenkhausia pittieri': 'Bystrzyk romboidalny',
  'nannacara anomala': 'Pstraznica karlowata',
  'nannostomus beckfordi': 'Olowek Beckforda',
  'nannostomus marginatus': 'Olowek karlowaty',
  'neolamprologus brichardi': 'Ksiezniczka z Burundi',
  'nematobrycon palmeri': 'Tetra cesarska',
  'nothobranchius rachovii': 'Szczupienczyk Rachowa',
  'osphronemus goramy': 'Gurami olbrzymi',
  'pangasianodon hypophthalmus': 'Pangasius rekini',
  'pangio kuhlii': 'Piskorek Kuhla',
  'paracheirodon axelrodi': 'Neon czerwony',
  'paracheirodon innesi': 'Neon Innesa',
  'paracheirodon simulans': 'Neon zielony',
  'parachanna obscura': 'Wezoglow afrykanski',
  'pelvicachromis taeniatus': 'Barwniak teczowy',
  'pethia conchonius': 'Brzanka rozowa',
  'pethia nigrofasciata': 'Brzanka czarnoprega',
  'pethia padamya': 'Brzanka odesska',
  'poecilia latipinna': 'Molinezja ostrousta',
  'poecilia velifera': 'Molinezja zaglopletwa',
  'polypterus endlicheri': 'Wielopletwiec Endlichera',
  'polypterus ornatipinnis': 'Wielopletwiec ozdobny',
  'polypterus senegalus': 'Wielopletwiec senegalski',
  'pseudomugil furcatus': 'Blekitnook widlastopletwy',
  'pseudomugil gertrudae': 'Blekitnook Gertrudy',
  'pseudomugil luminatus': 'Blekitnook neonowy',
  'puntigrus tetrazona': 'Brzanka sumatrzanska',
  'rasbora trilineata': 'Razbora nozycowa',
  'sahyadria denisonii': 'Brzanka Denissona',
  'stiphodon percnopterygionus': 'Babka Stiphodon',
  'stiphodon rutilaureus': 'Babka Stiphodon zlota',
  'symphysodon aequifasciatus': 'Dyskowiec brazowy',
  'symphysodon discus': 'Dyskowiec Heckla',
  'tanichthys micagemmae': 'Kardynalek wietnamski',
  'tateurndina ocellicauda': 'Babka pawiooka',
  'trichogaster chuna': 'Pretnik miodowy',
  'trichopodus leerii': 'Gurami perlowy',
  'trichopodus trichopterus': 'Gurami dwuplamisty',
  'trichopsis vittata': 'Gurami kroczacy',
  'trigonostigma truncata': 'Razbora klinowa czarna',
  'tropheus duboisi': 'Tropheus Duboisi',
  'tropheus moorii': 'Tropheus Moori',
  'xiphophorus helleri': 'Mieczyk Hellera',
  'xiphophorus maculatus': 'Platka',
  'xiphophorus variatus': 'Zmienniak plamisty',
};

function normalizeLatinKey(value) {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function getPolishCommonNameForLatin(latinName) {
  const latin = String(latinName ?? '').trim();
  const latinKey = normalizeLatinKey(latin);
  const exact = FISH_LATIN_TO_POLISH_COMMON[latinKey];

  if (exact) {
    return exact;
  }

  const [genus, ...rest] = latin.split(/\s+/);
  const descriptor = rest.join(' ').trim();
  const genusLabel = FISH_GENUS_POLISH_LABELS[genus];

  if (descriptor === 'spp.') {
    if (genusLabel) {
      return `${genusLabel} (profil rodzaju)`;
    }

    return `Ryby z rodzaju ${genus} (profil rodzaju)`;
  }

  if (genusLabel) {
    return genusLabel;
  }

  return `Ryba z rodzaju ${genus}`;
}

function shouldAutoPolishCommonName(commonName, latinName) {
  const common = normalizeText(commonName);
  const latin = normalizeText(latinName);

  if (!common || !latin) {
    return false;
  }

  if (common === latin) {
    return true;
  }

  return common === latin.replace(/\s+spp\.?$/, '');
}

function getSupportedCatalogLocale(locale) {
  const normalized = String(locale ?? 'pl').trim().toLowerCase();

  if (normalized === 'en' || normalized === 'de') {
    return normalized;
  }

  return 'pl';
}

function getLocalizedNameFromCatalogMap(nameMap, latinName, locale) {
  const latinKey = normalizeLatinCatalogKey(latinName);
  const translatedNames = nameMap[latinKey];

  if (!translatedNames) {
    return '';
  }

  const normalizedLocale = getSupportedCatalogLocale(locale);

  return String(
    translatedNames[normalizedLocale] ?? translatedNames.pl ?? ''
  ).trim();
}

function getLocalizedFishCommonName(commonName, latinName, locale = 'pl') {
  const mappedCommonName = getLocalizedNameFromCatalogMap(
    FISH_LOCALIZED_COMMON_NAMES_BY_LATIN,
    latinName,
    locale
  );

  if (mappedCommonName) {
    return mappedCommonName;
  }

  const fallbackCommonName = String(commonName ?? '').trim();

  if (
    getSupportedCatalogLocale(locale) === 'pl' &&
    shouldAutoPolishCommonName(fallbackCommonName, latinName)
  ) {
    return getPolishCommonNameForLatin(latinName);
  }

  return fallbackCommonName;
}

function parseFishNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildFishSeedEntry(rawFish, source) {
  const commonNameRaw = String(rawFish.commonName ?? '').trim();
  const latinName = String(rawFish.latinName ?? '').trim();

  if (!commonNameRaw || !latinName) {
    return null;
  }

  const commonName = shouldAutoPolishCommonName(commonNameRaw, latinName)
    ? getPolishCommonNameForLatin(latinName)
    : commonNameRaw;

  const phMin = parseFishNumber(rawFish.phMin, EXPANDED_FISH_DEFAULTS.phMin);
  const phMax = parseFishNumber(rawFish.phMax, EXPANDED_FISH_DEFAULTS.phMax);
  const ghMin = parseFishNumber(rawFish.ghMin, EXPANDED_FISH_DEFAULTS.ghMin);
  const ghMax = parseFishNumber(rawFish.ghMax, EXPANDED_FISH_DEFAULTS.ghMax);
  const tempMin = parseFishNumber(
    rawFish.tempMin,
    EXPANDED_FISH_DEFAULTS.tempMin
  );
  const tempMax = parseFishNumber(
    rawFish.tempMax,
    EXPANDED_FISH_DEFAULTS.tempMax
  );
  const minLiters = parseFishNumber(
    rawFish.minLiters,
    EXPANDED_FISH_DEFAULTS.minLiters
  );
  const notes = String(rawFish.notes ?? '').trim();
  const { isSchooling, minGroupSize } = resolveFishSchoolingProfile({
    ...rawFish,
    notes,
  });
  const aggressionLevel = resolveFishAggressionLevel({
    ...rawFish,
    notes,
  });
  const hasCustomRange =
    Number.isFinite(Number(rawFish.phMin)) &&
    Number.isFinite(Number(rawFish.phMax)) &&
    Number.isFinite(Number(rawFish.ghMin)) &&
    Number.isFinite(Number(rawFish.ghMax)) &&
    Number.isFinite(Number(rawFish.tempMin)) &&
    Number.isFinite(Number(rawFish.tempMax)) &&
    Number.isFinite(Number(rawFish.minLiters));

  return {
    commonName,
    latinName,
    phMin: Math.min(phMin, phMax),
    phMax: Math.max(phMin, phMax),
    ghMin: Math.min(ghMin, ghMax),
    ghMax: Math.max(ghMin, ghMax),
    tempMin: Math.min(tempMin, tempMax),
    tempMax: Math.max(tempMin, tempMax),
    minLiters: Math.max(20, Math.round(minLiters)),
    isSchooling,
    minGroupSize,
    aggressionLevel,
    notes: notes || (!hasCustomRange ? EXPANDED_FISH_DEFAULTS.notes : ''),
    source,
  };
}

function getFishSeedScore(item) {
  const latinName = String(item.latinName).toLowerCase();
  const hasSpeciesLevelLatin =
    !latinName.includes(' spp.') && !latinName.endsWith(' sp.');
  const hasStarterRanges = item.source === 'starter';

  let score = 0;

  if (hasStarterRanges) {
    score += 100;
  }

  if (hasSpeciesLevelLatin) {
    score += 10;
  }

  if (item.notes && item.notes !== EXPANDED_FISH_DEFAULTS.notes) {
    score += 1;
  }

  return score;
}

function getFishCatalogEntryScore(item) {
  const source = String(item.source ?? '').trim().toLowerCase();
  const latinName = String(item.latinName ?? '').toLowerCase();
  const hasSpeciesLevelLatin =
    latinName.length > 0 &&
    !latinName.includes(' spp.') &&
    !latinName.endsWith(' sp.');
  const hasParams =
    Number.isFinite(Number(item.phMin)) &&
    Number.isFinite(Number(item.phMax)) &&
    Number.isFinite(Number(item.ghMin)) &&
    Number.isFinite(Number(item.ghMax)) &&
    Number.isFinite(Number(item.tempMin)) &&
    Number.isFinite(Number(item.tempMax)) &&
    Number.isFinite(Number(item.minLiters));
  const hasDistinctCommonName =
    normalizeText(item.commonName) &&
    normalizeText(item.commonName) !== normalizeText(item.latinName);

  let score = 0;

  if (source === 'user') {
    score += 300;
  } else if (source === 'starter') {
    score += 220;
  } else if (source === 'expanded') {
    score += 180;
  } else {
    score += 100;
  }

  if (hasSpeciesLevelLatin) {
    score += 20;
  }

  if (hasParams) {
    score += 10;
  }

  if (hasDistinctCommonName) {
    score += 5;
  }

  if (item.notes && String(item.notes).trim().length > 0) {
    score += 1;
  }

  return score;
}

function pickPreferredFishCatalogEntry(items) {
  return [...items].sort((a, b) => {
    const byScore =
      getFishCatalogEntryScore(b) - getFishCatalogEntryScore(a);

    if (byScore !== 0) {
      return byScore;
    }

    const byCreatedAt = getCreatedAtMs(a.createdAt) - getCreatedAtMs(b.createdAt);

    if (byCreatedAt !== 0) {
      return byCreatedAt;
    }

    return String(a.id).localeCompare(String(b.id));
  })[0];
}

function dedupeFishCatalogEntriesByLatin(entries) {
  const grouped = new Map();

  entries.forEach((item) => {
    const latinKey = normalizeLatinCatalogKey(item.latinName);
    const key = latinKey || `__id__:${item.id}`;
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  });

  const uniqueEntries = [];
  const duplicateIds = [];

  grouped.forEach((items) => {
    if (items.length === 1) {
      uniqueEntries.push(items[0]);
      return;
    }

    const keeper = pickPreferredFishCatalogEntry(items);
    uniqueEntries.push(keeper);

    items.forEach((item) => {
      if (item.id !== keeper.id) {
        duplicateIds.push(item.id);
      }
    });
  });

  return {
    uniqueEntries,
    duplicateIds,
  };
}

function getPlantCatalogEntryScore(item) {
  const source = String(item.source ?? '').trim().toLowerCase();
  const hasParams =
    Number.isFinite(Number(item.phMin)) &&
    Number.isFinite(Number(item.phMax)) &&
    Number.isFinite(Number(item.ghMin)) &&
    Number.isFinite(Number(item.ghMax)) &&
    Number.isFinite(Number(item.tempMin)) &&
    Number.isFinite(Number(item.tempMax)) &&
    Number.isFinite(Number(item.minLiters));
  const hasDistinctCommonName =
    normalizeText(item.commonName) &&
    normalizeText(item.commonName) !== normalizeText(item.latinName);

  let score = 0;

  if (source === 'user') {
    score += 300;
  } else if (source === 'starter') {
    score += 220;
  } else if (source === 'expanded') {
    score += 180;
  } else {
    score += 100;
  }

  if (hasParams) {
    score += 10;
  }

  if (hasDistinctCommonName) {
    score += 5;
  }

  if (item.notes && String(item.notes).trim().length > 0) {
    score += 1;
  }

  return score;
}

function pickPreferredPlantCatalogEntry(items) {
  return [...items].sort((a, b) => {
    const byScore =
      getPlantCatalogEntryScore(b) - getPlantCatalogEntryScore(a);

    if (byScore !== 0) {
      return byScore;
    }

    const byCreatedAt = getCreatedAtMs(a.createdAt) - getCreatedAtMs(b.createdAt);

    if (byCreatedAt !== 0) {
      return byCreatedAt;
    }

    return String(a.id).localeCompare(String(b.id));
  })[0];
}

function dedupePlantCatalogEntriesByLatin(entries) {
  const grouped = new Map();

  entries.forEach((item) => {
    const latinKey = normalizeLatinCatalogKey(item.latinName);
    const key = latinKey || `__id__:${item.id}`;
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  });

  const uniqueEntries = [];
  const duplicateIds = [];

  grouped.forEach((items) => {
    if (items.length === 1) {
      uniqueEntries.push(items[0]);
      return;
    }

    const keeper = pickPreferredPlantCatalogEntry(items);
    uniqueEntries.push(keeper);

    items.forEach((item) => {
      if (item.id !== keeper.id) {
        duplicateIds.push(item.id);
      }
    });
  });

  return {
    uniqueEntries,
    duplicateIds,
  };
}

const FISH_CATALOG_ALLOWED_LATIN_NAMES = [
  'Poecilia reticulata',
  'Poecilia sphenops',
  'Xiphophorus maculatus',
  'Xiphophorus hellerii',
  'Paracheirodon innesi',
  'Paracheirodon axelrodi',
  'Hyphessobrycon herbertaxelrodi',
  'Hyphessobrycon amandae',
  'Inpaichthys kerri',
  'Trigonostigma heteromorpha',
  'Danio rerio',
  'Tanichthys albonubes',
  'Corydoras panda',
  'Corydoras aeneus',
  'Otocinclus affinis',
  'Ancistrus cf. cirrhosus',
  'Pangio kuhlii',
  'Betta splendens',
  'Trichogaster lalius',
  'Trichopodus leerii',
  'Mikrogeophagus ramirezi',
  'Pterophyllum scalare',
  'Chindongo saulosi',
  'Epalzeorhynchos frenatum',
  'Andinoacara pulcher',
  'Caridina multidentata',
  'Neocaridina davidi',
  'Caridina cf. cantonensis',
  'Neocaridina davidi var. blue dream',
  'Neocaridina davidi var. yellow',
  'Caridina cf. babaulti',
  'Atyopsis moluccensis',
  'Neritina pulligera',
  'Vittina natalensis',
  'Pomacea diffusa',
  'Melanoides tuberculata',
  'Brotia herculea',
  'Physella acuta',
  'Planorbella duryi',
  'Lymnaea stagnalis',
  'Anentome helena',
];

const PLANT_CATALOG_ALLOWED_LATIN_NAMES = [
  'Anubias barteri var. nana',
  'Microsorum pteropus',
  'Bolbitis heudelotii',
  'Bucephalandra sp.',
  'Cryptocoryne wendtii',
  'Vallisneria spiralis',
  'Egeria densa',
  'Ceratophyllum demersum',
  'Hygrophila polysperma',
  'Ludwigia repens',
  'Rotala rotundifolia',
  'Bacopa caroliniana',
  'Cabomba caroliniana',
  'Pogostemon stellatus',
  'Micranthemum tweediei',
  'Glossostigma elatinoides',
  'Eleocharis acicularis mini',
  'Marsilea hirsuta',
  'Sagittaria subulata',
  'Taxiphyllum barbieri',
  'Vesicularia montagnei',
  'Fissidens fontanus',
  'Riccia fluitans',
  'Pistia stratiotes',
  'Limnobium laevigatum',
  'Lemna minor',
  'Salvinia natans',
];

const FISH_LOCALIZED_COMMON_NAMES_BY_LATIN = Object.freeze({
  'poecilia reticulata': { pl: 'Gupik', en: 'Guppy', de: 'Guppy' },
  'poecilia sphenops': { pl: 'Molinezja', en: 'Molly', de: 'Molly' },
  'xiphophorus maculatus': { pl: 'Platka', en: 'Platy', de: 'Platy' },
  'xiphophorus hellerii': {
    pl: 'Mieczyk Hellera',
    en: 'Swordtail',
    de: 'Schwerttrager',
  },
  'paracheirodon innesi': {
    pl: 'Neon Innesa',
    en: 'Neon tetra',
    de: 'Neonsalmler',
  },
  'paracheirodon axelrodi': {
    pl: 'Neon czerwony',
    en: 'Cardinal tetra',
    de: 'Kardinalsalmler',
  },
  'hyphessobrycon herbertaxelrodi': {
    pl: 'Neon czarny',
    en: 'Black neon tetra',
    de: 'Schwarzer Neonsalmler',
  },
  'hyphessobrycon amandae': {
    pl: 'Bystrzyk Amandy',
    en: 'Ember tetra',
    de: 'Feuertetra',
  },
  'inpaichthys kerri': {
    pl: 'Bystrzyk blekitny',
    en: 'Blue emperor tetra',
    de: 'Blauer Kaisersalmler',
  },
  'trigonostigma heteromorpha': {
    pl: 'Razbora klinowa',
    en: 'Harlequin rasbora',
    de: 'Keilfleckbarbe',
  },
  'danio rerio': {
    pl: 'Danio pregowane',
    en: 'Zebra danio',
    de: 'Zebrafisch',
  },
  'tanichthys albonubes': {
    pl: 'Kardynalek chinski',
    en: 'White cloud mountain minnow',
    de: 'Kardinalfisch',
  },
  'corydoras panda': {
    pl: 'Kirys panda',
    en: 'Panda cory',
    de: 'Pandapanzerwels',
  },
  'corydoras aeneus': {
    pl: 'Kirys spizowy',
    en: 'Bronze cory',
    de: 'Metallpanzerwels',
  },
  'otocinclus affinis': {
    pl: 'Otosek przyujsciowy',
    en: 'Otocinclus',
    de: 'Otocinclus',
  },
  'ancistrus cf. cirrhosus': {
    pl: 'Zbrojnik niebieski',
    en: 'Bristlenose pleco',
    de: 'Antennenwels',
  },
  'pangio kuhlii': {
    pl: 'Piskorek Kuhla',
    en: 'Kuhli loach',
    de: 'Dornauge',
  },
  'betta splendens': {
    pl: 'Bojownik wspanialy',
    en: 'Siamese fighting fish',
    de: 'Kampffisch',
  },
  'trichogaster lalius': {
    pl: 'Pretnik karlowaty',
    en: 'Dwarf gourami',
    de: 'Zwergfadenfisch',
  },
  'trichopodus leerii': {
    pl: 'Gurami mozaikowy',
    en: 'Pearl gourami',
    de: 'Mosaikfadenfisch',
  },
  'pterophyllum scalare': {
    pl: 'Skalar zaglowiec',
    en: 'Angelfish',
    de: 'Segelflosser',
  },
  'mikrogeophagus ramirezi': {
    pl: 'Pielegniczka Ramireza',
    en: 'Ram cichlid',
    de: 'Schmetterlingsbuntbarsch',
  },
  'chindongo saulosi': {
    pl: 'Pyszczak saulosi',
    en: 'Saulosi cichlid',
    de: 'Saulosi-Buntbarsch',
  },
  'epalzeorhynchos frenatum': {
    pl: 'Grubowarg zielony',
    en: 'Rainbow shark',
    de: 'Fransenlipper',
  },
  'andinoacara pulcher': {
    pl: 'Akara blekitna',
    en: 'Blue acara',
    de: 'Blauer Acara',
  },
  'caridina multidentata': {
    pl: 'Krewetka Amano',
    en: 'Amano shrimp',
    de: 'Amanogarnele',
  },
  'neocaridina davidi': {
    pl: 'Krewetka Red Cherry',
    en: 'Red cherry shrimp',
    de: 'Red-Cherry-Garnele',
  },
  'caridina cf. cantonensis': {
    pl: 'Krewetka Crystal Red',
    en: 'Crystal red shrimp',
    de: 'Crystal-Red-Garnele',
  },
  'neocaridina davidi var. blue dream': {
    pl: 'Krewetka Blue Dream',
    en: 'Blue dream shrimp',
    de: 'Blue-Dream-Garnele',
  },
  'neocaridina davidi var. yellow': {
    pl: 'Krewetka Yellow',
    en: 'Yellow shrimp',
    de: 'Yellow-Garnele',
  },
  'caridina cf. babaulti': {
    pl: 'Krewetka Babaulti',
    en: 'Babaulti shrimp',
    de: 'Babaulti-Garnele',
  },
  'atyopsis moluccensis': {
    pl: 'Krewetka filtrujaca',
    en: 'Bamboo shrimp',
    de: 'Fachergarnele',
  },
  'neritina pulligera': {
    pl: 'Slimak Helmet',
    en: 'Helmet snail',
    de: 'Stahlhelm-Rennschnecke',
  },
  'vittina natalensis': {
    pl: 'Neritina zebra',
    en: 'Zebra nerite snail',
    de: 'Zebra-Rennschnecke',
  },
  'pomacea diffusa': {
    pl: 'Ampularia',
    en: 'Mystery snail',
    de: 'Apfelschnecke',
  },
  'melanoides tuberculata': {
    pl: 'Swiderki',
    en: 'Malaysian trumpet snail',
    de: 'Turmdeckelschnecke',
  },
  'brotia herculea': {
    pl: 'Slimak Brotia',
    en: 'Brotia snail',
    de: 'Brotia-Schnecke',
  },
  'physella acuta': {
    pl: 'Rozdetka',
    en: 'Bladder snail',
    de: 'Blasenschnecke',
  },
  'planorbella duryi': {
    pl: 'Zatoczek',
    en: 'Ramshorn snail',
    de: 'Posthornschnecke',
  },
  'lymnaea stagnalis': {
    pl: 'Blotniarka',
    en: 'Great pond snail',
    de: 'Spitzschlammschnecke',
  },
  'anentome helena': {
    pl: 'Helenka',
    en: 'Assassin snail',
    de: 'Raubschnecke',
  },
});

const PLANT_LOCALIZED_COMMON_NAMES_BY_LATIN = Object.freeze({
  'anubias barteri var. nana': {
    pl: 'Anubias nana',
    en: 'Dwarf anubias',
    de: 'Zwergspeerblatt',
  },
  'microsorum pteropus': {
    pl: 'Mikrozorium oskrzydlone',
    en: 'Java fern',
    de: 'Javafarn',
  },
  'bolbitis heudelotii': {
    pl: 'Bolbitis heudelotii',
    en: 'African water fern',
    de: 'Kongofarn',
  },
  'bucephalandra sp.': {
    pl: 'Bucephalandra',
    en: 'Bucephalandra',
    de: 'Bucephalandra',
  },
  'cryptocoryne wendtii': {
    pl: 'Kryptokoryna Wendta',
    en: "Wendt's crypt",
    de: 'Wendts Wasserkelch',
  },
  'vallisneria spiralis': {
    pl: 'Nurzaniec',
    en: 'Straight vallisneria',
    de: 'Schraubenvallisnerie',
  },
  'egeria densa': {
    pl: 'Moczarka argentynska',
    en: 'Brazilian waterweed',
    de: 'Argentinische Wasserpest',
  },
  'ceratophyllum demersum': {
    pl: 'Rogatek sztywny',
    en: 'Hornwort',
    de: 'Raues Hornblatt',
  },
  'hygrophila polysperma': {
    pl: 'Hygrophila polysperma',
    en: 'Dwarf hygrophila',
    de: 'Indischer Wasserfreund',
  },
  'ludwigia repens': {
    pl: 'Ludwigia repens',
    en: 'Red ludwigia',
    de: 'Rote Ludwigie',
  },
  'rotala rotundifolia': {
    pl: 'Rotala rotundifolia',
    en: 'Roundleaf rotala',
    de: 'Rundblattrige Rotala',
  },
  'bacopa caroliniana': {
    pl: 'Bacopa caroliniana',
    en: 'Carolina bacopa',
    de: 'Carolina-Bacopa',
  },
  'cabomba caroliniana': {
    pl: 'Kabomba karolinska',
    en: 'Carolina fanwort',
    de: 'Karolina-Haarnixe',
  },
  'pogostemon stellatus': {
    pl: 'Pogostemon stellatus',
    en: 'Star pogostemon',
    de: 'Stern-Pogostemon',
  },
  'micranthemum tweediei': {
    pl: 'Monte Carlo',
    en: 'Monte Carlo',
    de: 'Monte Carlo',
  },
  'glossostigma elatinoides': {
    pl: 'Glossostigma',
    en: 'Glossostigma',
    de: 'Glossostigma',
  },
  'eleocharis acicularis mini': {
    pl: 'Eleocharis mini',
    en: 'Dwarf hairgrass',
    de: 'Zwergnadelsimse',
  },
  'marsilea hirsuta': {
    pl: 'Marsilea hirsuta',
    en: 'Dwarf water clover',
    de: 'Zwergkleefarn',
  },
  'sagittaria subulata': {
    pl: 'Sagittaria subulata',
    en: 'Dwarf sagittaria',
    de: 'Zwergpfeilkraut',
  },
  'taxiphyllum barbieri': {
    pl: 'Mech jawajski',
    en: 'Java moss',
    de: 'Javamoos',
  },
  'vesicularia montagnei': {
    pl: 'Christmas Moss',
    en: 'Christmas moss',
    de: 'Christmas-Moos',
  },
  'fissidens fontanus': {
    pl: 'Phoenix Moss',
    en: 'Phoenix moss',
    de: 'Phoenix-Moos',
  },
  'riccia fluitans': {
    pl: 'Riccia fluitans',
    en: 'Crystalwort',
    de: 'Teichlebermoos',
  },
  'pistia stratiotes': {
    pl: 'Pistia',
    en: 'Water lettuce',
    de: 'Muschelblume',
  },
  'salvinia natans': {
    pl: 'Salwinia',
    en: 'Floating fern',
    de: 'Schwimmfarn',
  },
  'limnobium laevigatum': {
    pl: 'Limnobium',
    en: 'Amazon frogbit',
    de: 'Amazonas-Froschbiss',
  },
  'lemna minor': {
    pl: 'Rzesa wodna',
    en: 'Duckweed',
    de: 'Wasserlinse',
  },
});

const GENERIC_FISH_IMAGE_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Poecilia_reticulata_male.jpg/640px-Poecilia_reticulata_male.jpg';
const GENERIC_PLANT_IMAGE_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Anubias_barteri_var._nana_01.jpg/640px-Anubias_barteri_var._nana_01.jpg';

const FISH_WIKI_TITLE_ALIASES_BY_LATIN = Object.freeze({
  'hyphessobrycon columbianus': ['Hyphessobrycon_columbianus', 'Hyphessobrycon_colombianus'],
  'hyphessobrycon scholzei': ['Hyphessobrycon_scholzei'],
  'crossocheilus oblongus': ['Crossocheilus_oblongus', 'Siamese_algae_eater'],
  'crossocheilus siamensis': ['Crossocheilus_siamensis', 'Siamese_algae_eater'],
  'epalzeorhynchos bicolor': ['Epalzeorhynchos_bicolor', 'Red-tail_black_shark'],
  'epalzeorhynchos frenatum': ['Epalzeorhynchos_frenatum', 'Rainbow_shark'],
  'inpaichthys kerri': ['Inpaichthys_kerri'],
  'moenkhausia sanctaefilomenae': ['Moenkhausia_sanctaefilomenae'],
  'moenkhausia pittieri': ['Moenkhausia_pittieri'],
  'hyphessobrycon sweglesi': ['Hyphessobrycon_sweglesi'],
  'thayeria boehlkei': ['Thayeria_boehlkei'],
  'xiphophorus hellerii': ['Xiphophorus_hellerii', 'Xiphophorus_helleri'],
  'trichogaster chuna': ['Trichogaster_chuna', 'Colisa_chuna'],
  'puntigrus tetrazona': ['Puntigrus_tetrazona', 'Puntius_tetrazona'],
  'symphysodon discus': ['Symphysodon_discus'],
  'caridina multidentata': ['Caridina_multidentata'],
  'caridina cf. cantonensis': ['Caridina_cantonensis', 'Bee_shrimp'],
  'caridina cf. cantonensis var. black': ['Caridina_cantonensis', 'Bee_shrimp'],
  'caridina mariae': ['Caridina_cantonensis', 'Bee_shrimp'],
  'danio rerio': ['Danio_rerio'],
  'danio albolineatus': ['Danio_albolineatus'],
  'danio margaritatus': ['Danio_margaritatus'],
  'otocinclus affinis': ['Otocinclus_affinis', 'Macrotocinclus_affinis'],
  'otocinclus vittatus': ['Otocinclus_vittatus'],
  'ancistrus cf. cirrhosus': ['Ancistrus_cirrhosus'],
  'ancistrus dolichopterus': ['Ancistrus_dolichopterus'],
  'pterygoplichthys gibbiceps': ['Pterygoplichthys_gibbiceps'],
  'hypancistrus zebra': ['Hypancistrus_zebra'],
  'poecilia wingei': ['Poecilia_wingei', 'Poeciliawingei', 'Endlers_Guppy_Poecilia_wingei'],
  'atyopsis moluccensis': ['Atyopsis_moluccensis'],
  'atyopsis spinipes': ['Atyopsis_spinipes'],
});

function buildDefaultFishCommonsFileByLatin(latinNames = []) {
  const entries = [];

  latinNames.forEach((latinName) => {
    const normalizedKey = normalizeLatinCatalogKey(latinName);
    const words = String(latinName ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter(Boolean);

    if (!normalizedKey || words.length < 2) {
      return;
    }

    entries.push([normalizedKey, `${words[0]}_${words[1]}.jpg`]);
  });

  return Object.fromEntries(entries);
}

const FISH_DEFAULT_COMMONS_FILE_BY_LATIN = Object.freeze(
  buildDefaultFishCommonsFileByLatin(FISH_CATALOG_ALLOWED_LATIN_NAMES)
);

const FISH_COMMONS_FILE_OVERRIDES_BY_LATIN = Object.freeze({
  'poecilia wingei': 'Endlers_Guppy_Poecilia_wingei.JPG',
  'ancistrus sp.': 'Ancistrus_sp.jpg',
  'xiphophorus hellerii': 'Xiphophorus_hellerii_-_male_and_female.jpg',
  'symphysodon discus': 'Symphysodon_discus_02.jpg',
  'trichogaster chuna': 'Colisa_chuna_male.jpg',
  'puntigrus tetrazona': 'Puntius_tetrazona_(aka).jpg',
  'caridina multidentata': 'Caridina_multidentata_close.jpg',
  'caridina cf. cantonensis': 'Caridina-cf-cantonensis-crystal-red.jpg',
  'caridina cf. cantonensis var. black': 'Caridina-cf-cantonensis-black-bee.jpg',
  'caridina mariae': 'Caridina-cf-cantonensis-tiger.jpg',
  'danio rerio': 'Danio_rerio.JPG',
  'danio albolineatus': 'Danio_albolineatus.jpg',
  'danio margaritatus': 'Danio_margaritatus.jpg',
  'inpaichthys kerri': '05.Inpaichtys_kerri.JPG',
  'otocinclus affinis': 'Otocinclus_affinis.jpg',
  'otocinclus vittatus': 'Otocinclus_vittatus.jpg',
  'ancistrus cf. cirrhosus': 'Ancistrus_cirrhosus.jpg',
  'ancistrus dolichopterus': 'Siluriformes_-_Ancistrus_dolichopterus_-_1.jpg',
  'pterygoplichthys gibbiceps': 'Pterygoplichthys_gibbiceps_1.jpg',
  'hypancistrus zebra': 'Hypancistrus_zebra4305.jpg',
  'crossocheilus siamensis': 'Crossocheilus_siamensis.jpg',
  'hyphessobrycon columbianus': 'Hyphessobrycon_colombianus.jpg',
  'hyphessobrycon scholzei': 'Hyphessobrycon_scholzei_(31520).png',
  'hyphessobrycon sweglesi': 'Hyphessobrycon_sweglesi_(31473-C).png',
  'thayeria boehlkei': 'Thayeria_boehlkei.jpg',
  'crossocheilus oblongus': 'Crossocheilus_Oblongus_(1).jpg',
  'epalzeorhynchos bicolor': 'Epalzeorhynchos_bicolor.jpg',
  'epalzeorhynchos frenatum': 'Epalzeorhynchos_frenatum.jpg',
  'caridina cf. babaulti': 'Caridina_cf._babaulti.jpg',
  'caridina gracilirostris': 'Caridina_gracilirostris.JPG',
  'atyopsis moluccensis': 'Atyopsis_moluccensis.jpg',
  'atyopsis spinipes': 'Atyopsis_moluccensis.jpg',
});

const FISH_COMMONS_FILE_BY_LATIN = Object.freeze({
  ...FISH_DEFAULT_COMMONS_FILE_BY_LATIN,
  ...FISH_COMMONS_FILE_OVERRIDES_BY_LATIN,
});

function buildFishCatalogImageUrl(latinName) {
  const normalizedLatinKey = normalizeLatinCatalogKey(latinName);
  const manualCommonsFileName = normalizedLatinKey
    ? FISH_COMMONS_FILE_BY_LATIN[normalizedLatinKey]
    : '';

  if (manualCommonsFileName) {
    return (
      buildCommonsFileThumbnailUrl(manualCommonsFileName, 900) ||
      GENERIC_FISH_IMAGE_URL
    );
  }

  return (
    buildFishCommonsFallbackImageUrl(String(latinName ?? '').trim(), 900) ||
    GENERIC_FISH_IMAGE_URL
  );
}

const PLANT_COMMONS_FILE_OVERRIDES_BY_LATIN = Object.freeze({
  'anubias barteri var. nana': 'Anubias_barteri_var._nana_01.jpg',
  'microsorum pteropus': 'Microsorum_pteropus1.jpg',
  'cryptocoryne wendtii': 'Cryptocoryne_wendtii.jpg',
  'vallisneria spiralis': 'Vallisneria_spiralis.jpg',
  'egeria densa': 'Egeria_densa.jpg',
  'taxiphyllum barbieri': 'Taxiphyllum_barbieri.jpg',
  'hygrophila difformis': 'Hygrophila_difformis2.jpg',
  'hygrophila polysperma': 'Hygrophila_polysperma.jpg',
  'hygrophila corymbosa': 'Hygrophila_corymbosa.jpg',
  'hygrophila corymbosa siamensis': 'Hygrophila_corymbosa.jpg',
  'hygrophila pinnatifida': 'Hygrophila_pinnatifida.jpg',
  'limnobium laevigatum': 'Limnobium_laevigatum.jpg',
  'lemna minor': 'Lemna_minor.jpg',
  'pistia stratiotes': 'Pistia_stratiotes_1.jpg',
});

const PLANT_GENUS_POLISH_NAME_OVERRIDES = Object.freeze({
  cryptocoryne: 'Kryptokoryna',
  echinodorus: 'Zabienica',
  vallisneria: 'Nurzaniec',
  eleocharis: 'Poniklo',
  microsorum: 'Mikrozorium',
  taxiphyllum: 'Mch',
  vesicularia: 'Mch',
  fissidens: 'Mch',
  pistia: 'Pistia',
  limnobium: 'Frogbit',
  lemna: 'Rzesa',
  ceratophyllum: 'Rogatek',
  egeria: 'Moczarka',
  bacopa: 'Bacopa',
  ludwigia: 'Ludwigia',
  hygrophila: 'Nadwodka',
  rotala: 'Rotala',
  anubias: 'Anubias',
  bucephalandra: 'Bucephalandra',
});

const PLANT_COMMON_NAME_OVERRIDES_BY_LATIN = Object.freeze({
  'microsorum pteropus': 'Mikrozorium jawajskie',
  'vallisneria spiralis': 'Nurzaniec spiralny',
  'egeria densa': 'Moczarka argentynska',
  'hygrophila polysperma': 'Nadwodka wielonasienna',
  'hygrophila corymbosa': 'Nadwodka corymbosa',
  'hygrophila corymbosa siamensis': 'Nadwodka syjamska',
  'hygrophila difformis': 'Nadwodka wielokształtna',
  'hygrophila pinnatifida': 'Nadwodka pinnatifida',
  'taxiphyllum barbieri': 'Mch jawajski',
  'vesicularia montagnei': 'Mch christmas',
  'fissidens fontanus': 'Mch phoenix',
  'lemna minor': 'Rzesa wodna',
  'pistia stratiotes': 'Pistia rozetkowa',
  'limnobium laevigatum': 'Frogbit amazonski',
  'cryptocoryne wendtii': 'Kryptokoryna Wendta',
});

const PLANT_COMMONS_FILE_OVERRIDES_EXTRA_BY_LATIN = Object.freeze({
  'anubias barteri': 'Anubias_barteri.jpg',
  'cryptocoryne beckettii': 'Cryptocoryne_beckettii.jpg',
  'cryptocoryne parva': 'Cryptocoryne_parva.jpg',
  'echinodorus bleheri': 'Echinodorus_bleheri.jpg',
  'echinodorus amazonicus': 'Echinodorus_amazonicus.jpg',
  'vallisneria americana': 'Vallisneria_americana.jpg',
  'sagittaria subulata': 'Sagittaria_subulata.jpg',
  'hemianthus callitrichoides': 'Hemianthus_callitrichoides.jpg',
  'staurogyne repens': 'Staurogyne_repens.jpg',
  'ludwigia repens': 'Ludwigia_repens.jpg',
  'rotala rotundifolia': 'Rotala_rotundifolia.jpg',
  'bacopa caroliniana': 'Bacopa_caroliniana.jpg',
  'limnophila sessiliflora': 'Limnophila_sessiliflora.jpg',
  'alternanthera reineckii': 'Alternanthera_reineckii.jpg',
  'marsilea hirsuta': 'Marsilea_hirsuta.jpg',
  'riccia fluitans': 'Riccia_fluitans.jpg',
  'vesicularia montagnei': 'Vesicularia_montagnei.jpg',
  'fissidens fontanus': 'Fissidens_fontanus.jpg',
  'nymphaea lotus': 'Nymphaea_lotus.jpg',
  'ceratophyllum demersum': 'Ceratophyllum_demersum.jpg',
  'salvinia natans': 'Salvinia_natans.jpg',
  'bolbitis heudelotii': 'Bolbitis_heudelotii.jpg',
});

const PLANT_COMMON_NAME_OVERRIDES_EXTRA_BY_LATIN = Object.freeze({
  'anubias barteri var. nana': 'Anubias nana',
  'anubias barteri': 'Anubias barteri',
  'cryptocoryne beckettii': 'Kryptokoryna Becketta',
  'cryptocoryne parva': 'Kryptokoryna parva',
  'echinodorus bleheri': 'Zabienica blehera',
  'echinodorus amazonicus': 'Zabienica amazonska',
  'vallisneria americana': 'Nurzaniec amerykanski',
  'sagittaria subulata': 'Sagittaria subulata',
  'helanthium tenellum': 'Lancetnica mini',
  'eleocharis acicularis': 'Poniklo iglowate',
  'eleocharis parvula': 'Poniklo male',
  'micranthemum tweediei': 'Monte Carlo',
  'hemianthus callitrichoides': 'Hemianthus cuba',
  'staurogyne repens': 'Staurogyne repens',
  'hydrocotyle tripartita': 'Hydrokotyle trojdzielna',
  'ludwigia repens': 'Ludwigia repens',
  'ludwigia palustris': 'Ludwigia palustris',
  'rotala rotundifolia': 'Rotala rotundifolia',
  'rotala indica': 'Rotala indica',
  'bacopa caroliniana': 'Bacopa caroliniana',
  'bacopa monnieri': 'Bacopa monnieri',
  'hygrophila difformis': 'Nadwodka wieloksztaltna',
  'limnophila sessiliflora': 'Limnofila osiadlokwiatowa',
  'limnophila aromatica': 'Limnofila aromatyczna',
  'myriophyllum mattogrossense': 'Wywlocznik mattogrossense',
  'pogostemon stellatus': 'Pogostemon stellatus',
  'pogostemon helferi': 'Pogostemon helferi',
  'alternanthera reineckii': 'Alternanthera reineckii',
  'marsilea hirsuta': 'Marsylia hirsuta',
  'riccia fluitans': 'Riccia plywajaca',
  'lomariopsis lineata': 'Subwassertang',
  'nymphaea lotus': 'Lilia tygrysia',
  'ceratopteris thalictroides': 'Paproc wodna',
  'ceratophyllum demersum': 'Rogatek sztywny',
  'salvinia natans': 'Salwinia plywajaca',
  'phyllanthus fluitans': 'Phyllanthus plywajacy',
  'bolbitis heudelotii': 'Bolbitis heudelotii',
});

const PLANT_WIKI_TITLE_ALIASES_BY_LATIN = Object.freeze({
  'anubias barteri var. nana': ['Anubias_barteri_var._nana', 'Anubias_barteri'],
  'micranthemum tweediei': ['Micranthemum_tweediei', 'Micranthemum_Monte_Carlo'],
  'hygrophila corymbosa siamensis': ['Hygrophila_corymbosa'],
  'ceratopteris thalictroides': ['Ceratopteris_thalictroides'],
  'lomariopsis lineata': ['Lomariopsis_lineata', 'Subwassertang'],
  'phyllanthus fluitans': ['Phyllanthus_fluitans'],
  'bolbitis heudelotii': ['Bolbitis_heudelotii'],
  'nymphaea lotus': ['Nymphaea_lotus'],
});

function getPlantCommonNameOverride(latinKey) {
  if (!latinKey) {
    return '';
  }

  return (
    PLANT_COMMON_NAME_OVERRIDES_BY_LATIN[latinKey] ??
    PLANT_COMMON_NAME_OVERRIDES_EXTRA_BY_LATIN[latinKey] ??
    ''
  );
}

function getPlantCommonsFileOverride(latinKey) {
  if (!latinKey) {
    return '';
  }

  return (
    PLANT_COMMONS_FILE_OVERRIDES_BY_LATIN[latinKey] ??
    PLANT_COMMONS_FILE_OVERRIDES_EXTRA_BY_LATIN[latinKey] ??
    ''
  );
}

const FISH_CATALOG_ALLOWED_LATIN_KEYS = new Set(
  FISH_CATALOG_ALLOWED_LATIN_NAMES.map((name) => normalizeLatinCatalogKey(name)).filter(Boolean)
);
const PLANT_CATALOG_ALLOWED_LATIN_KEYS = new Set(
  PLANT_CATALOG_ALLOWED_LATIN_NAMES.map((name) => normalizeLatinCatalogKey(name)).filter(Boolean)
);

function isAllowedFishCatalogLatinName(latinName) {
  const normalizedKey = normalizeLatinCatalogKey(latinName);
  return Boolean(normalizedKey) && FISH_CATALOG_ALLOWED_LATIN_KEYS.has(normalizedKey);
}

function isAllowedPlantCatalogLatinName(latinName) {
  const normalizedKey = normalizeLatinCatalogKey(latinName);
  return Boolean(normalizedKey) && PLANT_CATALOG_ALLOWED_LATIN_KEYS.has(normalizedKey);
}

function isBuiltInFishCatalogSource(source) {
  const normalizedSource = String(source ?? '').trim().toLowerCase();
  return normalizedSource === '' || normalizedSource === 'starter' || normalizedSource === 'expanded';
}

function buildFishCatalogSeed() {
  const seeds = [
    ...FISH_CATALOG_STARTER.map((fish) => buildFishSeedEntry(fish, 'starter')),
    ...FISH_CATALOG_EXPANDED.map((fish) => buildFishSeedEntry(fish, 'expanded')),
  ].filter((item) => item && isAllowedFishCatalogLatinName(item.latinName));

  const byLatinName = new Map();

  seeds.forEach((item) => {
    const key = normalizeLatinCatalogKey(item.latinName);
    const current = byLatinName.get(key);

    if (!current || getFishSeedScore(item) > getFishSeedScore(current)) {
      byLatinName.set(key, item);
    }
  });

  return [...byLatinName.values()];
}

const FISH_CATALOG_SEED = buildFishCatalogSeed();

const EXPANDED_PLANT_DEFAULTS = {
  phMin: 5.8,
  phMax: 7.8,
  ghMin: 2,
  ghMax: 16,
  tempMin: 20,
  tempMax: 28,
  minLiters: 20,
  notes:
    'Profil orientacyjny rosliny. Zweryfikuj wymagania pod konkretna odmiane.',
};

function getPolishPlantCommonName(rawCommonName, latinName) {
  const commonName = String(rawCommonName ?? '').trim();
  const latin = String(latinName ?? '').trim();
  const latinKey = normalizeLatinCatalogKey(latin);

  const overriddenName = getPlantCommonNameOverride(latinKey);
  if (overriddenName) {
    return overriddenName;
  }

  if (!latin) {
    return commonName;
  }

  const words = latin.split(/\s+/).filter(Boolean);
  const genus = words[0] ?? '';
  const species = words[1] ?? '';
  const mappedGenus = PLANT_GENUS_POLISH_NAME_OVERRIDES[genus.toLowerCase()];

  if (!mappedGenus) {
    return commonName || latin;
  }

  const isCommonNameLatinLike =
    !commonName ||
    normalizeText(commonName) === normalizeText(latin) ||
    normalizeText(commonName).startsWith(normalizeText(genus));

  if (!isCommonNameLatinLike) {
    return commonName;
  }

  if (!species) {
    return mappedGenus;
  }

  return `${mappedGenus} ${species}`;
}

function getLocalizedPlantCommonName(commonName, latinName, locale = 'pl') {
  const mappedCommonName = getLocalizedNameFromCatalogMap(
    PLANT_LOCALIZED_COMMON_NAMES_BY_LATIN,
    latinName,
    locale
  );

  if (mappedCommonName) {
    return mappedCommonName;
  }

  if (getSupportedCatalogLocale(locale) === 'pl') {
    return getPolishPlantCommonName(commonName, latinName);
  }

  return String(commonName ?? '').trim();
}

function compareCatalogEntryCommonNames(a, b, locale = 'pl') {
  const normalizedLocale = getSupportedCatalogLocale(locale);
  const labelA = String(a?.commonName ?? a?.name ?? a?.latinName ?? '');
  const labelB = String(b?.commonName ?? b?.name ?? b?.latinName ?? '');

  return labelA.localeCompare(labelB, normalizedLocale);
}

function sortCatalogEntriesByCommonName(entries = [], locale = 'pl') {
  return [...entries].sort((a, b) =>
    compareCatalogEntryCommonNames(a, b, locale)
  );
}

function localizeCatalogItemCommonName(item, type, locale = 'pl') {
  if (!item || typeof item !== 'object') {
    return item;
  }

  const currentCommonName = String(item.commonName ?? item.name ?? '').trim();
  const latinName = String(item.latinName ?? '').trim();
  const localizedCommonName =
    type === 'fish'
      ? getLocalizedFishCommonName(currentCommonName, latinName, locale)
      : getLocalizedPlantCommonName(currentCommonName, latinName, locale);
  const nextCommonName = localizedCommonName || currentCommonName;
  const nextName = String(item.name ?? '').trim();

  if (
    nextCommonName === currentCommonName &&
    (item.name === undefined || nextCommonName === nextName)
  ) {
    return item;
  }

  return {
    ...item,
    commonName: nextCommonName,
    name: nextCommonName,
  };
}

function localizeFishCatalogEntriesForLanguage(entries = [], locale = 'pl') {
  let hasChanges = false;
  const localizedEntries = entries.map((item) => {
    const localizedItem = localizeCatalogItemCommonName(item, 'fish', locale);

    if (localizedItem !== item) {
      hasChanges = true;
    }

    return localizedItem;
  });

  return hasChanges ? localizedEntries : entries;
}

function localizePlantCatalogEntriesForLanguage(entries = [], locale = 'pl') {
  let hasChanges = false;
  const localizedEntries = entries.map((item) => {
    const localizedItem = localizeCatalogItemCommonName(item, 'plant', locale);

    if (localizedItem !== item) {
      hasChanges = true;
    }

    return localizedItem;
  });

  return hasChanges ? localizedEntries : entries;
}

function localizeStockItemsForLanguage(entries = [], locale = 'pl') {
  let hasChanges = false;
  const localizedEntries = entries.map((item) => {
    if (item?.type !== 'fish' && item?.type !== 'plant') {
      return item;
    }

    const localizedItem = localizeCatalogItemCommonName(
      item,
      item.type,
      locale
    );

    if (localizedItem !== item) {
      hasChanges = true;
    }

    return localizedItem;
  });

  return hasChanges ? localizedEntries : entries;
}

function getPlantCatalogNormalizationPayload(item) {
  const commonName = getPolishPlantCommonName(item?.commonName, item?.latinName);
  const latinName = String(item?.latinName ?? '').trim();
  const latinKey = normalizeLatinCatalogKey(latinName);
  const manualFileName = getPlantCommonsFileOverride(latinKey);
  const imagePreviewUrl = String(item?.imagePreviewUrl ?? '').trim();
  const imageUrl = String(item?.imageUrl ?? '').trim();
  const fallbackPreviewUrl = manualFileName
    ? buildCommonsFileThumbnailUrl(manualFileName, 420)
    : buildPlantCommonsFallbackImageUrl(latinName, 420);
  const fallbackImageUrl = manualFileName
    ? buildCommonsFileThumbnailUrl(manualFileName, 900)
    : buildPlantCommonsFallbackImageUrl(latinName, 900);

  return {
    commonName,
    commonNameNormalized: normalizeText(commonName),
    latinName,
    latinNameNormalized: normalizeText(latinName),
    imagePreviewUrl: imagePreviewUrl || fallbackPreviewUrl || '',
    imageUrl: imageUrl || fallbackImageUrl || '',
  };
}

function buildPlantSeedEntry(rawPlant, source) {
  const latinName = String(rawPlant.latinName ?? '').trim();
  const commonName = getPolishPlantCommonName(rawPlant.commonName, latinName);

  if (!commonName || !latinName) {
    return null;
  }

  const phMin = parseFishNumber(rawPlant.phMin, EXPANDED_PLANT_DEFAULTS.phMin);
  const phMax = parseFishNumber(rawPlant.phMax, EXPANDED_PLANT_DEFAULTS.phMax);
  const ghMin = parseFishNumber(rawPlant.ghMin, EXPANDED_PLANT_DEFAULTS.ghMin);
  const ghMax = parseFishNumber(rawPlant.ghMax, EXPANDED_PLANT_DEFAULTS.ghMax);
  const tempMin = parseFishNumber(
    rawPlant.tempMin,
    EXPANDED_PLANT_DEFAULTS.tempMin
  );
  const tempMax = parseFishNumber(
    rawPlant.tempMax,
    EXPANDED_PLANT_DEFAULTS.tempMax
  );
  const minLiters = parseFishNumber(
    rawPlant.minLiters,
    EXPANDED_PLANT_DEFAULTS.minLiters
  );
  const notes = String(rawPlant.notes ?? '').trim();
  const hasCustomRange =
    Number.isFinite(Number(rawPlant.phMin)) &&
    Number.isFinite(Number(rawPlant.phMax)) &&
    Number.isFinite(Number(rawPlant.ghMin)) &&
    Number.isFinite(Number(rawPlant.ghMax)) &&
    Number.isFinite(Number(rawPlant.tempMin)) &&
    Number.isFinite(Number(rawPlant.tempMax)) &&
    Number.isFinite(Number(rawPlant.minLiters));

  return {
    commonName,
    latinName,
    phMin: Math.min(phMin, phMax),
    phMax: Math.max(phMin, phMax),
    ghMin: Math.min(ghMin, ghMax),
    ghMax: Math.max(ghMin, ghMax),
    tempMin: Math.min(tempMin, tempMax),
    tempMax: Math.max(tempMin, tempMax),
    minLiters: Math.max(5, Math.round(minLiters)),
    notes: notes || (!hasCustomRange ? EXPANDED_PLANT_DEFAULTS.notes : ''),
    ...getPlantCatalogNormalizationPayload({
      commonName,
      latinName,
      imagePreviewUrl: rawPlant.imagePreviewUrl,
      imageUrl: rawPlant.imageUrl,
    }),
    source,
  };
}

function getPlantSeedScore(item) {
  const source = String(item.source ?? '').trim().toLowerCase();
  const hasStarterRanges = source === 'starter';
  const hasCustomNote =
    item.notes && item.notes !== EXPANDED_PLANT_DEFAULTS.notes;

  let score = 0;

  if (hasStarterRanges) {
    score += 100;
  }

  if (hasCustomNote) {
    score += 1;
  }

  return score;
}

function buildPlantCatalogSeed() {
  const seeds = [
    ...PLANT_CATALOG_STARTER.map((plant) =>
      buildPlantSeedEntry(plant, 'starter')
    ),
    ...PLANT_CATALOG_EXPANDED.map((plant) =>
      buildPlantSeedEntry(plant, 'expanded')
    ),
  ].filter((item) => item && isAllowedPlantCatalogLatinName(item.latinName));

  const byLatinName = new Map();

  seeds.forEach((item) => {
    const key = normalizeLatinCatalogKey(item.latinName);
    const current = byLatinName.get(key);

    if (!current || getPlantSeedScore(item) > getPlantSeedScore(current)) {
      byLatinName.set(key, item);
    }
  });

  return [...byLatinName.values()];
}

const PLANT_CATALOG_SEED = buildPlantCatalogSeed();

function formatRange(minValue, maxValue, unit = '') {
  if (minValue === undefined || maxValue === undefined) {
    return '-';
  }

  return unit
    ? `${minValue}-${maxValue} ${unit}`
    : `${minValue}-${maxValue}`;
}

const PRACTICAL_WATER_TOLERANCE = {
  fish: {
    ph: 0.3,
    gh: 2,
    temperature: 1,
  },
  plant: {
    ph: 0.5,
    gh: 4,
    temperature: 2,
  },
};

const SENSITIVE_STOCK_KEYWORDS = [
  'wrazliw',
  'stabilnych parametrow',
  'stabilne warunki',
  'miekkiej wod',
  'crystal red',
  'ramireza',
  'dyskowiec',
  'discus',
];

const HARDY_STOCK_KEYWORDS = [
  'latwa',
  'latwy',
  'easy',
  'pokojowa',
  'pokojowy',
  'spokojna',
  'spokojny',
  'dobra do akwarium towarzyskiego',
];

function getStockPracticalToleranceMultiplier(item) {
  const fingerprint = normalizeText(
    `${item?.commonName ?? ''} ${item?.latinName ?? ''} ${item?.notes ?? ''}`
  );

  if (SENSITIVE_STOCK_KEYWORDS.some((keyword) => fingerprint.includes(keyword))) {
    return 0.7;
  }

  if (HARDY_STOCK_KEYWORDS.some((keyword) => fingerprint.includes(keyword))) {
    return 1.15;
  }

  return 1;
}

function formatPracticalCompatibilityIssue({
  label,
  value,
  min,
  max,
  tolerance,
  subjectLabel,
}) {
  const practicalMin = roundToOneDecimal(min - tolerance);
  const practicalMax = roundToOneDecimal(max + tolerance);

  return `${label} jest juz dosc daleko od praktycznego zakresu ${subjectLabel} (${practicalMin}-${practicalMax}). Aktualnie: ${value}.`;
}

function getPracticalWaterParameterIssues(item, measurement, stockType) {
  if (!measurement) {
    return [];
  }

  const config =
    stockType === 'plant'
      ? PRACTICAL_WATER_TOLERANCE.plant
      : PRACTICAL_WATER_TOLERANCE.fish;
  const toleranceMultiplier = getStockPracticalToleranceMultiplier(item);
  const subjectLabel =
    stockType === 'plant' ? 'dla tej rosliny' : 'dla tego gatunku';
  const checks = [
    {
      key: 'ph',
      label: 'pH',
      value: Number(measurement.ph),
      min: Number(item.phMin),
      max: Number(item.phMax),
    },
    {
      key: 'gh',
      label: 'GH',
      value: Number(measurement.gh),
      min: Number(item.ghMin),
      max: Number(item.ghMax),
    },
    {
      key: 'temperature',
      label: 'Temperatura',
      value: Number(measurement.temperature),
      min: Number(item.tempMin),
      max: Number(item.tempMax),
    },
  ];

  return checks.flatMap((check) => {
    if (
      !Number.isFinite(check.value) ||
      !Number.isFinite(check.min) ||
      !Number.isFinite(check.max)
    ) {
      return [];
    }

    const tolerance = Number(config[check.key] ?? 0) * toleranceMultiplier;
    const practicalMin = check.min - tolerance;
    const practicalMax = check.max + tolerance;

    if (check.value >= practicalMin && check.value <= practicalMax) {
      return [];
    }

    return [
      formatPracticalCompatibilityIssue({
        label: check.label,
        value: check.value,
        min: check.min,
        max: check.max,
        tolerance,
        subjectLabel,
      }),
    ];
  });
}

function checkFishCompatibility(item, measurement, tankLiters, tankProfile = null) {
  const issues = [];

  if (!measurement) {
    issues.push(
      'Brak pomiaru - trudno realnie ocenic dopasowanie. Warto dodac aktualny pomiar.'
    );
  }

  if (
    Number.isFinite(Number(item.minLiters)) &&
    Number(item.minLiters) > Number(tankLiters)
  ) {
    issues.push(
      `Ten gatunek zwykle lepiej czuje sie od ${item.minLiters} l, a akwarium ma ${tankLiters} l.`
    );
  }

  issues.push(...getPracticalWaterParameterIssues(item, measurement, 'fish'));

  if (tankProfile) {
    const substrateNeed = inferFishSubstrateNeed(item);
    const substrateType = normalizeSubstrateType(tankProfile.substrateType);

    if (
      substrateNeed === 'soft' &&
      substrateType &&
      !isSoftBottomSubstrate(substrateType)
    ) {
      issues.push(
        `Ten gatunek zwykle lepiej czuje sie na miekkim podlozu, a w akwarium ustawiono: ${getSubstrateLabel(substrateType)}.`
      );
    }

    const fishLightRange = inferFishLightRange(item);
    const tankLightRank = lightLevelToRank(
      normalizeLightIntensity(tankProfile.lightIntensity)
    );

    if (
      fishLightRange &&
      tankLightRank !== null &&
      lightLevelToRank(fishLightRange.min) !== null &&
      lightLevelToRank(fishLightRange.max) !== null &&
      (tankLightRank < lightLevelToRank(fishLightRange.min) ||
        tankLightRank > lightLevelToRank(fishLightRange.max))
    ) {
      issues.push(
        `Swiatlo (${getLightIntensityLabel(
          tankProfile.lightIntensity
        )}) moze nie byc optymalne dla tego gatunku.`
      );
    }
  }

  return issues;
}

function checkPlantCompatibility(item, measurement, tankLiters, tankProfile = null) {
  const issues = [];

  if (!measurement) {
    issues.push(
      'Brak pomiaru - trudno realnie ocenic dopasowanie. Warto dodac aktualny pomiar.'
    );
  }

  if (
    Number.isFinite(Number(item.minLiters)) &&
    Number(item.minLiters) > Number(tankLiters)
  ) {
    issues.push(
      `Ta roslina zwykle lepiej sprawdza sie od ${item.minLiters} l, a akwarium ma ${tankLiters} l.`
    );
  }

  issues.push(...getPracticalWaterParameterIssues(item, measurement, 'plant'));

  if (tankProfile) {
    const substrateNeed = inferPlantSubstrateNeed(item);
    const substrateType = normalizeSubstrateType(tankProfile.substrateType);

    if (
      substrateNeed === 'nutrient' &&
      substrateType &&
      !isNutrientSubstrate(substrateType)
    ) {
      const hasActiveRootTabsSupport = Boolean(tankProfile.hasActiveRootTabsSupport);
      const rootTabsSupportDaysLeft = Number(tankProfile.rootTabsSupportDaysLeft);

      if (!hasActiveRootTabsSupport) {
        issues.push(
          `Ta roslina zwykle rosnie lepiej w bardziej zasobnym podlozu, a w akwarium ustawiono: ${getSubstrateLabel(substrateType)}.`
        );
      } else if (
        Number.isFinite(rootTabsSupportDaysLeft) &&
        rootTabsSupportDaysLeft <= ROOT_TABS_DUE_SOON_DAYS
      ) {
        issues.push(
          `Podloze (${getSubstrateLabel(substrateType)}) jest wspierane kulkami nawozowymi, ale ich dzialanie moze sie skonczyc za ok. ${Math.max(
            0,
            Math.round(rootTabsSupportDaysLeft)
          )} dni.`
        );
      }
    }

    const plantLightRange = inferPlantLightRange(item);
    const tankLightRank = lightLevelToRank(
      normalizeLightIntensity(tankProfile.lightIntensity)
    );

    if (
      plantLightRange &&
      tankLightRank !== null &&
      lightLevelToRank(plantLightRange.min) !== null &&
      lightLevelToRank(plantLightRange.max) !== null &&
      (tankLightRank < lightLevelToRank(plantLightRange.min) ||
        tankLightRank > lightLevelToRank(plantLightRange.max))
    ) {
      issues.push(
        `Swiatlo (${getLightIntensityLabel(
          tankProfile.lightIntensity
        )}) moze nie byc optymalne dla tej rosliny.`
      );
    }

    if (plantLightRange && Number.isFinite(Number(tankProfile.lightHours))) {
      const lightHours = Number(tankProfile.lightHours);
      const minHours = Number(plantLightRange.minHours);
      const maxHours = Number(plantLightRange.maxHours);

      if (
        Number.isFinite(minHours) &&
        Number.isFinite(maxHours) &&
        (lightHours < minHours || lightHours > maxHours)
      ) {
        issues.push(
          `Czas swiecenia (${lightHours} h) moze utrudniac tej roslinie stabilny wzrost (zwykle ${minHours}-${maxHours} h).`
        );
      }
    }
  }

  return issues;
}

function isSubstrateCompatibilityIssue(issueText) {
  const normalized = String(issueText ?? '')
    .trim()
    .toLowerCase();

  if (!normalized) {
    return false;
  }

  return normalized.includes('podloz');
}

function summarizeCompatibilityResults(results = []) {
  let speciesWithIssues = 0;
  let speciesWithMajorIssues = 0;
  let speciesWithOnlySubstrateIssues = 0;
  let totalIssues = 0;
  let totalMajorIssues = 0;
  let totalSubstrateIssues = 0;

  (results ?? []).forEach((item) => {
    const issues = Array.isArray(item?.issues)
      ? item.issues.filter((entry) => Boolean(String(entry ?? '').trim()))
      : [];

    if (issues.length === 0) {
      return;
    }

    speciesWithIssues += 1;
    let hasMajorIssue = false;
    let hasSubstrateIssue = false;

    issues.forEach((issueText) => {
      totalIssues += 1;
      if (isSubstrateCompatibilityIssue(issueText)) {
        totalSubstrateIssues += 1;
        hasSubstrateIssue = true;
      } else {
        totalMajorIssues += 1;
        hasMajorIssue = true;
      }
    });

    if (hasMajorIssue) {
      speciesWithMajorIssues += 1;
    } else if (hasSubstrateIssue) {
      speciesWithOnlySubstrateIssues += 1;
    }
  });

  return {
    speciesWithIssues,
    speciesWithMajorIssues,
    speciesWithOnlySubstrateIssues,
    totalIssues,
    totalMajorIssues,
    totalSubstrateIssues,
  };
}

function formatCompactNameList(items = [], limit = 3) {
  const names = [
    ...new Set(
      (items ?? [])
        .map((item) => String(item ?? '').trim())
        .filter((item) => item.length > 0)
    ),
  ];

  if (names.length === 0) {
    return '';
  }

  const visible = names.slice(0, limit).join(', ');
  return names.length > limit ? `${visible} i inne` : visible;
}

function buildCompatibilityMismatchDetails(
  results = [],
  { maxSpecies = 3, maxIssuesPerSpecies = 2 } = {}
) {
  const affected = (results ?? [])
    .filter((item) => Array.isArray(item?.issues) && item.issues.length > 0)
    .slice(0, maxSpecies);

  const details = affected.map((item) => {
    const label = String(item?.label ?? item?.id ?? 'Gatunek').trim();
    const issues = (item?.issues ?? [])
      .map((issue) => String(issue ?? '').trim())
      .filter(Boolean)
      .slice(0, maxIssuesPerSpecies);
    return issues.length > 0 ? `${label}: ${issues.join(' | ')}` : label;
  });

  return {
    details,
    names: affected.map((item) => String(item?.label ?? item?.id ?? '').trim()).filter(Boolean),
  };
}

function buildAggressionConflictDetails(conflicts = [], maxPairs = 4) {
  const pairs = (conflicts ?? []).slice(0, maxPairs).map((item) => {
    const first = String(
      item?.firstFish?.commonName ??
        item?.firstFish?.name ??
        item?.firstFish?.latinName ??
        'Ryba 1'
    ).trim();
    const second = String(
      item?.secondFish?.commonName ??
        item?.secondFish?.name ??
        item?.secondFish?.latinName ??
        'Ryba 2'
    ).trim();
    return `${first} <-> ${second}`;
  });

  return [...new Set(pairs)];
}

function buildSchoolingWarningDetails(items = [], maxItems = 4) {
  return (items ?? [])
    .slice(0, maxItems)
    .map((item) => {
      const label = String(item?.label ?? item?.id ?? 'Gatunek').trim();
      const current = Number(item?.quantity);
      const min = Number(item?.minGroupSize);
      return `${label}: masz ${Number.isFinite(current) ? current : '?'} szt., minimum ${Number.isFinite(min) ? min : '?'} szt.`;
    })
    .filter(Boolean);
}

function getIssueCaseDisplayName(item) {
  const rawName = String(item?.issueName ?? item?.diseaseName ?? item?.name ?? '').trim();

  if (!rawName) {
    return '';
  }

  const withoutParentheses = rawName.replace(/\([^)]*\)/g, '').trim();
  const withoutDashSuffix = withoutParentheses.split(' - ')[0].trim();
  return withoutDashSuffix || withoutParentheses || rawName;
}

function getFishQuantity(item) {
  const parsed = Number(item.quantity);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return Math.max(1, Math.round(parsed));
}

function estimateBioloadLitersPerFish(minLiters) {
  const min = Number(minLiters);

  if (!Number.isFinite(min) || min <= 0) {
    return 3;
  }

  if (min <= 30) {
    return 2.6;
  }

  if (min <= 60) {
    return 3.8;
  }

  if (min <= 100) {
    return 5.6;
  }

  if (min <= 160) {
    return 7.3;
  }

  if (min <= 240) {
    return 9.6;
  }

  return 12;
}

function buildFishStockingSummary(stockItems, tankLiters) {
  const fishItems = stockItems.filter((item) => item.type === 'fish');
  const tank = Number(tankLiters);

  if (!Number.isFinite(tank) || tank <= 0 || fishItems.length === 0) {
    return {
      hasFish: fishItems.length > 0,
      hasTankLiters: Number.isFinite(tank) && tank > 0,
      estimatedLiters: 0,
      tankLiters: tank,
      ratio: 0,
      isOverstocked: false,
    };
  }

  const largestSpeciesMinLiters = fishItems.reduce((maxValue, item) => {
    const minLiters = Number(item.minLiters);

    if (!Number.isFinite(minLiters) || minLiters <= 0) {
      return maxValue;
    }

    return Math.max(maxValue, minLiters);
  }, 0);

  const bioloadLiters = fishItems.reduce((sum, item) => {
    const quantity = getFishQuantity(item);
    return sum + estimateBioloadLitersPerFish(item.minLiters) * quantity;
  }, 0);

  const estimatedLiters = Math.max(largestSpeciesMinLiters, bioloadLiters);
  const ratio = estimatedLiters / tank;

  return {
    hasFish: true,
    hasTankLiters: true,
    estimatedLiters,
    tankLiters: tank,
    ratio,
    isOverstocked: ratio > 1.05,
  };
}

const ANALYSIS_SEVERITY_PRIORITY = {
  ok: 0,
  warning: 1,
  critical: 2,
};

function getAnalysisSeverityRank(value) {
  return ANALYSIS_SEVERITY_PRIORITY[value] ?? 0;
}

function mergeWaterRecommendations(base = [], extra = []) {
  const all = [...base, ...extra];
  const unique = [];
  const seen = new Set();

  all.forEach((item) => {
    if (!item) {
      return;
    }

    const key = `${String(item.parameter ?? '').trim().toLowerCase()}|${String(
      item.action ?? ''
    )
      .trim()
      .toLowerCase()}`;

    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    unique.push(item);
  });

  return unique
    .sort((a, b) => {
      const severityDiff =
        getAnalysisSeverityRank(b.severity) - getAnalysisSeverityRank(a.severity);

      if (severityDiff !== 0) {
        return severityDiff;
      }

      const dueA = Number.isFinite(Number(a.dueInDays)) ? Number(a.dueInDays) : 99;
      const dueB = Number.isFinite(Number(b.dueInDays)) ? Number(b.dueInDays) : 99;
      return dueA - dueB;
    })
    .slice(0, 10);
}

function buildContextualEcosystemInsights({
  measurement,
  enabledTests = {},
  stockItems = [],
  tank = null,
  equipmentAssessment = null,
}) {
  if (!measurement) {
    return {
      recommendations: [],
      riskNotes: [],
      summaryHints: [],
    };
  }

  const isTestEnabled = (key) => Boolean(enabledTests?.[key]);
  const fishItems = stockItems.filter((item) => item.type === 'fish');
  const plantItems = stockItems.filter((item) => item.type === 'plant');
  const fishCount = fishItems.reduce((sum, item) => sum + getFishQuantity(item), 0);
  const plantCount = plantItems.length;
  const tankLiters = Number(tank?.liters);
  const stockingSummary = buildFishStockingSummary(stockItems, tankLiters);
  const plantToFishRatio = fishCount > 0 ? plantCount / fishCount : 0;
  const no3Value = Number.isFinite(Number(measurement?.no3))
    ? Number(measurement.no3)
    : null;

  const hasLowPlantBuffer =
    fishCount >= 8 && plantCount <= 2
      ? true
      : fishCount >= 12 && plantCount <= 4
        ? true
        : fishCount > 0 && plantToFishRatio < 0.2;
  const hasBioloadPressure =
    stockingSummary.hasFish &&
    stockingSummary.hasTankLiters &&
    stockingSummary.ratio > 1;
  const hasStrongBioloadPressure =
    stockingSummary.hasFish &&
    stockingSummary.hasTankLiters &&
    stockingSummary.ratio > 1.2;
  const hasWeakFiltration =
    equipmentAssessment?.filter?.status === 'warning' ||
    equipmentAssessment?.filter?.status === 'critical' ||
    equipmentAssessment?.filter?.status === 'none';

  const recommendations = [];
  const riskNotes = [];
  const summaryHints = [];

  if (fishCount > 0 && hasLowPlantBuffer) {
    riskNotes.push({
      severity: hasStrongBioloadPressure ? 'critical' : 'warning',
      text: `Uklad obsady (${fishCount} ryb, ${plantCount} roslin) sprzyja narastaniu NO3 i glonom.`,
    });
  }

  if (
    fishCount > 0 &&
    (hasLowPlantBuffer || hasBioloadPressure) &&
    isTestEnabled('no3') &&
    no3Value !== null &&
    no3Value > 25
  ) {
    const no3Severity = getMeasurementSeverityFromValue('no3', no3Value);
    const severity = no3Severity === 'critical' ? 'critical' : 'warning';

    recommendations.push({
      severity,
      parameter: 'NO3 / rownowaga biologiczna',
      value: `${Math.round(no3Value * 10) / 10} mg/l`,
      expectedRange: 'NO3 <= 25 mg/l i trend stabilny',
      issue:
        'Duza obsada przy malej masie roslin zwieksza produkcje azotanow szybciej niz zbiornik je wykorzystuje.',
      action:
        'Na 10-14 dni: podmiany 20-25% co 3-4 dni, karmienie -20-30%, odmulanie dna i dodanie szybko rosnacych roslin (np. rogatek, hygrophila, nurzaniec).',
      dueInDays: severity === 'critical' ? 0 : 1,
    });

    summaryHints.push(
      'Parametry trzeba czytac razem z obciazeniem zbiornika: przy tej obsadzie NO3 bedzie wracalo bez korekty karmienia i masy roslin.'
    );
  }

  if (
    fishCount > 0 &&
    hasLowPlantBuffer &&
    !isTestEnabled('no3')
  ) {
    recommendations.push({
      severity: 'warning',
      parameter: 'NO3',
      value: 'brak aktywnego testu',
      expectedRange: 'NO3 <= 25 mg/l',
      issue:
        'Przy tej obsadzie bez testu NO3 trudno wychwycic narastanie obciazenia biologicznego.',
      action:
        'Wlacz test NO3 w ustawieniach i kontroluj go min. 2 razy w tygodniu przez najblizsze 2 tygodnie.',
      dueInDays: 1,
    });
  }

  if (
    fishCount > 0 &&
    hasBioloadPressure &&
    hasWeakFiltration
  ) {
    recommendations.push({
      severity: hasStrongBioloadPressure ? 'critical' : 'warning',
      parameter: 'Filtracja / obciazenie',
      value: hasStrongBioloadPressure ? 'wysokie' : 'podwyzszone',
      expectedRange: 'wydajna filtracja biologiczna dla aktualnej obsady',
      issue:
        'Obciazenie biologiczne jest wysokie, a filtracja wymaga poprawy - to przyspiesza skoki NO2/NO3.',
      action:
        'Popraw filtracje: wyczysc prefiltr, zwieksz media biologiczne i rozwaz mocniejszy zestaw lub drugi filtr.',
      dueInDays: hasStrongBioloadPressure ? 0 : 2,
    });
  }

  return {
    recommendations,
    riskNotes,
    summaryHints,
  };
}

function mergeWaterAnalysisWithContext(baseAnalysis, contextInsights) {
  if (!baseAnalysis) {
    return null;
  }

  const mergedRecommendations = mergeWaterRecommendations(
    baseAnalysis.recommendations,
    contextInsights?.recommendations ?? []
  );
  const topSeverity = mergedRecommendations.reduce((maxSeverity, item) => {
    const nextSeverity = item?.severity ?? 'ok';
    return getAnalysisSeverityRank(nextSeverity) > getAnalysisSeverityRank(maxSeverity)
      ? nextSeverity
      : maxSeverity;
  }, baseAnalysis.status ?? 'ok');

  const summaryHint = (contextInsights?.summaryHints ?? [])[0];
  const summary = summaryHint
    ? `${baseAnalysis.summary} ${summaryHint}`
    : baseAnalysis.summary;

  return {
    ...baseAnalysis,
    status: topSeverity,
    summary,
    recommendations: mergedRecommendations,
  };
}

function clampScore(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function getHomeStatusSeverityFromScore(scoreValue) {
  const score = Number(scoreValue);

  if (!Number.isFinite(score)) {
    return 'none';
  }

  if (score < 50) {
    return 'critical';
  }

  if (score < 65) {
    return 'warning';
  }

  return 'ok';
}

function getAggressionCrowdingFactor(stockingSummary) {
  if (!stockingSummary?.hasFish) {
    return 0;
  }

  if (!stockingSummary?.hasTankLiters) {
    return 1;
  }

  const ratio = Number(stockingSummary?.ratio);

  if (!Number.isFinite(ratio)) {
    return 1;
  }

  if (ratio <= 0.72) {
    return 0;
  }

  if (ratio <= 0.9) {
    return 0.35;
  }

  if (ratio <= 1.05) {
    return 0.7;
  }

  return 1;
}

function buildAquariumHealthAssessment({
  tank,
  measurement,
  stockItems = [],
  activeIssueCases = [],
}) {
  const tankLiters = Number(tank?.liters);
  const tankProfile = buildTankEnvironmentProfile(tank);
  const equipmentAssessment = buildTankEquipmentAssessment(
    tank,
    EQUIPMENT_CATALOG
  );
  const fishItems = stockItems.filter((item) => item.type === 'fish');
  const plantItems = stockItems.filter((item) => item.type === 'plant');
  const filledMeasurementCount = TEST_PARAMETER_OPTIONS.reduce((count, option) => {
    return Number.isFinite(Number(measurement?.[option.key])) ? count + 1 : count;
  }, 0);
  const penalties = [];
  let score = 94;
  let accuracy = 25;
  const toAdjustedPenaltyPoints = (rawPoints) => {
    const safeRawPoints = Math.max(0, Number(rawPoints) || 0);
    if (safeRawPoints <= 0) {
      return 0;
    }

    const weight =
      safeRawPoints >= 20
        ? 0.72
        : safeRawPoints >= 12
          ? 0.68
          : safeRawPoints >= 6
            ? 0.62
            : 0.55;

    return Math.max(1, Math.round(safeRawPoints * weight));
  };

  const applyPenalty = (points, text, category = 'general') => {
    const safePoints = toAdjustedPenaltyPoints(points);

    if (safePoints <= 0) {
      return;
    }

    score -= safePoints;
    penalties.push({
      points: safePoints,
      text,
      category,
    });
  };

  const applyBonus = (points) => {
    score += Math.max(0, Number(points) || 0);
  };

  if (!Number.isFinite(tankLiters) || tankLiters <= 0) {
    applyPenalty(22, 'Brak poprawnego litrazu akwarium.');
  } else {
    accuracy += 20;

    const equipmentEntries = [
      { label: 'Grzalka', entry: equipmentAssessment.heater },
      { label: 'Filtr', entry: equipmentAssessment.filter },
    ];
    let hasAllEquipmentOk = true;

    equipmentEntries.forEach(({ label, entry }) => {
      if (entry.status === 'critical') {
        hasAllEquipmentOk = false;
        applyPenalty(
          6,
          `Sprzet (${label}): ${entry.actions[0] ?? entry.details}`,
          'equipment'
        );
        return;
      }

      if (entry.status === 'warning') {
        hasAllEquipmentOk = false;
        applyPenalty(
          3,
          `Sprzet (${label}): ${entry.actions[0] ?? entry.details}`,
          'equipment'
        );
        return;
      }

      if (entry.status === 'none') {
        hasAllEquipmentOk = false;
        applyPenalty(
          2,
          `Sprzet (${label}): brak dopasowanego zestawu do litrazu.`,
          'equipment'
        );
      }
    });

    if (hasAllEquipmentOk) {
      applyBonus(2);
    }
  }

  if (!measurement) {
    applyPenalty(
      fishItems.length + plantItems.length > 0 ? 10 : 5,
      'Brak aktualnego pomiaru wody.'
    );
  } else {
    accuracy += 20;
    accuracy += Math.min(filledMeasurementCount * 3, 20);
    const contextInsights = buildContextualEcosystemInsights({
      measurement,
      enabledTests: ALL_MEASUREMENT_TESTS,
      stockItems,
      tank,
      equipmentAssessment,
    });
    const analysis = mergeWaterAnalysisWithContext(
      analyzeMeasurementLogic(measurement, ALL_MEASUREMENT_TESTS),
      contextInsights
    );
    const riskNotes = [
      ...buildCurrentRiskNotesLogic(measurement, tankProfile),
      ...(contextInsights.riskNotes ?? []),
    ].filter((item, index, list) => {
      const key = String(item?.text ?? '')
        .trim()
        .toLowerCase();
      if (!key) {
        return false;
      }
      return (
        list.findIndex(
          (candidate) =>
            String(candidate?.text ?? '')
              .trim()
              .toLowerCase() === key
        ) === index
      );
    });

    if (analysis?.status === 'critical') {
      applyPenalty(16, 'Parametry wody sa wyraznie poza bezpiecznym zakresem.');
    } else if (analysis?.status === 'warning') {
      applyPenalty(8, 'Czesc parametrow wody warto skorygowac.');
    } else if (analysis?.status === 'ok') {
      applyBonus(3);
    }

    const recommendationPenalty = Math.min((analysis?.recommendations?.length ?? 0) * 2, 8);
    if (recommendationPenalty > 0) {
      applyPenalty(recommendationPenalty, 'Parametry sugeruja kilka rzeczy do poprawy.');
    }

    const riskPenalty = Math.min(riskNotes.length * 2, 8);
    if (riskPenalty > 0) {
      applyPenalty(riskPenalty, 'Widac dodatkowe ryzyka dla stabilnosci zbiornika.');
    }
  }

  if (stockItems.length > 0) {
    accuracy += 15;
  } else {
    accuracy += 5;
  }

  if (fishItems.length > 0) {
    accuracy += 5;
  }

  if (plantItems.length > 0) {
    accuracy += 5;
  }

  if (tankProfile.substrateType) {
    accuracy += 5;
  }

  if (tankProfile.lightIntensity) {
    accuracy += 5;
  }

  if (Number.isFinite(Number(tankProfile.lightHours))) {
    accuracy += 5;
  }

  const fishCompatibilityResults = fishItems.map((item) => ({
    id: item.id,
    issues: checkFishCompatibility(item, measurement, tankLiters, tankProfile),
  }));
  const plantCompatibilityResults = plantItems.map((item) => ({
    id: item.id,
    issues: checkPlantCompatibility(item, measurement, tankLiters, tankProfile),
  }));
  const fishCompatibilitySummary = summarizeCompatibilityResults(
    fishCompatibilityResults
  );
  const plantCompatibilitySummary = summarizeCompatibilityResults(
    plantCompatibilityResults
  );

  const fishCompatibilityPenalty = Math.min(
    fishCompatibilitySummary.totalMajorIssues * 4 +
      fishCompatibilitySummary.totalSubstrateIssues * 1,
    18
  );
  if (fishCompatibilityPenalty > 0) {
    const fishSubstrateHint =
      fishCompatibilitySummary.totalSubstrateIssues > 0
        ? ` (w tym podloze: ${fishCompatibilitySummary.totalSubstrateIssues} ostrz.)`
        : '';
    applyPenalty(
      fishCompatibilityPenalty,
      `Ryby maja ${fishCompatibilitySummary.totalIssues} sygnalow niedopasowania do warunkow${fishSubstrateHint}.`
    );
  }

  const plantCompatibilityPenalty = Math.min(
    plantCompatibilitySummary.totalMajorIssues * 3 +
      plantCompatibilitySummary.totalSubstrateIssues * 1,
    12
  );
  if (plantCompatibilityPenalty > 0) {
    const plantSubstrateHint =
      plantCompatibilitySummary.totalSubstrateIssues > 0
        ? ` (w tym podloze: ${plantCompatibilitySummary.totalSubstrateIssues} ostrz.)`
        : '';
    applyPenalty(
      plantCompatibilityPenalty,
      `Rosliny maja ${plantCompatibilitySummary.totalIssues} sygnalow niedopasowania do warunkow${plantSubstrateHint}.`
    );
  }

  const schoolingWarningCount = fishItems.filter((item) => {
    const schoolingProfile = resolveFishSchoolingProfile(item);
    return schoolingProfile.isSchooling && getFishQuantity(item) < schoolingProfile.minGroupSize;
  }).length;
  const schoolingPenalty = Math.min(schoolingWarningCount * 5, 10);
  if (schoolingPenalty > 0) {
    applyPenalty(
      schoolingPenalty,
      `${schoolingWarningCount} gat. ryb stadnych ma zbyt mala grupe.`
    );
  }

  let aggressionConflictCount = 0;
  for (let index = 0; index < fishItems.length; index += 1) {
    for (
      let compareIndex = index + 1;
      compareIndex < fishItems.length;
      compareIndex += 1
    ) {
      if (getFishAggressionConflict(fishItems[index], fishItems[compareIndex])) {
        aggressionConflictCount += 1;
      }
    }
  }
  const stockingSummary = buildFishStockingSummary(stockItems, tankLiters);
  const aggressionCrowdingFactor = getAggressionCrowdingFactor(stockingSummary);
  const effectiveAggressionConflicts = aggressionConflictCount * aggressionCrowdingFactor;
  const aggressionPenalty = Math.min(Math.round(effectiveAggressionConflicts * 8), 18);
  if (aggressionPenalty > 0) {
    const spaceMitigationHint =
      aggressionCrowdingFactor < 1
        ? ' Czesciowo lagodzi to zapas miejsca.'
        : '';
    applyPenalty(
      aggressionPenalty,
      `Wykryto ${aggressionConflictCount} potencjalnych konfliktow agresji miedzy rybami.${spaceMitigationHint}`
    );
  }
  if (stockingSummary.hasFish) {
    if (!stockingSummary.hasTankLiters) {
      applyPenalty(10, 'Brak litrazu utrudnia ocene przerybienia.');
    } else if (stockingSummary.ratio > 1.5) {
      applyPenalty(24, 'Obsada jest wyraznie za duza jak na ten litraz.');
    } else if (stockingSummary.ratio > 1.2) {
      applyPenalty(16, 'Obsada jest odczuwalnie za duza jak na ten litraz.');
    } else if (stockingSummary.ratio > 1.05) {
      applyPenalty(8, 'Obsada jest lekko za duza jak na ten litraz.');
    } else if (stockingSummary.ratio >= 0.7 && stockingSummary.ratio <= 1) {
      score += 2;
    }
  }

  const activeFishDiseaseCases = activeIssueCases.filter(
    (item) => String(item?.caseType ?? '').toLowerCase() === 'disease'
  );
  const activePlantDiseaseCases = activeIssueCases.filter(
    (item) => String(item?.caseType ?? '').toLowerCase() === 'plant_disease'
  );
  const activeAlgaeCases = activeIssueCases.filter(
    (item) => String(item?.caseType ?? '').toLowerCase() === 'algae'
  );
  const activeOtherIssueCases = activeIssueCases.filter((item) => {
    const caseType = String(item?.caseType ?? '').toLowerCase();
    return caseType !== 'disease' && caseType !== 'plant_disease' && caseType !== 'algae';
  });
  const getIssueDisplayName = (item) => {
    const rawName = String(
      item?.issueName ?? item?.diseaseName ?? item?.name ?? ''
    ).trim();

    if (!rawName) {
      return '';
    }

    const withoutParentheses = rawName.replace(/\([^)]*\)/g, '').trim();
    const withoutDashSuffix = withoutParentheses.split(' - ')[0].trim();
    return withoutDashSuffix || withoutParentheses || rawName;
  };
  const formatIssueNames = (cases) => {
    const names = [
      ...new Set(
        cases
          .map((item) => getIssueDisplayName(item))
          .filter((name) => String(name).trim().length > 0)
      ),
    ];

    if (names.length === 0) {
      return 'problem wymagajacy kontroli';
    }

    const visibleNames = names.slice(0, 3).join(', ');
    return names.length > 3 ? `${visibleNames} i inne` : visibleNames;
  };

  const getIssueSeverityWeight = (item) => {
    const severity = String(item?.severity ?? 'medium').toLowerCase();
    if (severity === 'high') {
      return 1.6;
    }
    if (severity === 'low') {
      return 0.9;
    }
    return 1.2;
  };

  const getWeightedIssueLoad = (cases) =>
    cases.reduce((sum, item) => sum + getIssueSeverityWeight(item), 0);

  const fishDiseaseLoad = getWeightedIssueLoad(activeFishDiseaseCases);
  if (fishDiseaseLoad > 0) {
    const fishDiseasePenalty = Math.min(6 + Math.round((fishDiseaseLoad - 1) * 3), 14);
    applyPenalty(
      fishDiseasePenalty,
      `Choroby ryb wymagaja terapii: ${formatIssueNames(activeFishDiseaseCases)}.`,
      'health'
    );
  }

  const plantDiseaseLoad = getWeightedIssueLoad(activePlantDiseaseCases);
  if (plantDiseaseLoad > 0) {
    const plantDiseasePenalty = Math.min(4 + Math.round((plantDiseaseLoad - 1) * 2), 10);
    applyPenalty(
      plantDiseasePenalty,
      `Choroby roslin wymagaja terapii: ${formatIssueNames(activePlantDiseaseCases)}.`,
      'health'
    );
  }

  const algaeLoad = getWeightedIssueLoad(activeAlgaeCases);
  if (algaeLoad > 0) {
    const algaePenalty = Math.min(5 + Math.round((algaeLoad - 1) * 2), 12);
    applyPenalty(
      algaePenalty,
      `Glony wymagaja opanowania: ${formatIssueNames(activeAlgaeCases)}.`,
      'health'
    );
  }

  if (activeOtherIssueCases.length > 0) {
    applyPenalty(
      Math.min(3 + activeOtherIssueCases.length * 2, 8),
      `Aktywne problemy dodatkowe: ${formatIssueNames(activeOtherIssueCases)}.`,
      'health'
    );
  }

  const activeIssueCategoryCount = [
    activeFishDiseaseCases.length > 0,
    activePlantDiseaseCases.length > 0,
    activeAlgaeCases.length > 0,
  ].filter(Boolean).length;
  if (activeIssueCategoryCount >= 2) {
    applyPenalty(
      4,
      'Jednoczesne problemy w wielu obszarach (ryby/rosliny/glony).',
      'health'
    );
  }

  if (measurement && Number.isFinite(tankLiters) && tankLiters > 0) {
    applyBonus(3);
  }

  const sortedPenalties = [...penalties].sort((a, b) => b.points - a.points);
  const equipmentPenalties = sortedPenalties.filter(
    (item) => item.category === 'equipment'
  );
  const healthPenalties = sortedPenalties.filter(
    (item) => item.category === 'health'
  );
  const otherPenalties = sortedPenalties.filter(
    (item) => item.category !== 'equipment' && item.category !== 'health'
  );
  const visiblePenalties = [];
  const pushPenalty = (item) => {
    if (!item || visiblePenalties.includes(item)) {
      return;
    }
    visiblePenalties.push(item);
  };

  equipmentPenalties.slice(0, 2).forEach(pushPenalty);
  healthPenalties.slice(0, 2).forEach(pushPenalty);
  otherPenalties.forEach(pushPenalty);
  const limitedVisiblePenalties = visiblePenalties.slice(0, 6);

  return {
    score: clampScore(Math.round(score)),
    accuracy: clampScore(Math.round(accuracy), 20, 100),
    penalties: limitedVisiblePenalties,
  };
}

function roundToOneDecimal(value) {
  return Math.round(Number(value) * 10) / 10;
}

function buildRecommendedRange(minValues, maxValues) {
  const mins = minValues
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const maxes = maxValues
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (mins.length === 0 || maxes.length === 0) {
    return null;
  }

  const overlapMin = Math.max(...mins);
  const overlapMax = Math.min(...maxes);

  if (overlapMin <= overlapMax) {
    return {
      min: roundToOneDecimal(overlapMin),
      max: roundToOneDecimal(overlapMax),
      conflict: false,
    };
  }

  return {
    min: roundToOneDecimal(Math.min(...mins)),
    max: roundToOneDecimal(Math.max(...maxes)),
    conflict: true,
  };
}

function buildDiseaseSuggestions(selectedSymptomIds) {
  const selected = [...new Set(selectedSymptomIds)];

  if (selected.length === 0) {
    return [];
  }

  return DISEASE_CATALOG.map((disease) => {
    const matches = disease.symptoms.filter((symptomId) =>
      selected.includes(symptomId)
    );
    const precision = matches.length / disease.symptoms.length;
    const coverage = matches.length / selected.length;
    const score = precision * 0.7 + coverage * 0.3;
    const confidencePercent = Math.round(score * 100);

    return {
      ...disease,
      matches,
      score,
      confidencePercent,
    };
  })
    .filter((item) => item.matches.length >= 2)
    .sort((a, b) => {
      const byScore = b.score - a.score;

      if (byScore !== 0) {
        return byScore;
      }

      return (
        DISEASE_SEVERITY_PRIORITY[b.severity] -
        DISEASE_SEVERITY_PRIORITY[a.severity]
      );
    })
    .slice(0, 4);
}

function buildDiseaseTreatmentSchedule(disease) {
  const now = new Date();
  const dayOffsets = [0, 1, 3, 7];
  const steps = disease.treatment.slice(0, 4);

  return steps.map((text, index) => {
    const dueDate = new Date(now);
    dueDate.setDate(
      dueDate.getDate() +
        (dayOffsets[index] ?? dayOffsets[dayOffsets.length - 1])
    );

    return {
      id: `${disease.id}-step-${index + 1}`,
      step: index + 1,
      action: text,
      dueAt: dueDate,
    };
  });
}

function buildPlantDiseaseSuggestions(selectedSymptomIds) {
  const selected = [...new Set(selectedSymptomIds)];

  if (selected.length === 0) {
    return [];
  }

  return PLANT_DISEASE_CATALOG.map((disease) => {
    const matches = disease.symptoms.filter((symptomId) =>
      selected.includes(symptomId)
    );
    const precision = matches.length / disease.symptoms.length;
    const coverage = matches.length / selected.length;
    const score = precision * 0.7 + coverage * 0.3;
    const confidencePercent = Math.round(score * 100);

    return {
      ...disease,
      matches,
      score,
      confidencePercent,
    };
  })
    .filter((item) => item.matches.length >= 2)
    .sort((a, b) => {
      const byScore = b.score - a.score;

      if (byScore !== 0) {
        return byScore;
      }

      return (
        DISEASE_SEVERITY_PRIORITY[b.severity] -
        DISEASE_SEVERITY_PRIORITY[a.severity]
      );
    })
    .slice(0, 4);
}

function buildPlantDiseaseTreatmentSchedule(disease) {
  const now = new Date();
  const dayOffsets = [0, 2, 5, 10];
  const steps = disease.treatment.slice(0, 4);

  return steps.map((text, index) => {
    const dueDate = new Date(now);
    dueDate.setDate(
      dueDate.getDate() +
        (dayOffsets[index] ?? dayOffsets[dayOffsets.length - 1])
    );

    return {
      id: `${disease.id}-step-${index + 1}`,
      step: index + 1,
      action: text,
      dueAt: dueDate,
    };
  });
}

function buildAlgaeSuggestions(selectedSymptomIds) {
  const selected = [...new Set(selectedSymptomIds)];

  if (selected.length === 0) {
    return [];
  }

  return ALGAE_CATALOG.map((algae) => {
    const matches = algae.symptoms.filter((symptomId) =>
      selected.includes(symptomId)
    );
    const precision = matches.length / algae.symptoms.length;
    const coverage = matches.length / selected.length;
    const score = precision * 0.7 + coverage * 0.3;
    const confidencePercent = Math.round(score * 100);

    return {
      ...algae,
      matches,
      score,
      confidencePercent,
    };
  })
    .filter((item) => item.matches.length >= 2)
    .sort((a, b) => {
      const byScore = b.score - a.score;

      if (byScore !== 0) {
        return byScore;
      }

      return (
        DISEASE_SEVERITY_PRIORITY[b.severity] -
        DISEASE_SEVERITY_PRIORITY[a.severity]
      );
    })
    .slice(0, 4);
}

function buildAlgaeTreatmentSchedule(algae) {
  const now = new Date();
  const immediate = algae.removeActions.slice(0, 3);
  const prevention = algae.preventionActions.slice(0, 3);
  const actions = [...immediate, ...prevention];
  const dayOffsets = [0, 1, 3, 5, 7, 14];

  return actions.map((text, index) => {
    const dueDate = new Date(now);
    dueDate.setDate(
      dueDate.getDate() +
        (dayOffsets[index] ?? dayOffsets[dayOffsets.length - 1])
    );

    return {
      id: `${algae.id}-step-${index + 1}`,
      step: index + 1,
      action: text,
      dueAt: dueDate,
    };
  });
}

function getMeasurementNumericValue(measurement, key) {
  if (!measurement || !key) {
    return null;
  }

  if (key === 'co2') {
    const directCo2 = Number(measurement.co2);
    if (Number.isFinite(directCo2)) {
      return directCo2;
    }
    return calculateCo2FromKhPhLogic(measurement.kh, measurement.ph);
  }

  const value = Number(measurement[key]);
  return Number.isFinite(value) ? value : null;
}

function getRecentNumericSeries(measurements, key, limit = 5) {
  return measurements
    .slice(0, limit)
    .map((item) => getMeasurementNumericValue(item, key))
    .filter((value) => value !== null);
}

function formatLatestTrendValue(value, suffix = '') {
  if (!Number.isFinite(Number(value))) {
    return '-';
  }

  const rounded = Math.round(Number(value) * 100) / 100;
  return suffix ? `${rounded} ${suffix}` : `${rounded}`;
}

function BottomSheetModal({
  visible,
  onClose,
  title,
  children,
  themeCardBg,
  themeCardBgAlt = themeCardBg,
  themeBorder,
  themeTextPrimary,
  themeOverlay = 'rgba(0, 0, 0, 0.48)',
  themeDragHandle = '#4b5563',
  isLightTheme,
  keyboardVerticalOffset = 0,
  maxWidth = 760,
  heightPercent = 86,
}) {
  const translateY = useRef(new Animated.Value(40)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      return;
    }

    translateY.setValue(40);
    backdropOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        speed: 18,
        bounciness: 4,
      }),
    ]).start();
  }, [backdropOpacity, translateY, visible]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > 8 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dy > 0) {
            translateY.setValue(Math.min(gestureState.dy, 220));
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 90 || gestureState.vy > 0.9) {
            handleClose();
            translateY.setValue(0);
            return;
          }

          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            speed: 20,
            bounciness: 5,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            speed: 20,
            bounciness: 5,
          }).start();
        },
      }),
    [handleClose, translateY]
  );

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}>
      <SafeAreaView
        edges={['top', 'bottom', 'left', 'right']}
        style={{ flex: 1 }}>
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: themeOverlay,
            opacity: backdropOpacity,
          }}
        />
        <Pressable
          onPress={handleClose}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          }}
        />

        <KeyboardAvoidingView
          style={{
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: 12,
            paddingTop: 24,
            paddingBottom: 12,
          }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={keyboardVerticalOffset}>
          <Animated.View
            style={{
              width: '100%',
              maxWidth,
              height: `${heightPercent}%`,
              alignSelf: 'center',
              transform: [{ translateY }],
            }}>
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: themeBorder,
                borderRadius: 22,
                backgroundColor: themeCardBg,
                overflow: 'hidden',
                shadowColor: '#000',
                shadowOpacity: isLightTheme ? 0.16 : 0.36,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 10 },
                elevation: 12,
              }}>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingTop: 8,
                  paddingBottom: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: themeBorder,
                  backgroundColor: themeCardBg,
                }}>
                <View
                  {...panResponder.panHandlers}
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingBottom: 8,
                  }}>
                  <View
                    style={{
                      width: 44,
                      height: 5,
                      borderRadius: 999,
                      backgroundColor: themeDragHandle,
                    }}
                  />
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                  <Text
                    style={{
                      color: themeTextPrimary,
                      fontSize: 18,
                      fontWeight: '700',
                      paddingRight: 12,
                      flex: 1,
                    }}>
                    {title}
                  </Text>
                  <Pressable
                    onPress={handleClose}
                    hitSlop={10}
                    style={{
                      width: 36,
                      height: 36,
                      borderWidth: 1,
                      borderColor: themeBorder,
                      borderRadius: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: themeCardBgAlt,
                    }}>
                    <Text
                      style={{
                        color: themeTextPrimary,
                        fontSize: 18,
                        fontWeight: '700',
                      }}>
                      X
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ flex: 1 }}>{children}</View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function getHistoryChartValueStatus(parameterKey, rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 'neutral';
  }

  const severity = getMeasurementSeverityFromValue(parameterKey, value);
  return severity === 'ok' ? 'ok' : severity;
}

function getHistoryChartStatusRank(status) {
  if (status === 'critical') return 3;
  if (status === 'warning') return 2;
  if (status === 'ok') return 1;
  return 0;
}

function getHistoryChartColorByStatus(status) {
  if (status === 'critical') return '#ff7b7b';
  if (status === 'warning') return '#ffd166';
  if (status === 'ok') return '#6fd98d';
  return '#8dc7ff';
}

function buildTankOnboardingPlan(tank, measurements, enabledTests = {}) {
  if (!tank) {
    return {
      isActive: false,
      mode: 'existing_running',
      rows: [],
      dueItems: [],
      todayItems: [],
      statusText: '',
      dayNumber: 0,
      targetEndDay: 0,
    };
  }

  const mode = normalizeOnboardingMode(tank.onboardingMode);
  if (mode !== 'fresh_start') {
    return {
      isActive: false,
      mode,
      rows: [],
      dueItems: [],
      todayItems: [],
      statusText: '',
      dayNumber: 0,
      targetEndDay: 0,
    };
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const startMs = getCreatedAtMs(tank.onboardingStartAt ?? tank.createdAt);
  if (!startMs) {
    return {
      isActive: true,
      mode,
      rows: [],
      dueItems: [],
      todayItems: [],
      statusText: 'Brak daty startu cyklu. Zapisz pierwszy pomiar NO2 i NO3.',
      dayNumber: 1,
      targetEndDay: 21,
    };
  }

  const startDayMs = getDayBucketMs(startMs);
  const todayDayMs = getDayBucketMs(new Date());
  const dayNumber = Math.max(1, Math.floor((todayDayMs - startDayMs) / dayMs) + 1);

  const latestMeasurement = measurements[0] ?? null;
  const latestAnalysis = latestMeasurement
    ? analyzeMeasurementLogic(latestMeasurement, enabledTests)
    : null;

  const toNumeric = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const no2Series = getRecentNumericSeries(measurements, 'no2', 3);
  const no3Value = toNumeric(latestMeasurement?.no3);
  const nh3Value = toNumeric(latestMeasurement?.nh3nh4);
  const no2Value = toNumeric(latestMeasurement?.no2);

  const stableNo2 =
    no2Series.length >= 2 && no2Series[0] <= 0.01 && no2Series[1] <= 0.01;
  const visibleNo3 = no3Value !== null && no3Value >= 5;

  const hasCriticalDrift =
    (no2Value !== null && no2Value > 0.2) ||
    (nh3Value !== null && nh3Value > 0.2) ||
    latestAnalysis?.status === 'critical';
  const hasWarningDrift =
    (no2Value !== null && no2Value > 0) ||
    (nh3Value !== null && nh3Value > 0.05) ||
    latestAnalysis?.status === 'warning';

  const extensionDays = hasCriticalDrift ? 7 : hasWarningDrift ? 3 : 0;
  const targetEndDay = 21 + extensionDays;
  const isStabilized = dayNumber >= 21 && stableNo2 && visibleNo3 && !hasCriticalDrift;

  const buildDueAtMs = (startDay) => startDayMs + (Math.max(1, startDay) - 1) * dayMs;
  const rows = [];
  const dueItems = [];
  const todayItems = [];
  const addRow = ({
    id,
    dayStart,
    dayEnd = dayStart,
    level = 'task',
    text,
    addToDueList = true,
  }) => {
    const status =
      dayNumber < dayStart
        ? 'upcoming'
        : dayNumber > dayEnd
          ? 'overdue'
          : 'current';
    const dueAtMs = buildDueAtMs(dayStart);
    rows.push({
      id,
      dayStart,
      dayEnd,
      level,
      text,
      status,
      dueAtMs,
    });

    if (status === 'current') {
      todayItems.push(text);
    }

    if (addToDueList) {
      dueItems.push({
        id: `onboarding-${id}`,
        source: 'Onboarding',
        text,
        dueAtMs,
        dayBucketMs: getDayBucketMs(dueAtMs),
      });
    }
  };
  const addDailyRows = ({
    id,
    dayStart,
    dayEnd,
    level = 'task',
    text,
    textByDay,
    addToDueList = true,
  }) => {
    for (let day = dayStart; day <= dayEnd; day += 1) {
      const resolvedText =
        typeof textByDay === 'function' ? textByDay(day) : text;
      addRow({
        id: `${id}-day-${day}`,
        dayStart: day,
        dayEnd: day,
        level,
        text: resolvedText,
        addToDueList,
      });
    }
  };

  addRow({
    id: 'day1-setup',
    dayStart: 1,
    level: 'task',
    text:
      'Dzien 1: zalej akwarium, dodaj uzdatniacz do nowej wody, uruchom filtr i grzalke (24/7).',
  });
  addRow({
    id: 'day1-plants',
    dayStart: 1,
    level: 'task',
    text:
      'Dzien 1: od razu dodaj rosliny (najlepiej szybko rosnace), zeby od poczatku zuzywaly nadmiar skladnikow.',
  });
  addDailyRows({
    id: 'day1-10-bacteria',
    dayStart: 1,
    dayEnd: 10,
    level: 'task',
    textByDay: (day) =>
      `Dzien ${day}: dodaj dzienna dawke bakterii startowych zgodnie z etykieta produktu.`,
  });
  addRow({
    id: 'day1-plus-conditioner',
    dayStart: 1,
    level: 'info',
    text:
      'Uzdatniacz dodawaj przy kazdym dolaniu nowej wody (start i kazda podmiana), nie tylko pierwszego dnia.',
    addToDueList: false,
  });
  addRow({
    id: 'day1-7-bacteria-booster',
    dayStart: 1,
    dayEnd: 7,
    level: 'info',
    text:
      'Jesli uzywasz pozywki dla bakterii lub innych starterow, dawkuj je tylko wedlug etykiety.',
    addToDueList: false,
  });
  addRow({
    id: 'day2-3-pause',
    dayStart: 2,
    dayEnd: 3,
    level: 'info',
    text: 'Dni 2-3: nic nie rob, to normalne. Daj biologii czas na start.',
  });
  addRow({
    id: 'day4-7-first-tests',
    dayStart: 4,
    dayEnd: 7,
    level: 'task',
    text: `Dni 4-7: pierwszy pomiar NO2${enabledTests?.nh3nh4 ? ' + NH3/NH4' : ''}.`,
  });
  addRow({
    id: 'day7-14-spike',
    dayStart: 7,
    dayEnd: 14,
    level: 'warning',
    text:
      'Dni 7-14: mozliwy skok NO2. Bez podmian, chyba ze wartosci sa ekstremalne.',
  });
  addRow({
    id: 'day14-21-drop',
    dayStart: 14,
    dayEnd: 21,
    level: 'info',
    text: 'Dni 14-21: NO2 powinno spadac, a NO3 zaczyna byc widoczne.',
  });
  addRow({
    id: 'day18-21-water-change-before-fish',
    dayStart: 18,
    dayEnd: 21,
    level: 'task',
    text:
      'Dni 18-21: po stabilizacji NO2 wykonaj podmiane 30-40% i dodaj uzdatniacz do nowej wody.',
  });
  addRow({
    id: 'day21-first-fish-rule',
    dayStart: 21,
    level: 'task',
    text:
      'Pierwsze ryby dodaj po min. 21 dniach i dopiero gdy NO2 jest 0 w co najmniej 2 pomiarach pod rzad.',
  });
  addRow({
    id: 'day21-first-fish-portion',
    dayStart: 21,
    dayEnd: 28,
    level: 'info',
    text:
      'Startuj od malej partii ryb (ok. 20-30% docelowej obsady), potem obserwuj zbiornik przez 7 dni.',
  });
  addRow({
    id: 'day28-next-fish-portion',
    dayStart: 28,
    level: 'task',
    text:
      'Jesli parametry sa stabilne po 7 dniach, dodaj kolejna mala partie ryb zamiast calej obsady naraz.',
  });

  if (!enabledTests?.no2) {
    addRow({
      id: 'no2-required',
      dayStart: dayNumber,
      level: 'warning',
      text: 'Wlacz test NO2 w ustawieniach - bez niego nie zweryfikujesz dojrzewania cyklu.',
      addToDueList: false,
    });
  }
  if (!enabledTests?.no3) {
    addRow({
      id: 'no3-required',
      dayStart: dayNumber,
      level: 'warning',
      text: 'Wlacz test NO3 w ustawieniach - to kluczowy sygnal, ze cykl dojrzewa.',
      addToDueList: false,
    });
  }

  if (hasCriticalDrift) {
    addRow({
      id: 'critical-drift',
      dayStart: dayNumber,
      level: 'warning',
      text:
        'Parametry mocno odchylone - cykl wydluzony. Skup sie na korektach i pomiarach codziennych.',
      addToDueList: false,
    });
  } else if (hasWarningDrift) {
    addRow({
      id: 'warning-drift',
      dayStart: dayNumber,
      level: 'info',
      text:
        'Widoczne odchylenia parametrow - cykl moze sie wydluzyc o kilka dni.',
      addToDueList: false,
    });
  }

  (latestAnalysis?.recommendations ?? []).slice(0, 3).forEach((item, index) => {
    const dueAtMs = getRecommendationDueAtMsLogic(item);
    const actionableText = `${item.parameter}: ${item.action}`;
    rows.push({
      id: `dynamic-${index}`,
      dayStart: dayNumber,
      dayEnd: dayNumber,
      level: item.severity === 'critical' ? 'warning' : 'info',
      text: `Korekta parametru: ${actionableText}`,
      status: 'current',
      dueAtMs,
    });
    dueItems.push({
      id: `onboarding-dynamic-${index}`,
      source: 'Onboarding',
      text: actionableText,
      dueAtMs,
      dayBucketMs: getDayBucketMs(dueAtMs),
    });
    todayItems.push(actionableText);
  });

  if (isStabilized) {
    addRow({
      id: 'stable',
      dayStart: Math.max(14, dayNumber),
      level: 'task',
      text:
        'Cykl stabilny: mozesz dodac pierwsza mala partie ryb i obserwowac zbiornik przez kolejne 7 dni.',
      addToDueList: false,
    });
  } else if (dayNumber > targetEndDay) {
    addRow({
      id: 'extended',
      dayStart: dayNumber,
      level: 'warning',
      text: `Cykl wydluzony ponad 21 dni (aktualny cel: do dnia ${targetEndDay}). Kontynuuj pomiary i korekty.`,
      addToDueList: false,
    });
  }

  const statusText = isStabilized
    ? 'Akwarium wyglada na ustabilizowane. Mozesz dodac pierwsze ryby.'
    : dayNumber <= 21
      ? `Trwa dojrzewanie akwarium (dzien ${dayNumber}/${targetEndDay}).`
      : `Trwa dojrzewanie akwarium (dzien ${dayNumber}/${targetEndDay}, cykl wydluzony).`;

  return {
    isActive: true,
    mode,
    rows,
    dueItems,
    todayItems: [...new Set(todayItems)],
    statusText,
    dayNumber,
    targetEndDay,
    isStabilized,
  };
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const {
    tanks,
    setTanks,
    selectedTank,
    setSelectedTank,
    activeSection,
    setActiveSection,
    sectionEntrySource,
    appSettings,
    subscription,
    subscriptionPlan,
    subscriptionEntitlements,
    subscriptionActive,
    canAccessMeasurementKey,
    getSubscriptionLimit,
    updateAppSettings,
    setSubscriptionTier,
    applyAdminSubscriptionTier,
    canManageSubscriptionManually,
    getStoreProductIdForTier,
  } = useTank();
  const t = createTranslator(appSettings.language);
  const catalogSortLocale = getSupportedCatalogLocale(appSettings.language);
  const catalogLanguageRef = useRef(appSettings.language);
  const subscriptionPlans = useMemo(() => listSubscriptionPlans(), []);
  const subscriptionCapabilityRows = useMemo(
    () => listSubscriptionCapabilityRows(),
    []
  );

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [, setInitialDataReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authNickname, setAuthNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAccountDeletedScreenVisible, setIsAccountDeletedScreenVisible] =
    useState(false);
  const [isForgotPasswordModalVisible, setIsForgotPasswordModalVisible] =
    useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const googleAndroidClientId = getOptionalEnvValue(
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
  );
  const googleAndroidDebugClientId = getOptionalEnvValue(
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_DEBUG_CLIENT_ID
  );
  const googleAndroidReleaseClientId = getOptionalEnvValue(
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_RELEASE_CLIENT_ID
  );
  const googleIosClientId = getOptionalEnvValue(
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
  );
  const googleWebClientId = getOptionalEnvValue(
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  );
  const googleClientIdForCurrentPlatform = Platform.select({
    ios: googleIosClientId,
    android:
      (__DEV__ ? googleAndroidDebugClientId : googleAndroidReleaseClientId) ??
      googleAndroidClientId,
    default: googleWebClientId,
  });
  const isGoogleAuthConfiguredForPlatform = Boolean(
    googleClientIdForCurrentPlatform
  );
  const [googleAuthRequest, , promptGoogleAuthAsync] =
    Google.useIdTokenAuthRequest({
      androidClientId:
        googleClientIdForCurrentPlatform ??
        'missing-google-android-client-id.apps.googleusercontent.com',
      iosClientId:
        googleIosClientId ??
        'missing-google-ios-client-id.apps.googleusercontent.com',
      webClientId:
        googleWebClientId ??
        'missing-google-web-client-id.apps.googleusercontent.com',
      scopes: ['openid', 'profile', 'email'],
      selectAccount: true,
    });

  const [ph, setPh] = useState('');
  const [gh, setGh] = useState('');
  const [kh, setKh] = useState('');
  const [ca, setCa] = useState('');
  const [mg, setMg] = useState('');
  const [no2, setNo2] = useState('');
  const [no3, setNo3] = useState('');
  const [nh3nh4, setNh3Nh4] = useState('');
  const [po4, setPo4] = useState('');
  const [fe, setFe] = useState('');
  const [temperature, setTemperature] = useState('');
  const [measurementNote, setMeasurementNote] = useState('');
  const [stockType, setStockType] = useState('fish');
  const [fishCatalog, setFishCatalog] = useState([]);
  const [fishCatalogLoading, setFishCatalogLoading] = useState(false);
  const [plantCatalog, setPlantCatalog] = useState([]);
  const [plantCatalogLoading, setPlantCatalogLoading] = useState(false);
  const [stockFishSearch, setStockFishSearch] = useState('');
  const [stockPlantSearch, setStockPlantSearch] = useState('');
  const [fishQuantity, setFishQuantity] = useState('1');
  const [fishQuantityDrafts, setFishQuantityDrafts] = useState({});
  const [selectedCatalogFishId, setSelectedCatalogFishId] = useState(null);
  const [selectedCatalogPlantId, setSelectedCatalogPlantId] = useState(null);
  const [stockBusy, setStockBusy] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockItems, setStockItems] = useState([]);
  const [isEditingFish, setIsEditingFish] = useState(false);
  const [isEditingPlant, setIsEditingPlant] = useState(false);
  const [isPlantFertilizationExpanded, setIsPlantFertilizationExpanded] = useState(true);
  const [isPlantStockExpanded, setIsPlantStockExpanded] = useState(true);
  const [isPlantFertilizationAddFormVisible, setIsPlantFertilizationAddFormVisible] =
    useState(false);
  const [editingFishItemId, setEditingFishItemId] = useState(null);
  const [editingPlantItemId, setEditingPlantItemId] = useState(null);
  const [plantFertilizerName, setPlantFertilizerName] = useState('');
  const [plantFertilizerQuantityInput, setPlantFertilizerQuantityInput] = useState('1');
  const [plantFertilizerNote, setPlantFertilizerNote] = useState('');
  const [rootTabsDurationDaysInput, setRootTabsDurationDaysInput] = useState(
    String(ROOT_TABS_DEFAULT_DURATION_DAYS)
  );
  const [editingPlantFertilizationEntryId, setEditingPlantFertilizationEntryId] = useState(null);
  const [editingPlantFertilizerName, setEditingPlantFertilizerName] = useState('');
  const [editingPlantFertilizerQuantityInput, setEditingPlantFertilizerQuantityInput] =
    useState('1');
  const [editingRootTabsDurationDaysInput, setEditingRootTabsDurationDaysInput] = useState(
    String(ROOT_TABS_DEFAULT_DURATION_DAYS)
  );
  const [editingPlantFertilizerNote, setEditingPlantFertilizerNote] = useState('');
  const [plantFertilizationBusy, setPlantFertilizationBusy] = useState(false);
  const [tankName, setTankName] = useState('');
  const [tankLiters, setTankLiters] = useState('');
  const [tankAquariumType, setTankAquariumType] = useState('');
  const [tankSubstrateType, setTankSubstrateType] = useState('');
  const [tankLightIntensity, setTankLightIntensity] = useState('');
  const [tankLightHours, setTankLightHours] = useState('');
  const [tankOnboardingMode, setTankOnboardingMode] = useState('existing_running');
  const [addTankBusy, setAddTankBusy] = useState(false);
  const [isAddingTankModalVisible, setIsAddingTankModalVisible] = useState(false);
  const [editingTankId, setEditingTankId] = useState(null);
  const [isEquipmentCatalogModalVisible, setIsEquipmentCatalogModalVisible] =
    useState(false);
  const [equipmentCatalogType, setEquipmentCatalogType] = useState('');
  const [equipmentCatalogSearch, setEquipmentCatalogSearch] = useState('');
  const [equipmentSavingBusy, setEquipmentSavingBusy] = useState(false);
  const [, setTanksLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [measurementDeleteBusy, setMeasurementDeleteBusy] = useState(false);
  const [measurements, setMeasurements] = useState([]);
  const [homeMeasurements, setHomeMeasurements] = useState([]);
  const [homeStockItems, setHomeStockItems] = useState([]);
  const [homeActiveIssueCases, setHomeActiveIssueCases] = useState([]);
  const [homeLoading, setHomeLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryChartParameter, setSelectedHistoryChartParameter] =
    useState('no3');
  const [historySectionTab, setHistorySectionTab] = useState('parameters');
  const [historyChartWidth, setHistoryChartWidth] = useState(0);
  const [isAddMeasurementModalVisible, setIsAddMeasurementModalVisible] =
    useState(false);
  const [selectedHomeScoreSummary, setSelectedHomeScoreSummary] = useState(null);
  const [selectedMeasurementTileDetails, setSelectedMeasurementTileDetails] =
    useState(null);
  const [isCurrentParametersExpanded, setIsCurrentParametersExpanded] =
    useState(true);
  const [isTankDiseasesExpanded, setIsTankDiseasesExpanded] =
    useState(true);
  const [isTankPlantDiseasesExpanded, setIsTankPlantDiseasesExpanded] =
    useState(true);
  const [isTankAlgaeExpanded, setIsTankAlgaeExpanded] =
    useState(true);
  const [expandedDiseaseCaseId, setExpandedDiseaseCaseId] =
    useState(null);
  const [expandedPlantDiseaseCaseId, setExpandedPlantDiseaseCaseId] =
    useState(null);
  const [expandedAlgaeCaseId, setExpandedAlgaeCaseId] =
    useState(null);
  const [isWaterTestingExpanded, setIsWaterTestingExpanded] =
    useState(false);
  const [onboardingTaskBusy, setOnboardingTaskBusy] = useState(false);
  const [isCompletedOnboardingVisible, setIsCompletedOnboardingVisible] =
    useState(false);
  const [isSuggestionsExpanded, setIsSuggestionsExpanded] = useState(true);
  const [isGuidedPlanExpanded, setIsGuidedPlanExpanded] = useState(true);
  const [expandedGuidedStepIds, setExpandedGuidedStepIds] = useState({});
  const [expandedHistoryIssueId, setExpandedHistoryIssueId] = useState(null);
  const [historyIssueDeleteBusyId, setHistoryIssueDeleteBusyId] = useState(null);
  const [isSettingsTestsExpanded, setIsSettingsTestsExpanded] = useState(false);
  const [isSubscriptionExpanded, setIsSubscriptionExpanded] = useState(false);
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);
  const [isDeleteAccountReauthModalVisible, setIsDeleteAccountReauthModalVisible] =
    useState(false);
  const [deleteAccountReauthPassword, setDeleteAccountReauthPassword] = useState('');
  const [deleteAccountReauthBusy, setDeleteAccountReauthBusy] = useState(false);
  const [selectedMeasurementId, setSelectedMeasurementId] =
    useState(null);
  const [editingMeasurementId, setEditingMeasurementId] = useState(null);
  const [diseaseMode, setDiseaseMode] = useState('catalog');
  const [selectedDiseaseSymptoms, setSelectedDiseaseSymptoms] = useState({});
  const [isDiseaseSymptomsDropdownOpen, setIsDiseaseSymptomsDropdownOpen] =
    useState(false);
  const [diseaseSafetyConfirmed, setDiseaseSafetyConfirmed] = useState(false);
  const [expandedDiseaseCatalogId, setExpandedDiseaseCatalogId] = useState(null);
  const [isDiseaseImageModalVisible, setIsDiseaseImageModalVisible] = useState(false);
  const [diseaseImageModalUri, setDiseaseImageModalUri] = useState('');
  const [diseaseImageModalFallbackUri, setDiseaseImageModalFallbackUri] = useState('');
  const [diseaseImageModalLoadStage, setDiseaseImageModalLoadStage] = useState(0);
  const [diseaseImageModalTitle, setDiseaseImageModalTitle] = useState('');
  const [diseaseImageZoomLevel, setDiseaseImageZoomLevel] = useState(1);
  const [diseasePreviewLoadStageById, setDiseasePreviewLoadStageById] = useState({});
  const [fishImageUriByKey, setFishImageUriByKey] = useState({});
  const [plantImageUriByKey, setPlantImageUriByKey] = useState({});
  const [plantDiseaseMode, setPlantDiseaseMode] = useState('catalog');
  const [selectedPlantDiseaseSymptoms, setSelectedPlantDiseaseSymptoms] = useState({});
  const [isPlantDiseaseSymptomsDropdownOpen, setIsPlantDiseaseSymptomsDropdownOpen] =
    useState(false);
  const [plantDiseaseSafetyConfirmed, setPlantDiseaseSafetyConfirmed] = useState(false);
  const [expandedPlantDiseaseCatalogId, setExpandedPlantDiseaseCatalogId] = useState(null);
  const [algaeMode, setAlgaeMode] = useState('catalog');
  const [selectedAlgaeSymptoms, setSelectedAlgaeSymptoms] = useState({});
  const [isAlgaeSymptomsDropdownOpen, setIsAlgaeSymptomsDropdownOpen] =
    useState(false);
  const [algaeSafetyConfirmed, setAlgaeSafetyConfirmed] = useState(false);
  const [expandedAlgaeCatalogId, setExpandedAlgaeCatalogId] = useState(null);
  const [isIssueTankPickerVisible, setIsIssueTankPickerVisible] = useState(false);
  const [issueTankPickerPayload, setIssueTankPickerPayload] = useState(null);
  const [tankDiseaseCases, setTankDiseaseCases] = useState([]);
  const [tankDiseaseHistoryCases, setTankDiseaseHistoryCases] = useState([]);
  const [diseaseCaseBusy, setDiseaseCaseBusy] = useState(false);

  const skipNextUnverifiedAlertRef = useRef(false);
  const lastUnverifiedAlertAtMsRef = useRef(0);
  const deleteAccountConfirmedRef = useRef(null);
  const fishImageLookupInFlightRef = useRef(new Set());
  const fishImageLookupAttemptedRef = useRef(new Set());
  const plantImageLookupInFlightRef = useRef(new Set());
  const plantImageLookupAttemptedRef = useRef(new Set());

  const showUnverifiedEmailAlert = useCallback((message) => {
    const now = Date.now();
    if (now - lastUnverifiedAlertAtMsRef.current < 2500) {
      return;
    }
    lastUnverifiedAlertAtMsRef.current = now;
    alert(message);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      const hasPasswordProvider = (nextUser?.providerData ?? []).some(
        (provider) => provider?.providerId === 'password'
      );

      let resolvedUser = nextUser;
      if (nextUser && hasPasswordProvider && !nextUser.emailVerified) {
        try {
          await nextUser.reload();
          resolvedUser = auth.currentUser ?? nextUser;
        } catch (reloadError) {
          console.warn(
            'Blad odswiezenia statusu emailVerified:',
            reloadError instanceof Error ? reloadError.message : String(reloadError)
          );
        }
      }

      if (resolvedUser && hasPasswordProvider && !resolvedUser.emailVerified) {
        const shouldShowAlert = !skipNextUnverifiedAlertRef.current;
        skipNextUnverifiedAlertRef.current = false;

        signOut(auth).catch((error) => {
          console.warn(
            'Blad wylogowania nieweryfikowanego konta:',
            error instanceof Error ? error.message : String(error)
          );
        });
        setUser(null);
        setLoading(false);
        setInitialDataReady(true);
        if (shouldShowAlert) {
          showUnverifiedEmailAlert(
            'Najpierw zweryfikuj email. Sprawdz skrzynke i kliknij link aktywacyjny.'
          );
        }
        return;
      }

      setInitialDataReady(false);
      setUser(resolvedUser);
      setLoading(false);

      if (!resolvedUser) {
        setTanks([]);
        setSelectedTank(null);
        setActiveSection('home');
        setFishCatalog([]);
        setPlantCatalog([]);
        setSelectedCatalogFishId(null);
        setSelectedCatalogPlantId(null);
        setStockItems([]);
        setIsEditingFish(false);
        setIsEditingPlant(false);
        setIsPlantFertilizationExpanded(true);
        setIsPlantStockExpanded(true);
        setIsPlantFertilizationAddFormVisible(false);
        setEditingFishItemId(null);
        setEditingPlantItemId(null);
        setEditingPlantFertilizationEntryId(null);
        setPlantFertilizerName('');
        setPlantFertilizerQuantityInput('1');
        setPlantFertilizerNote('');
        setRootTabsDurationDaysInput(String(ROOT_TABS_DEFAULT_DURATION_DAYS));
        setEditingPlantFertilizerName('');
        setEditingPlantFertilizerQuantityInput('1');
        setEditingRootTabsDurationDaysInput(String(ROOT_TABS_DEFAULT_DURATION_DAYS));
        setEditingPlantFertilizerNote('');
        setPlantFertilizationBusy(false);
        setMeasurements([]);
        setHomeMeasurements([]);
        setHomeStockItems([]);
        setHomeActiveIssueCases([]);
        setHomeLoading(false);
        setIsAddMeasurementModalVisible(false);
        setSelectedHomeScoreSummary(null);
        setIsTankDiseasesExpanded(true);
        setIsTankPlantDiseasesExpanded(true);
        setIsTankAlgaeExpanded(true);
        setExpandedDiseaseCaseId(null);
        setExpandedPlantDiseaseCaseId(null);
        setExpandedAlgaeCaseId(null);
        setIsWaterTestingExpanded(false);
        setOnboardingTaskBusy(false);
        setIsCompletedOnboardingVisible(false);
        setIsAddingTankModalVisible(false);
        setEditingTankId(null);
        setIsEquipmentCatalogModalVisible(false);
        setEquipmentCatalogType('');
        setEquipmentCatalogSearch('');
        setEquipmentSavingBusy(false);
        setTankAquariumType('');
        setTankOnboardingMode('existing_running');
        setSelectedMeasurementId(null);
        setEditingMeasurementId(null);
        setDiseaseMode('catalog');
        setSelectedDiseaseSymptoms({});
        setIsDiseaseSymptomsDropdownOpen(false);
        setDiseaseSafetyConfirmed(false);
        setIsDiseaseImageModalVisible(false);
        setDiseaseImageModalUri('');
        setDiseaseImageModalFallbackUri('');
        setDiseaseImageModalLoadStage(0);
        setDiseaseImageModalTitle('');
        setDiseaseImageZoomLevel(1);
        setDiseasePreviewLoadStageById({});
        setFishImageUriByKey({});
        fishImageLookupInFlightRef.current = new Set();
        fishImageLookupAttemptedRef.current = new Set();
        setPlantImageUriByKey({});
        plantImageLookupInFlightRef.current = new Set();
        plantImageLookupAttemptedRef.current = new Set();
        setPlantDiseaseMode('catalog');
        setSelectedPlantDiseaseSymptoms({});
        setIsPlantDiseaseSymptomsDropdownOpen(false);
        setPlantDiseaseSafetyConfirmed(false);
        setExpandedPlantDiseaseCatalogId(null);
        setAlgaeMode('catalog');
        setSelectedAlgaeSymptoms({});
        setIsAlgaeSymptomsDropdownOpen(false);
        setAlgaeSafetyConfirmed(false);
        setExpandedAlgaeCatalogId(null);
        setIsIssueTankPickerVisible(false);
        setIssueTankPickerPayload(null);
        setTankDiseaseCases([]);
        setTankDiseaseHistoryCases([]);
        setDeleteAccountBusy(false);
        setIsDeleteAccountReauthModalVisible(false);
        setDeleteAccountReauthPassword('');
        setDeleteAccountReauthBusy(false);
        setInitialDataReady(true);
      }
    });

    return () => unsubscribe();
  }, [setActiveSection, setSelectedTank, setTanks, showUnverifiedEmailAlert]);

  useEffect(() => {
    auth.languageCode = appSettings.language || 'pl';
  }, [appSettings.language]);

  const fetchTanks = useCallback(
    async (userId, preferredTankId = null) => {
      setTanksLoading(true);

      try {
        const tanksQuery = query(
          collection(db, 'tanks'),
          where('userId', '==', userId)
        );

        const snapshot = await getDocs(tanksQuery);
        const data = snapshot.docs
          .map((item) => {
            const payload = item.data();
            return {
              id: item.id,
              ...payload,
              onboardingMode: normalizeOnboardingMode(payload.onboardingMode),
            };
          })
          .sort(
            (a, b) =>
              getCreatedAtMs(b.createdAt) -
              getCreatedAtMs(a.createdAt)
          );

        setTanks(data);

        const storageKey = getSelectedTankStorageKey(userId);

        if (data.length === 0) {
          setSelectedTank(null);
          setStockItems([]);
          setMeasurements([]);
          setIsAddMeasurementModalVisible(false);
          setIsWaterTestingExpanded(false);
          setEditingTankId(null);
          setSelectedMeasurementId(null);
          setEditingMeasurementId(null);
          await AsyncStorage.removeItem(storageKey);
          return;
        }

        const storedTankId =
          preferredTankId ?? (await AsyncStorage.getItem(storageKey));
        const nextSelectedTank =
          data.find((item) => item.id === storedTankId) ?? data[0];

        setSelectedTank(nextSelectedTank);
        await AsyncStorage.setItem(storageKey, nextSelectedTank.id);
      } catch (error) {
        alert(
          'Blad pobierania akwariow: ' +
            (error instanceof Error ? error.message : '')
        );
      } finally {
        setTanksLoading(false);
      }
    },
    [setSelectedTank, setTanks]
  );

  const fetchMeasurements = useCallback(async (userId, tankId) => {
    if (!tankId) {
      setMeasurements([]);
      return;
    }

    setHistoryLoading(true);

    try {
      const measurementsQuery = query(
        collection(db, 'measurements'),
        where('userId', '==', userId)
      );

      const snapshot = await getDocs(measurementsQuery);
      const data = snapshot.docs
        .map((item) => {
          const payload = item.data();

          return {
            id: item.id,
            ...payload,
            quantity:
              payload.type === 'fish'
                ? Math.max(1, Number(payload.quantity) || 1)
                : payload.quantity,
          };
        })
        .filter((item) => item.tankId === tankId)
        .sort(
          (a, b) =>
            getCreatedAtMs(b.createdAt) -
            getCreatedAtMs(a.createdAt)
        );

      setMeasurements(data);
    } catch (error) {
      alert(
        'Blad pobierania historii: ' +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const fetchStockItems = useCallback(async (userId, tankId) => {
    if (!tankId) {
      setStockItems([]);
      return;
    }

    setStockLoading(true);

    try {
      const stockQuery = query(
        collection(db, 'stockItems'),
        where('userId', '==', userId)
      );

      const snapshot = await getDocs(stockQuery);
      const allStockItems = snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }))
        .filter((item) => item.tankId === tankId);
      const disallowedStockItemIds = allStockItems
        .filter(
          (item) =>
            (item.type === 'fish' &&
              !isAllowedFishCatalogLatinName(item.latinName)) ||
            (item.type === 'plant' &&
              !isAllowedPlantCatalogLatinName(item.latinName))
        )
        .map((item) => item.id);

      if (disallowedStockItemIds.length > 0) {
        await Promise.all(
          disallowedStockItemIds.map((itemId) =>
            deleteDoc(doc(db, 'stockItems', itemId))
          )
        );
      }

      const data = allStockItems
        .filter(
          (item) =>
            (item.type !== 'fish' || isAllowedFishCatalogLatinName(item.latinName)) &&
            (item.type !== 'plant' || isAllowedPlantCatalogLatinName(item.latinName))
        )
        .sort(
          (a, b) =>
            getCreatedAtMs(b.createdAt) -
            getCreatedAtMs(a.createdAt)
        );

      setStockItems(
        localizeStockItemsForLanguage(data, catalogLanguageRef.current)
      );
    } catch (error) {
      alert(
        'Blad pobierania obsady: ' +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setStockLoading(false);
    }
  }, []);

  const fetchHomeData = useCallback(async (userId) => {
    if (!userId) {
      setHomeMeasurements([]);
      setHomeStockItems([]);
      setHomeActiveIssueCases([]);
      return;
    }

    setHomeLoading(true);

    try {
      const [measurementsSnapshot, stockItemsSnapshot, issuesSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'measurements'), where('userId', '==', userId))),
        getDocs(query(collection(db, 'stockItems'), where('userId', '==', userId))),
        getDocs(query(collection(db, 'tankDiseaseCases'), where('userId', '==', userId))),
      ]);

      const allMeasurements = measurementsSnapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }))
        .sort((a, b) => getCreatedAtMs(b.createdAt) - getCreatedAtMs(a.createdAt));

      const allStockItemsRaw = stockItemsSnapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }));
      const disallowedStockItemIds = allStockItemsRaw
        .filter(
          (item) =>
            (item.type === 'fish' &&
              !isAllowedFishCatalogLatinName(item.latinName)) ||
            (item.type === 'plant' &&
              !isAllowedPlantCatalogLatinName(item.latinName))
        )
        .map((item) => item.id);

      if (disallowedStockItemIds.length > 0) {
        await Promise.all(
          disallowedStockItemIds.map((itemId) =>
            deleteDoc(doc(db, 'stockItems', itemId))
          )
        );
      }

      const allStockItems = allStockItemsRaw
        .filter(
          (item) =>
            (item.type !== 'fish' || isAllowedFishCatalogLatinName(item.latinName)) &&
            (item.type !== 'plant' || isAllowedPlantCatalogLatinName(item.latinName))
        )
        .sort((a, b) => getCreatedAtMs(b.createdAt) - getCreatedAtMs(a.createdAt));

      const activeIssues = issuesSnapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }))
        .filter((item) => String(item.status ?? 'active').toLowerCase() === 'active')
        .sort((a, b) => getCreatedAtMs(b.createdAt) - getCreatedAtMs(a.createdAt));

      setHomeMeasurements(allMeasurements);
      setHomeStockItems(
        localizeStockItemsForLanguage(allStockItems, catalogLanguageRef.current)
      );
      setHomeActiveIssueCases(activeIssues);
    } catch (error) {
      alert(
        'Blad pobierania danych ekranu glownego: ' +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setHomeLoading(false);
    }
  }, []);

  const fetchTankDiseaseCases = useCallback(async (userId, tankId) => {
    if (!tankId) {
      setTankDiseaseCases([]);
      setTankDiseaseHistoryCases([]);
      return;
    }

    try {
      const diseaseCasesQuery = query(
        collection(db, 'tankDiseaseCases'),
        where('userId', '==', userId)
      );
      const snapshot = await getDocs(diseaseCasesQuery);
      const allCases = snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }))
        .filter((item) => item.tankId === tankId)
        .sort((a, b) => getCreatedAtMs(b.createdAt) - getCreatedAtMs(a.createdAt));
      const activeCases = allCases.filter(
        (item) => String(item.status ?? 'active').toLowerCase() === 'active'
      );

      setTankDiseaseCases(activeCases);
      setTankDiseaseHistoryCases(allCases);
    } catch (error) {
      alert(
        'Blad pobierania chorob akwarium: ' +
          (error instanceof Error ? error.message : '')
      );
    }
  }, []);

  const fetchFishCatalog = useCallback(async () => {
    setFishCatalogLoading(true);

    try {
      const catalogCollection = collection(db, 'fishCatalog');
      const snapshot = await getDocs(catalogCollection);
      const existingRaw = snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }));

      const {
        uniqueEntries: existing,
        duplicateIds: duplicateCatalogDocIds,
      } = dedupeFishCatalogEntriesByLatin(existingRaw);

      if (duplicateCatalogDocIds.length > 0) {
        await Promise.all(
          duplicateCatalogDocIds.map((itemId) =>
            deleteDoc(doc(db, 'fishCatalog', itemId))
          )
        );
      }

      const disallowedCatalogEntryIds = existing
        .filter((item) => !isAllowedFishCatalogLatinName(item.latinName))
        .map((item) => item.id);

      if (disallowedCatalogEntryIds.length > 0) {
        await Promise.all(
          disallowedCatalogEntryIds.map((itemId) =>
            deleteDoc(doc(db, 'fishCatalog', itemId))
          )
        );
      }

      const allowedExisting = existing.filter((item) =>
        isAllowedFishCatalogLatinName(item.latinName)
      );

      const existingLatinNames = new Set(
        allowedExisting.map((item) => normalizeLatinCatalogKey(item.latinName))
      );
      const missingSeedFish = FISH_CATALOG_SEED.filter(
        (fish) => !existingLatinNames.has(normalizeLatinCatalogKey(fish.latinName))
      );
      const existingByLatinName = new Map(
        allowedExisting.map((item) => [normalizeLatinCatalogKey(item.latinName), item])
      );

      const existingSeedUpdates = FISH_CATALOG_SEED.map((fish) => {
        const normalizedLatin = normalizeLatinCatalogKey(fish.latinName);
        const existingItem = existingByLatinName.get(normalizedLatin);

        if (!existingItem || !isBuiltInFishCatalogSource(existingItem.source)) {
          return null;
        }

        const patch = {};

        if (normalizeText(existingItem.commonName) !== normalizeText(fish.commonName)) {
          patch.commonName = fish.commonName;
          patch.commonNameNormalized = normalizeText(fish.commonName);
        }

        if (normalizeText(existingItem.latinName) !== normalizeText(fish.latinName)) {
          patch.latinName = fish.latinName;
          patch.latinNameNormalized = normalizeText(fish.latinName);
        }

        if (Number(existingItem.phMin) !== Number(fish.phMin)) {
          patch.phMin = Number(fish.phMin);
        }

        if (Number(existingItem.phMax) !== Number(fish.phMax)) {
          patch.phMax = Number(fish.phMax);
        }

        if (Number(existingItem.ghMin) !== Number(fish.ghMin)) {
          patch.ghMin = Number(fish.ghMin);
        }

        if (Number(existingItem.ghMax) !== Number(fish.ghMax)) {
          patch.ghMax = Number(fish.ghMax);
        }

        if (Number(existingItem.tempMin) !== Number(fish.tempMin)) {
          patch.tempMin = Number(fish.tempMin);
        }

        if (Number(existingItem.tempMax) !== Number(fish.tempMax)) {
          patch.tempMax = Number(fish.tempMax);
        }

        if (Number(existingItem.minLiters) !== Number(fish.minLiters)) {
          patch.minLiters = Number(fish.minLiters);
        }

        if (Boolean(existingItem.isSchooling) !== Boolean(fish.isSchooling)) {
          patch.isSchooling = Boolean(fish.isSchooling);
        }

        if (Number(existingItem.minGroupSize ?? 0) !== Number(fish.minGroupSize ?? 0)) {
          patch.minGroupSize = Number(fish.minGroupSize ?? 0);
        }

        if (
          normalizeAggressionLevel(existingItem.aggressionLevel) !==
          normalizeAggressionLevel(fish.aggressionLevel)
        ) {
          patch.aggressionLevel = normalizeAggressionLevel(fish.aggressionLevel);
        }

        if (String(existingItem.notes ?? '').trim() !== String(fish.notes ?? '').trim()) {
          patch.notes = fish.notes ?? '';
        }

        if (existingItem.source !== fish.source) {
          patch.source = fish.source;
        }

        if (Object.keys(patch).length === 0) {
          return null;
        }

        return {
          id: existingItem.id,
          patch,
        };
      }).filter(Boolean);
      const existingImageUrlBackfills = allowedExisting.map((item) => {
        const currentImageUrl = String(item?.imageUrl ?? '').trim();
        if (currentImageUrl) {
          return null;
        }

        const fallbackImageUrl = buildFishCatalogImageUrl(item?.latinName);
        if (!fallbackImageUrl) {
          return null;
        }

        return {
          id: item.id,
          patch: {
            imageUrl: fallbackImageUrl,
          },
        };
      }).filter(Boolean);
      const catalogUpdatesById = new Map();
      [...existingSeedUpdates, ...existingImageUrlBackfills].forEach((item) => {
        const currentPatch = catalogUpdatesById.get(item.id) ?? {};
        catalogUpdatesById.set(item.id, {
          ...currentPatch,
          ...item.patch,
        });
      });
      const catalogUpdates = Array.from(catalogUpdatesById.entries()).map(
        ([id, patch]) => ({
          id,
          patch,
        })
      );

      let added = [];
      let patched = [];

      if (missingSeedFish.length > 0) {
        const createdDocs = await Promise.all(
          missingSeedFish.map((fish) =>
            addDoc(catalogCollection, {
              ...fish,
              commonNameNormalized: normalizeText(fish.commonName),
              latinNameNormalized: normalizeText(fish.latinName),
              createdAt: new Date(),
            })
          )
        );

        added = createdDocs.map((docRef, index) => ({
          id: docRef.id,
          ...missingSeedFish[index],
        }));
      }

      if (catalogUpdates.length > 0) {
        await Promise.all(
          catalogUpdates.map((item) =>
            updateDoc(doc(db, 'fishCatalog', item.id), item.patch)
          )
        );

        patched = catalogUpdates.map((item) => ({
          id: item.id,
          ...item.patch,
        }));
      }

      const patchedById = new Map(patched.map((item) => [item.id, item]));
      const syncedExisting = allowedExisting.map((item) =>
        patchedById.has(item.id) ? { ...item, ...patchedById.get(item.id) } : item
      );

      const combinedCatalog = [...syncedExisting, ...added];
      const {
        uniqueEntries: dedupedData,
        duplicateIds: combinedDuplicateIds,
      } = dedupeFishCatalogEntriesByLatin(combinedCatalog);

      const duplicateIdsToDelete = combinedDuplicateIds.filter(
        (itemId) => !duplicateCatalogDocIds.includes(itemId)
      );

      if (duplicateIdsToDelete.length > 0) {
        await Promise.all(
          duplicateIdsToDelete.map((itemId) =>
            deleteDoc(doc(db, 'fishCatalog', itemId))
          )
        );
      }

      const data = sortCatalogEntriesByCommonName(
        localizeFishCatalogEntriesForLanguage(
          dedupedData.filter((item) => isAllowedFishCatalogLatinName(item.latinName)),
          catalogLanguageRef.current
        ),
        catalogLanguageRef.current
      );

      setFishCatalog(data);
    } catch (error) {
      alert(
        'Blad pobierania katalogu ryb: ' +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setFishCatalogLoading(false);
    }
  }, []);

  const fetchPlantCatalog = useCallback(async () => {
    setPlantCatalogLoading(true);

    try {
      const catalogCollection = collection(db, 'plantCatalog');
      const snapshot = await getDocs(catalogCollection);
      const existingRaw = snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }));

      const {
        uniqueEntries: existing,
        duplicateIds: duplicateCatalogDocIds,
      } = dedupePlantCatalogEntriesByLatin(existingRaw);

      if (duplicateCatalogDocIds.length > 0) {
        await Promise.all(
          duplicateCatalogDocIds.map((itemId) =>
            deleteDoc(doc(db, 'plantCatalog', itemId))
          )
        );
      }

      const disallowedCatalogEntryIds = existing
        .filter((item) => !isAllowedPlantCatalogLatinName(item.latinName))
        .map((item) => item.id);

      if (disallowedCatalogEntryIds.length > 0) {
        await Promise.all(
          disallowedCatalogEntryIds.map((itemId) =>
            deleteDoc(doc(db, 'plantCatalog', itemId))
          )
        );
      }

      const allowedExisting = existing.filter((item) =>
        isAllowedPlantCatalogLatinName(item.latinName)
      );

      const existingLatinNames = new Set(
        allowedExisting.map((item) => normalizeLatinCatalogKey(item.latinName))
      );
      const missingSeedPlants = PLANT_CATALOG_SEED.filter(
        (plant) =>
          !existingLatinNames.has(normalizeLatinCatalogKey(plant.latinName))
      );
      const existingByLatinName = new Map(
        allowedExisting.map((item) => [
          normalizeLatinCatalogKey(item.latinName),
          item,
        ])
      );
      const updatableSources = new Set(['starter', 'expanded', '', null, undefined]);

      const existingSeedUpdates = PLANT_CATALOG_SEED.map((plant) => {
        const normalizedLatin = normalizeLatinCatalogKey(plant.latinName);
        const existingItem = existingByLatinName.get(normalizedLatin);

        if (!existingItem || !updatableSources.has(existingItem.source)) {
          return null;
        }

        const patch = {};

        const normalizedPayload = getPlantCatalogNormalizationPayload({
          ...existingItem,
          ...plant,
        });

        if (
          normalizeText(existingItem.commonName) !==
          normalizeText(normalizedPayload.commonName)
        ) {
          patch.commonName = normalizedPayload.commonName;
          patch.commonNameNormalized = normalizedPayload.commonNameNormalized;
        }

        if (
          normalizeText(existingItem.latinName) !==
          normalizeText(normalizedPayload.latinName)
        ) {
          patch.latinName = normalizedPayload.latinName;
          patch.latinNameNormalized = normalizedPayload.latinNameNormalized;
        }

        if (Number(existingItem.phMin) !== Number(plant.phMin)) {
          patch.phMin = Number(plant.phMin);
        }

        if (Number(existingItem.phMax) !== Number(plant.phMax)) {
          patch.phMax = Number(plant.phMax);
        }

        if (Number(existingItem.ghMin) !== Number(plant.ghMin)) {
          patch.ghMin = Number(plant.ghMin);
        }

        if (Number(existingItem.ghMax) !== Number(plant.ghMax)) {
          patch.ghMax = Number(plant.ghMax);
        }

        if (Number(existingItem.tempMin) !== Number(plant.tempMin)) {
          patch.tempMin = Number(plant.tempMin);
        }

        if (Number(existingItem.tempMax) !== Number(plant.tempMax)) {
          patch.tempMax = Number(plant.tempMax);
        }

        if (Number(existingItem.minLiters) !== Number(plant.minLiters)) {
          patch.minLiters = Number(plant.minLiters);
        }

        if (String(existingItem.notes ?? '').trim() !== String(plant.notes ?? '').trim()) {
          patch.notes = plant.notes ?? '';
        }

        if (
          String(existingItem.imagePreviewUrl ?? '').trim() !==
          String(normalizedPayload.imagePreviewUrl ?? '').trim()
        ) {
          patch.imagePreviewUrl = normalizedPayload.imagePreviewUrl;
        }

        if (
          String(existingItem.imageUrl ?? '').trim() !==
          String(normalizedPayload.imageUrl ?? '').trim()
        ) {
          patch.imageUrl = normalizedPayload.imageUrl;
        }

        if (existingItem.source !== plant.source) {
          patch.source = plant.source;
        }

        if (Object.keys(patch).length === 0) {
          return null;
        }

        return {
          id: existingItem.id,
          patch,
        };
      }).filter(Boolean);

      let added = [];
      let patched = [];

      if (missingSeedPlants.length > 0) {
        const createdDocs = await Promise.all(
          missingSeedPlants.map((plant) =>
            addDoc(catalogCollection, {
              ...plant,
              ...getPlantCatalogNormalizationPayload(plant),
              createdAt: new Date(),
            })
          )
        );

        added = createdDocs.map((docRef, index) => ({
          id: docRef.id,
          ...missingSeedPlants[index],
        }));
      }

      if (existingSeedUpdates.length > 0) {
        await Promise.all(
          existingSeedUpdates.map((item) =>
            updateDoc(doc(db, 'plantCatalog', item.id), item.patch)
          )
        );

        patched = existingSeedUpdates.map((item) => ({
          id: item.id,
          ...item.patch,
        }));
      }

      const patchedById = new Map(patched.map((item) => [item.id, item]));
      const syncedExisting = allowedExisting.map((item) =>
        patchedById.has(item.id) ? { ...item, ...patchedById.get(item.id) } : item
      );

      const combinedCatalog = [...syncedExisting, ...added];
      const {
        uniqueEntries: dedupedData,
        duplicateIds: combinedDuplicateIds,
      } = dedupePlantCatalogEntriesByLatin(combinedCatalog);

      const duplicateIdsToDelete = combinedDuplicateIds.filter(
        (itemId) => !duplicateCatalogDocIds.includes(itemId)
      );

      if (duplicateIdsToDelete.length > 0) {
        await Promise.all(
          duplicateIdsToDelete.map((itemId) =>
            deleteDoc(doc(db, 'plantCatalog', itemId))
          )
        );
      }

      const normalizedData = dedupedData
        .map((item) => ({
          ...item,
          ...getPlantCatalogNormalizationPayload(item),
        }))
        .filter((item) => isAllowedPlantCatalogLatinName(item.latinName));

      const data = sortCatalogEntriesByCommonName(
        localizePlantCatalogEntriesForLanguage(
          normalizedData,
          catalogLanguageRef.current
        ),
        catalogLanguageRef.current
      );

      setPlantCatalog(data);
    } catch (error) {
      alert(
        'Blad pobierania katalogu roslin: ' +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setPlantCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    let cancelled = false;

    const bootstrapInitialData = async () => {
      if (!user?.uid) {
        if (!cancelled) {
          setInitialDataReady(true);
        }
        return;
      }

      if (!cancelled) {
        // Nie blokujemy pierwszego renderu - dane dogrywamy asynchronicznie.
        setInitialDataReady(true);
      }

      const bootstrapWork = async () => {
        await Promise.allSettled([fetchTanks(user.uid), fetchHomeData(user.uid)]);
      };

      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          if (!cancelled) {
            bootstrapWork().catch(() => null);
          }
        });
        return;
      }

      setTimeout(() => {
        if (!cancelled) {
          bootstrapWork().catch(() => null);
        }
      }, 0);
    };

    bootstrapInitialData();

    return () => {
      cancelled = true;
    };
  }, [loading, user?.uid, fetchFishCatalog, fetchPlantCatalog, fetchHomeData, fetchTanks]);

  useEffect(() => {
    if (!user?.uid || !selectedTank?.id) {
      setMeasurements([]);
      return;
    }

    fetchMeasurements(user.uid, selectedTank.id);
  }, [user?.uid, selectedTank?.id, fetchMeasurements]);

  useEffect(() => {
    if (
      !user?.uid ||
      activeSection !== 'fish' ||
      fishCatalogLoading ||
      fishCatalog.length > 0
    ) {
      return;
    }

    fetchFishCatalog().catch(() => null);
  }, [
    user?.uid,
    activeSection,
    fishCatalogLoading,
    fishCatalog.length,
    fetchFishCatalog,
  ]);

  useEffect(() => {
    if (
      !user?.uid ||
      activeSection !== 'plant' ||
      plantCatalogLoading ||
      plantCatalog.length > 0
    ) {
      return;
    }

    fetchPlantCatalog().catch(() => null);
  }, [
    user?.uid,
    activeSection,
    plantCatalogLoading,
    plantCatalog.length,
    fetchPlantCatalog,
  ]);

  useEffect(() => {
    catalogLanguageRef.current = appSettings.language;
  }, [appSettings.language]);

  useEffect(() => {
    setFishCatalog((prev) =>
      sortCatalogEntriesByCommonName(
        localizeFishCatalogEntriesForLanguage(prev, appSettings.language),
        appSettings.language
      )
    );
    setPlantCatalog((prev) =>
      sortCatalogEntriesByCommonName(
        localizePlantCatalogEntriesForLanguage(prev, appSettings.language),
        appSettings.language
      )
    );
    setStockItems((prev) =>
      localizeStockItemsForLanguage(prev, appSettings.language)
    );
    setHomeStockItems((prev) =>
      localizeStockItemsForLanguage(prev, appSettings.language)
    );
  }, [appSettings.language]);

  useEffect(() => {
    if (!user?.uid || !selectedTank?.id) {
      setStockItems([]);
      return;
    }

    fetchStockItems(user.uid, selectedTank.id);
  }, [user?.uid, selectedTank?.id, fetchStockItems]);

  useEffect(() => {
    if (!user?.uid || !selectedTank?.id) {
      setTankDiseaseCases([]);
      setTankDiseaseHistoryCases([]);
      return;
    }

    fetchTankDiseaseCases(user.uid, selectedTank.id);
  }, [user?.uid, selectedTank?.id, fetchTankDiseaseCases]);

  useEffect(() => {
    const nextDrafts = {};

    stockItems
      .filter((item) => item.type === 'fish')
      .forEach((item) => {
        nextDrafts[item.id] = String(Math.max(1, Number(item.quantity) || 1));
      });

    setFishQuantityDrafts(nextDrafts);
  }, [stockItems, selectedTank?.id]);

  useEffect(() => {
    if (editingTankId && editingTankId !== selectedTank?.id) {
      setEditingTankId(null);
      setTankName('');
      setTankLiters('');
      setTankAquariumType('');
      setTankSubstrateType('');
      setTankLightIntensity('');
      setTankLightHours('');
    }

    setStockFishSearch('');
    setStockPlantSearch('');
    setSelectedCatalogFishId(null);
    setSelectedCatalogPlantId(null);
    setIsEditingFish(false);
    setIsEditingPlant(false);
    setIsPlantFertilizationExpanded(true);
    setIsPlantStockExpanded(true);
    setIsPlantFertilizationAddFormVisible(false);
    setEditingFishItemId(null);
    setEditingPlantItemId(null);
    setEditingPlantFertilizationEntryId(null);
    setPlantFertilizerName('');
    setPlantFertilizerQuantityInput('1');
    setPlantFertilizerNote('');
    setRootTabsDurationDaysInput(String(ROOT_TABS_DEFAULT_DURATION_DAYS));
    setEditingPlantFertilizerName('');
    setEditingPlantFertilizerQuantityInput('1');
    setEditingRootTabsDurationDaysInput(String(ROOT_TABS_DEFAULT_DURATION_DAYS));
    setEditingPlantFertilizerNote('');
    setIsIssueTankPickerVisible(false);
    setIssueTankPickerPayload(null);
    setIsTankDiseasesExpanded(true);
    setIsTankAlgaeExpanded(true);
    setExpandedDiseaseCaseId(null);
    setExpandedAlgaeCaseId(null);
    setIsWaterTestingExpanded(false);
    setOnboardingTaskBusy(false);
    setIsCompletedOnboardingVisible(false);
    setIsEquipmentCatalogModalVisible(false);
    setEquipmentCatalogType('');
    setEquipmentCatalogSearch('');
    setSelectedMeasurementId(null);
    setEditingMeasurementId(null);
  }, [selectedTank?.id, editingTankId]);

  useEffect(() => {
    if (activeSection === 'fish' && stockType !== 'fish') {
      setStockType('fish');
    }

    if (activeSection === 'plant' && stockType !== 'plant') {
      setStockType('plant');
    }
  }, [activeSection, stockType]);

  useEffect(() => {
    if (activeSection === 'tank') {
      setActiveSection('review');
    }
  }, [activeSection, setActiveSection]);

  useEffect(() => {
    if (
      sectionEntrySource !== 'menu' &&
      (activeSection === 'disease' ||
        activeSection === 'plantDisease' ||
        activeSection === 'algae')
    ) {
      setActiveSection('issues', sectionEntrySource);
    }
  }, [activeSection, sectionEntrySource, setActiveSection]);

  useEffect(() => {
    if (activeSection !== 'fish') {
      setIsEditingFish(false);
      setEditingFishItemId(null);
    }

    if (activeSection !== 'plant') {
      setIsEditingPlant(false);
      setEditingPlantItemId(null);
    }
  }, [activeSection]);

  useEffect(() => {
    setExpandedGuidedStepIds({});
    setExpandedHistoryIssueId(null);
    setHistoryIssueDeleteBusyId(null);
  }, [selectedTank?.id]);

  const handleRefresh = useCallback(async () => {
    if (!user?.uid || refreshing) {
      return;
    }

    setRefreshing(true);

    try {
      const preferredTankId = selectedTank?.id ?? undefined;

      await Promise.all([fetchFishCatalog(), fetchPlantCatalog(), fetchHomeData(user.uid)]);
      await fetchTanks(user.uid, preferredTankId);

      if (preferredTankId) {
        await Promise.all([
          fetchMeasurements(user.uid, preferredTankId),
          fetchStockItems(user.uid, preferredTankId),
          fetchTankDiseaseCases(user.uid, preferredTankId),
        ]);
      }
    } catch (error) {
      alert(
        'Blad odswiezania danych: ' +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setRefreshing(false);
    }
  }, [
    user?.uid,
    refreshing,
    selectedTank?.id,
    fetchFishCatalog,
    fetchPlantCatalog,
    fetchHomeData,
    fetchTanks,
    fetchMeasurements,
    fetchStockItems,
    fetchTankDiseaseCases,
  ]);

  const handleAuthSubmit = async () => {
    if (authBusy) {
      return;
    }

    const normalizedEmail = email.trim();
    const normalizedNickname = authNickname.trim();

    if (!normalizedEmail || !password) {
      alert('Podaj email i haslo');
      return;
    }

    if (authMode === 'register' && !normalizedNickname) {
      alert('Podaj imie lub nick');
      return;
    }

    setAuthBusy(true);

    try {
      if (authMode === 'register') {
        skipNextUnverifiedAlertRef.current = true;
        const credentials = await createUserWithEmailAndPassword(
          auth,
          normalizedEmail,
          password
        );

        await updateProfile(credentials.user, {
          displayName: normalizedNickname,
        });
        await sendEmailVerification(credentials.user);
        await signOut(auth);

        setAuthNickname('');
        setPassword('');
        setAuthMode('login');
        alert(
          'Konto utworzone. Wyslalismy link weryfikacyjny na email. Zweryfikuj adres i zaloguj sie ponownie.'
        );
      } else {
        const credentials = await signInWithEmailAndPassword(
          auth,
          normalizedEmail,
          password
        );
        await credentials.user.reload();
        const refreshedUser = auth.currentUser ?? credentials.user;

        if (!refreshedUser.emailVerified) {
          try {
            await sendEmailVerification(refreshedUser);
          } catch (verificationError) {
            console.warn(
              'Blad ponownej wysylki weryfikacji email:',
              verificationError instanceof Error
                ? verificationError.message
                : String(verificationError)
            );
          }

          skipNextUnverifiedAlertRef.current = true;
          await signOut(auth);
          showUnverifiedEmailAlert(
            'Najpierw zweryfikuj email. Wyslalismy ponownie link aktywacyjny.'
          );
          return;
        }
      }
    } catch (error) {
      skipNextUnverifiedAlertRef.current = false;
      alert(
        `${authMode === 'register' ? 'Blad rejestracji' : 'Blad logowania'}: ` +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const completeGoogleAuthWithTokens = useCallback(
    async ({ idToken, accessToken }, isDeleteAccountGoogleReauth) => {
      try {
        const credential = GoogleAuthProvider.credential(
          idToken || null,
          accessToken || null
        );
        if (isDeleteAccountGoogleReauth) {
          const currentAuthUser = auth.currentUser;
          if (!currentAuthUser) {
            throw new Error(t('deleteAccountReauthSessionMissing'));
          }

          await reauthenticateWithCredential(currentAuthUser, credential);
          setDeleteAccountReauthPassword('');
          setIsDeleteAccountReauthModalVisible(false);
          await deleteAccountConfirmedRef.current?.(false);
        } else {
          await signInWithCredential(auth, credential);
        }
      } catch (error) {
        if (isDeleteAccountGoogleReauth) {
          alert(
            t('deleteAccountReauthGoogleError', {
              value: error instanceof Error ? error.message : String(error ?? ''),
            })
          );
        } else {
          alert(
            'Blad logowania Google: ' +
              (error instanceof Error ? error.message : '')
          );
        }
      } finally {
        if (isDeleteAccountGoogleReauth) {
          setDeleteAccountReauthBusy(false);
        } else {
          setAuthBusy(false);
        }
      }
    },
    [t]
  );

  const handleGoogleAuth = async (intent = 'sign-in') => {
    const isDeleteAccountGoogleReauth = intent === 'reauth-delete-account';
    if (isDeleteAccountGoogleReauth) {
      if (deleteAccountReauthBusy || deleteAccountBusy) {
        return;
      }
    } else if (authBusy) {
      return;
    }

    if (IS_EXPO_GO) {
      alert(
        'Logowanie Google nie dziala poprawnie w Expo Go. Uruchom aplikacje w development build (dev client), wtedy Google OAuth bedzie zgodny z polityka Google.'
      );
      return;
    }

    if (!isGoogleAuthConfiguredForPlatform) {
      const expectedEnvKey = Platform.select({
        ios: 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
        android: 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
        default: 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
      });
      alert(
        `Logowanie Google nie jest skonfigurowane. Uzupelnij ${expectedEnvKey} i uruchom aplikacje ponownie.`
      );
      return;
    }

    if (!googleAuthRequest) {
      alert(
        'Logowanie Google nie jest jeszcze gotowe. Sprawdz konfiguracje client ID.'
      );
      return;
    }

    if (isDeleteAccountGoogleReauth) {
      setDeleteAccountReauthBusy(true);
    } else {
      setAuthBusy(true);
    }

    try {
      const result = await promptGoogleAuthAsync();
      if (result.type !== 'success') {
        if (isDeleteAccountGoogleReauth) {
          setDeleteAccountReauthBusy(false);
        } else {
          setAuthBusy(false);
        }
        return;
      }

      const idToken =
        result?.authentication?.idToken ?? result?.params?.id_token;
      const accessToken =
        result?.authentication?.accessToken ?? result?.params?.access_token;

      if (!idToken && !accessToken) {
        if (isDeleteAccountGoogleReauth) {
          setDeleteAccountReauthBusy(false);
        } else {
          setAuthBusy(false);
        }
        alert(
          'Logowanie Google nie zwrocilo tokenu. Sprawdz konfiguracje OAuth i sprobuj ponownie.'
        );
        return;
      }

      await completeGoogleAuthWithTokens(
        { idToken, accessToken },
        isDeleteAccountGoogleReauth
      );
    } catch (error) {
      if (isDeleteAccountGoogleReauth) {
        setDeleteAccountReauthBusy(false);
      } else {
        setAuthBusy(false);
      }
      alert(
        isDeleteAccountGoogleReauth
          ? t('deleteAccountReauthGoogleStartError', {
              value: error instanceof Error ? error.message : String(error ?? ''),
            })
          : 'Blad uruchamiania logowania Google: ' +
            (error instanceof Error ? error.message : '')
      );
    }
  };

  const handleOpenForgotPasswordModal = () => {
    setForgotPasswordEmail(email.trim());
    setIsForgotPasswordModalVisible(true);
  };

  const handleCloseForgotPasswordModal = () => {
    setIsForgotPasswordModalVisible(false);
    setForgotPasswordEmail('');
  };

  const handleForgotPassword = async () => {
    if (authBusy) {
      return;
    }

    const normalizedEmail = forgotPasswordEmail.trim();
    if (!normalizedEmail) {
      alert('Podaj email, aby odzyskac haslo.');
      return;
    }

    setAuthBusy(true);
    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
      setIsForgotPasswordModalVisible(false);
      alert('Wyslalismy link do resetu hasla na podany email.');
    } catch (error) {
      alert(
        'Blad wysylki resetu hasla: ' +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleOpenDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  const resetMeasurementDraft = () => {
    setPh('');
    setGh('');
    setKh('');
    setCa('');
    setMg('');
    setNo2('');
    setNo3('');
    setNh3Nh4('');
    setPo4('');
    setFe('');
    setTemperature('');
    setMeasurementNote('');
  };

  const prefillMeasurementDraft = (measurement) => {
    const toDraftValue = (value) =>
      Number.isFinite(Number(value)) ? String(value) : '';

    setPh(toDraftValue(measurement?.ph));
    setGh(toDraftValue(measurement?.gh));
    setKh(toDraftValue(measurement?.kh));
    setCa(toDraftValue(measurement?.ca));
    setMg(toDraftValue(measurement?.mg));
    setNo2(toDraftValue(measurement?.no2));
    setNo3(toDraftValue(measurement?.no3));
    setNh3Nh4(toDraftValue(measurement?.nh3nh4));
    setPo4(toDraftValue(measurement?.po4));
    setFe(toDraftValue(measurement?.fe));
    setTemperature(toDraftValue(measurement?.temperature));
    setMeasurementNote(String(measurement?.note ?? ''));
  };

  const handleOpenAddMeasurementModal = () => {
    if (!selectedTank) {
      alert('Najpierw wybierz aktywne akwarium.');
      return;
    }

    setEditingMeasurementId(null);
    if (appSettings.prefillMeasurementFromLast && currentMeasurement) {
      prefillMeasurementDraft(currentMeasurement);
    } else {
      resetMeasurementDraft();
    }
    setIsAddMeasurementModalVisible(true);
  };

  const handleCloseAddMeasurementModal = () => {
    setIsAddMeasurementModalVisible(false);
    setEditingMeasurementId(null);
    resetMeasurementDraft();
  };

  const handleStartEditMeasurement = (measurement) => {
    if (!selectedTank || !measurement?.id) {
      return;
    }

    setEditingMeasurementId(measurement.id);
    prefillMeasurementDraft(measurement);
    setIsAddMeasurementModalVisible(true);
  };

  const handleSwitchTank = async (direction) => {
    if (!user?.uid || tanks.length === 0) {
      return;
    }

    const currentIndex = selectedTank
      ? tanks.findIndex((item) => item.id === selectedTank.id)
      : 0;
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const offset = direction === 'prev' ? -1 : 1;
    const nextIndex = (safeIndex + offset + tanks.length) % tanks.length;
    const nextTank = tanks[nextIndex];

    if (!nextTank) {
      return;
    }

    setSelectedTank(nextTank);

    try {
      const storageKey = getSelectedTankStorageKey(user.uid);
      await AsyncStorage.setItem(storageKey, nextTank.id);
    } catch (error) {
      alert(
        'Blad zapisu wybranego akwarium: ' +
          (error instanceof Error ? error.message : '')
      );
    }
  };

  const handleOpenTankFromHome = async (tank) => {
    if (!user?.uid || !tank?.id) {
      return;
    }

    setSelectedTank(tank);
    setActiveSection('review');

    try {
      const storageKey = getSelectedTankStorageKey(user.uid);
      await AsyncStorage.setItem(storageKey, tank.id);
      await Promise.all([
        fetchMeasurements(user.uid, tank.id),
        fetchStockItems(user.uid, tank.id),
        fetchTankDiseaseCases(user.uid, tank.id),
      ]);
    } catch (error) {
      alert(
        'Blad otwierania akwarium: ' +
          (error instanceof Error ? error.message : '')
      );
    }
  };
  const handleShowHomeTankScoreDetails = useCallback(
    (summary) => {
      if (!summary?.healthAssessment) {
        return;
      }
      setSelectedHomeScoreSummary(summary);
    },
    []
  );
  const handleCloseHomeScoreDetails = useCallback(() => {
    setSelectedHomeScoreSummary(null);
  }, []);
  const handleCloseMeasurementTileDetails = useCallback(() => {
    setSelectedMeasurementTileDetails(null);
  }, []);

  const handleStartEditTank = () => {
    if (!selectedTank) {
      alert('Najpierw wybierz aktywne akwarium do edycji');
      return;
    }

    setEditingTankId(selectedTank.id);
    setTankName(selectedTank.name ?? '');
    setTankLiters(
      selectedTank.liters === undefined ? '' : String(selectedTank.liters)
    );
    setTankAquariumType(normalizeAquariumType(selectedTank.aquariumType));
    setTankSubstrateType(selectedTank.substrateType ?? '');
    setTankLightIntensity(selectedTank.lightIntensity ?? '');
    setTankLightHours(
      selectedTank.lightHours === undefined ? '' : String(selectedTank.lightHours)
    );
    setTankOnboardingMode(normalizeOnboardingMode(selectedTank.onboardingMode));
  };

  const handleStartAddTank = () => {
    if (!canAddTank) {
      alert(
        t('subscriptionTankLimitReached', {
          plan: currentSubscriptionTierLabel,
          limit: tankLimit,
        })
      );
      return;
    }

    setEditingTankId(null);
    setTankName('');
    setTankLiters('');
    setTankAquariumType('');
    setTankSubstrateType('');
    setTankLightIntensity('');
    setTankLightHours('');
    setTankOnboardingMode('existing_running');
    setIsAddingTankModalVisible(true);
  };

  const handleCancelEditTank = () => {
    setEditingTankId(null);
    setTankName('');
    setTankLiters('');
    setTankAquariumType('');
    setTankSubstrateType('');
    setTankLightIntensity('');
    setTankLightHours('');
    setTankOnboardingMode('existing_running');
  };

  const handleCancelAddTank = () => {
    setIsAddingTankModalVisible(false);
    setTankName('');
    setTankLiters('');
    setTankAquariumType('');
    setTankSubstrateType('');
    setTankLightIntensity('');
    setTankLightHours('');
    setTankOnboardingMode('existing_running');
  };

  const handleOpenEquipmentCatalog = (type) => {
    if (!selectedTank?.id || !user?.uid) {
      alert('Najpierw wybierz aktywne akwarium.');
      return;
    }
    if (!hasEquipmentSaveAccess) {
      alert(t('subscriptionEquipmentLocked'));
      return;
    }

    const normalizedType = normalizeEquipmentType(type);
    if (!normalizedType) {
      return;
    }

    setEquipmentCatalogType(normalizedType);
    setEquipmentCatalogSearch('');
    setIsEquipmentCatalogModalVisible(true);
  };

  const handleCloseEquipmentCatalog = () => {
    setIsEquipmentCatalogModalVisible(false);
    setEquipmentCatalogType('');
    setEquipmentCatalogSearch('');
  };

  const handleAssignEquipmentToTank = async (equipmentItem) => {
    if (
      !selectedTank?.id ||
      !user?.uid ||
      !equipmentItem?.id ||
      equipmentSavingBusy
    ) {
      return;
    }
    if (!hasEquipmentSaveAccess) {
      alert(t('subscriptionEquipmentLocked'));
      return;
    }

    const equipmentType = normalizeEquipmentType(equipmentItem.type);
    if (!equipmentType) {
      return;
    }

    setEquipmentSavingBusy(true);

    try {
      const listField = getTankEquipmentListField(equipmentType);
      const legacyField = getTankEquipmentLegacyField(equipmentType);
      const currentList = getTankEquipmentList(selectedTank, equipmentType);
      const nextEquipment = buildTankEquipmentFromCatalogItem(
        equipmentItem,
        equipmentType
      );
      const nextList = [...currentList, nextEquipment];
      const payload = {
        [listField]: nextList,
        [legacyField]: nextList[0] ?? null,
      };

      await updateDoc(doc(db, 'tanks', selectedTank.id), {
        ...payload,
        updatedAt: new Date(),
      });

      await fetchTanks(user.uid, selectedTank.id);
      setIsEquipmentCatalogModalVisible(false);
      setEquipmentCatalogType('');
      setEquipmentCatalogSearch('');
      alert(
        equipmentType === 'heater'
          ? 'Grzalka dodana do zestawu akwarium.'
          : 'Filtr dodany do zestawu akwarium.'
      );
    } catch (error) {
      alert(
        'Blad zapisu sprzetu: ' +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setEquipmentSavingBusy(false);
    }
  };

  const handleRemoveTankEquipment = async (equipmentType, equipmentItem, itemIndex) => {
    if (!selectedTank?.id || !user?.uid || equipmentSavingBusy) {
      return;
    }

    if (!hasEquipmentSaveAccess) {
      alert(t('subscriptionEquipmentLocked'));
      return;
    }

    const normalizedType = normalizeEquipmentType(equipmentType);
    if (!normalizedType) {
      return;
    }

    const currentList = getTankEquipmentList(selectedTank, normalizedType);
    if (currentList.length === 0) {
      return;
    }

    const nextList = currentList.filter((entry, index) => {
      if (entry?.assignmentId && equipmentItem?.assignmentId) {
        return entry.assignmentId !== equipmentItem.assignmentId;
      }

      if (entry?.id && equipmentItem?.id && entry.id === equipmentItem.id && index === itemIndex) {
        return false;
      }

      return index !== itemIndex;
    });

    const listField = getTankEquipmentListField(normalizedType);
    const legacyField = getTankEquipmentLegacyField(normalizedType);

    setEquipmentSavingBusy(true);
    try {
      await updateDoc(doc(db, 'tanks', selectedTank.id), {
        [listField]: nextList,
        [legacyField]: nextList[0] ?? null,
        updatedAt: new Date(),
      });
      await fetchTanks(user.uid, selectedTank.id);
    } catch (error) {
      alert(
        'Blad aktualizacji sprzetu: ' +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setEquipmentSavingBusy(false);
    }
  };

  const handleAddPlantFertilizationEntry = async () => {
    if (!selectedTank?.id || !user?.uid || plantFertilizationBusy) {
      return;
    }

    const productName = String(plantFertilizerName ?? '').trim();
    if (!productName) {
      alert('Podaj nazwe nawozu');
      return;
    }

    let quantity = 1;
    try {
      quantity = parsePositiveInteger(
        parsePositiveNumberOrThrow('ilosc kulek nawozowych', plantFertilizerQuantityInput),
        1
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Niepoprawna ilosc kulek');
      return;
    }

    if (quantity > 999) {
      alert('Ilosc kulek ustaw w zakresie 1-999');
      return;
    }

    let durationDays = ROOT_TABS_DEFAULT_DURATION_DAYS;
    try {
      durationDays = parsePositiveInteger(
        parsePositiveNumberOrThrow(
          'czas dzialania kulek nawozowych (dni)',
          rootTabsDurationDaysInput
        ),
        ROOT_TABS_DEFAULT_DURATION_DAYS
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Niepoprawny czas dzialania kulek');
      return;
    }

    if (durationDays > 365) {
      alert('Czas dzialania kulek ustaw w zakresie 1-365 dni');
      return;
    }

    const note = String(plantFertilizerNote ?? '').trim();
    const currentEntries = normalizePlantFertilizationEntries(
      selectedTank.plantFertilizationEntries
    );
    const newEntry = {
      id: buildPlantFertilizationEntryId(),
      type: PLANT_FERTILIZATION_TYPE_ROOT_TABS,
      productName,
      quantity,
      note,
      durationDays,
      createdAt: new Date(),
    };
    const nextEntries = [newEntry, ...currentEntries].slice(
      0,
      MAX_PLANT_FERTILIZATION_ENTRIES
    );

    setPlantFertilizationBusy(true);
    try {
      await updateDoc(doc(db, 'tanks', selectedTank.id), {
        plantFertilizationEntries: nextEntries,
        updatedAt: new Date(),
      });

      await Promise.all([
        fetchTanks(user.uid, selectedTank.id),
        fetchHomeData(user.uid),
      ]);
      setPlantFertilizerName('');
      setPlantFertilizerQuantityInput('1');
      setPlantFertilizerNote('');
      setRootTabsDurationDaysInput(String(ROOT_TABS_DEFAULT_DURATION_DAYS));
      setIsPlantFertilizationAddFormVisible(false);
      alert('Kulki nawozowe dodane do harmonogramu.');
    } catch (error) {
      alert(
        'Blad zapisu nawozenia: ' + (error instanceof Error ? error.message : '')
      );
    } finally {
      setPlantFertilizationBusy(false);
    }
  };

  const handleStartEditPlantFertilizationEntry = (entry) => {
    if (!entry?.id) {
      return;
    }

    setEditingPlantFertilizationEntryId(entry.id);
    setEditingPlantFertilizerName(String(entry.productName ?? ''));
    setEditingPlantFertilizerQuantityInput(String(parsePositiveInteger(entry.quantity, 1)));
    setEditingRootTabsDurationDaysInput(
      String(parsePositiveInteger(entry.durationDays, ROOT_TABS_DEFAULT_DURATION_DAYS))
    );
    setEditingPlantFertilizerNote(String(entry.note ?? ''));
  };

  const handleCancelEditPlantFertilizationEntry = () => {
    setEditingPlantFertilizationEntryId(null);
    setEditingPlantFertilizerName('');
    setEditingPlantFertilizerQuantityInput('1');
    setEditingRootTabsDurationDaysInput(String(ROOT_TABS_DEFAULT_DURATION_DAYS));
    setEditingPlantFertilizerNote('');
  };

  const handleSaveEditedPlantFertilizationEntry = async () => {
    if (!selectedTank?.id || !user?.uid || !editingPlantFertilizationEntryId || plantFertilizationBusy) {
      return;
    }

    const productName = String(editingPlantFertilizerName ?? '').trim();
    if (!productName) {
      alert('Podaj nazwe nawozu');
      return;
    }

    let quantity = 1;
    try {
      quantity = parsePositiveInteger(
        parsePositiveNumberOrThrow(
          'ilosc kulek nawozowych',
          editingPlantFertilizerQuantityInput
        ),
        1
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Niepoprawna ilosc kulek');
      return;
    }

    if (quantity > 999) {
      alert('Ilosc kulek ustaw w zakresie 1-999');
      return;
    }

    let durationDays = ROOT_TABS_DEFAULT_DURATION_DAYS;
    try {
      durationDays = parsePositiveInteger(
        parsePositiveNumberOrThrow(
          'czas dzialania kulek nawozowych (dni)',
          editingRootTabsDurationDaysInput
        ),
        ROOT_TABS_DEFAULT_DURATION_DAYS
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Niepoprawny czas dzialania kulek');
      return;
    }

    if (durationDays > 365) {
      alert('Czas dzialania kulek ustaw w zakresie 1-365 dni');
      return;
    }

    const note = String(editingPlantFertilizerNote ?? '').trim();
    const currentEntries = normalizePlantFertilizationEntries(
      selectedTank.plantFertilizationEntries
    );
    const nextEntries = currentEntries.map((entry) => {
      if (entry.id !== editingPlantFertilizationEntryId) {
        return entry;
      }

      return {
        ...entry,
        type: PLANT_FERTILIZATION_TYPE_ROOT_TABS,
        productName,
        quantity,
        durationDays,
        note,
      };
    });

    setPlantFertilizationBusy(true);
    try {
      await updateDoc(doc(db, 'tanks', selectedTank.id), {
        plantFertilizationEntries: nextEntries,
        updatedAt: new Date(),
      });

      await Promise.all([
        fetchTanks(user.uid, selectedTank.id),
        fetchHomeData(user.uid),
      ]);
      handleCancelEditPlantFertilizationEntry();
    } catch (error) {
      alert(
        'Blad edycji wpisu nawozenia: ' +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setPlantFertilizationBusy(false);
    }
  };

  const handleDeletePlantFertilizationEntry = async (entryId) => {
    if (!selectedTank?.id || !user?.uid || !entryId || plantFertilizationBusy) {
      return;
    }

    const currentEntries = normalizePlantFertilizationEntries(
      selectedTank.plantFertilizationEntries
    );
    const nextEntries = currentEntries.filter((item) => item.id !== entryId);

    if (nextEntries.length === currentEntries.length) {
      return;
    }

    setPlantFertilizationBusy(true);
    try {
      await updateDoc(doc(db, 'tanks', selectedTank.id), {
        plantFertilizationEntries: nextEntries,
        updatedAt: new Date(),
      });

      await Promise.all([
        fetchTanks(user.uid, selectedTank.id),
        fetchHomeData(user.uid),
      ]);
      if (editingPlantFertilizationEntryId === entryId) {
        handleCancelEditPlantFertilizationEntry();
      }
    } catch (error) {
      alert(
        'Blad usuwania wpisu nawozenia: ' +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setPlantFertilizationBusy(false);
    }
  };

  const handleSaveTank = async () => {
    if (!user || addTankBusy) {
      return;
    }

    if (!editingTankId && !canAddTank) {
      alert(
        t('subscriptionTankLimitReached', {
          plan: currentSubscriptionTierLabel,
          limit: tankLimit,
        })
      );
      return;
    }

    Keyboard.dismiss();
    setAddTankBusy(true);

    try {
      const name = tankName.trim();

      if (!name) {
        throw new Error('Pole nazwa akwarium jest wymagane');
      }

      const liters = parsePositiveNumberOrThrow('litraz', tankLiters);
      const aquariumType = normalizeAquariumType(tankAquariumType);
      const substrateType = normalizeSubstrateType(tankSubstrateType);
      const lightIntensity = normalizeLightIntensity(tankLightIntensity);
      const lightHours = parsePositiveNumberOrThrow(
        'godziny swiecenia',
        tankLightHours
      );

      if (!AQUARIUM_TYPE_OPTIONS.some((item) => item.value === aquariumType)) {
        throw new Error('Wybierz typ akwarium');
      }

      if (!SUBSTRATE_OPTIONS.some((item) => item.value === substrateType)) {
        throw new Error('Wybierz rodzaj podloza');
      }

      if (
        !LIGHT_INTENSITY_OPTIONS.some((item) => item.value === lightIntensity)
      ) {
        throw new Error('Wybierz intensywnosc swiatla');
      }

      if (lightHours > 24) {
        throw new Error('Godziny swiecenia musza byc w zakresie 1-24');
      }

      const onboardingMode = normalizeOnboardingMode(tankOnboardingMode);

      let preferredTankId = editingTankId;

      if (editingTankId) {
        await updateDoc(doc(db, 'tanks', editingTankId), {
          name,
          liters,
          aquariumType,
          substrateType,
          lightIntensity,
          lightHours,
          updatedAt: new Date(),
        });
      } else {
        const now = new Date();
        const tankDoc = await addDoc(collection(db, 'tanks'), {
          userId: user.uid,
          name,
          liters,
          aquariumType,
          substrateType,
          lightIntensity,
          lightHours,
          onboardingMode,
          onboardingStartAt: onboardingMode === 'fresh_start' ? now : null,
          createdAt: now,
        });

        preferredTankId = tankDoc.id;
      }

      setTankName('');
      setTankLiters('');
      setTankAquariumType('');
      setTankSubstrateType('');
      setTankLightIntensity('');
      setTankLightHours('');
      setTankOnboardingMode('existing_running');
      await fetchTanks(user.uid, preferredTankId ?? undefined);
      await fetchHomeData(user.uid);

      if (editingTankId) {
        setEditingTankId(null);
        alert('Akwarium zaktualizowane');
      } else {
        setIsAddingTankModalVisible(false);
        alert(
          onboardingMode === 'fresh_start'
            ? 'Akwarium dodane. Wlaczylismy onboarding dojrzewania (dzien 1).'
            : 'Akwarium dodane'
        );
      }
    } catch (error) {
      alert(
        `Blad ${editingTankId ? 'edycji' : 'dodawania'} akwarium: ` +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setAddTankBusy(false);
    }
  };

  const handleDeleteTank = () => {
    if (!user?.uid || !selectedTank?.id || addTankBusy) {
      return;
    }

    const tankToDelete = selectedTank;

    Alert.alert(
      'Usun akwarium',
      `Czy na pewno chcesz usunac akwarium "${tankToDelete.name}"?\n\nTej operacji nie da sie cofnac (nieodwracalne).`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usun',
          style: 'destructive',
          onPress: async () => {
            if (!user?.uid || !tankToDelete.id || addTankBusy) {
              return;
            }

            setAddTankBusy(true);

            try {
              const deleteByTankId = async (collectionName) => {
                const tankQuery = query(
                  collection(db, collectionName),
                  where('userId', '==', user.uid),
                  where('tankId', '==', tankToDelete.id)
                );
                const snapshot = await getDocs(tankQuery);
                await Promise.all(
                  snapshot.docs.map((item) =>
                    deleteDoc(doc(db, collectionName, item.id))
                  )
                );
              };

              await Promise.all([
                deleteByTankId('measurements'),
                deleteByTankId('stockItems'),
                deleteByTankId('tankDiseaseCases'),
              ]);
              await deleteDoc(doc(db, 'tanks', tankToDelete.id));

              setEditingTankId(null);
              setSelectedMeasurementId(null);
              setEditingMeasurementId(null);
              setIsAddMeasurementModalVisible(false);

              await fetchTanks(user.uid);
              await fetchHomeData(user.uid);
              alert('Akwarium i powiazane dane zostaly usuniete.');
            } catch (error) {
              alert(
                'Blad usuwania akwarium: ' +
                  (error instanceof Error ? error.message : '')
              );
            } finally {
              setAddTankBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleAddStockItem = async () => {
    if (!user || !selectedTank?.id || stockBusy) {
      return;
    }

    Keyboard.dismiss();
    setStockBusy(true);

    try {
      let payload = null;
      let minLiters = 0;

      if (stockType === 'fish') {
        if (!selectedCatalogFishId) {
          throw new Error('Wybierz gatunek ryby z katalogu.');
        }

        const quantity = parsePositiveNumberOrThrow('ilosc', fishQuantity);

        if (!Number.isInteger(quantity)) {
          throw new Error('Pole ilosc musi byc liczba calkowita');
        }

        const selectedFish = fishCatalog.find(
          (item) => item.id === selectedCatalogFishId
        );

        if (!selectedFish) {
          throw new Error(
            'Wybrany gatunek nie istnieje w katalogu. Odswiez liste i sprobuj ponownie.'
          );
        }

        const schoolingProfile = resolveFishSchoolingProfile(selectedFish);
        const aggressionLevel = resolveFishAggressionLevel(selectedFish);
        minLiters = Number(selectedFish.minLiters);
        payload = {
          userId: user.uid,
          tankId: selectedTank.id,
          tankName: selectedTank.name,
          type: 'fish',
          name: selectedFish.commonName,
          commonName: selectedFish.commonName,
          latinName: selectedFish.latinName,
          catalogFishId: selectedFish.id,
          phMin: Number(selectedFish.phMin),
          phMax: Number(selectedFish.phMax),
          ghMin: Number(selectedFish.ghMin),
          ghMax: Number(selectedFish.ghMax),
          tempMin: Number(selectedFish.tempMin),
          tempMax: Number(selectedFish.tempMax),
          quantity,
          minLiters,
          isSchooling: schoolingProfile.isSchooling,
          minGroupSize: schoolingProfile.minGroupSize,
          aggressionLevel,
          notes: selectedFish.notes ?? '',
          createdAt: new Date(),
        };
      } else {
        if (!selectedCatalogPlantId) {
          throw new Error('Wybierz rosline z katalogu.');
        }

        const selectedPlant = plantCatalog.find(
          (item) => item.id === selectedCatalogPlantId
        );

        if (!selectedPlant) {
          throw new Error(
            'Wybrana roslina nie istnieje w katalogu. Odswiez liste i sprobuj ponownie.'
          );
        }

        minLiters = Number(selectedPlant.minLiters);

        payload = {
          userId: user.uid,
          tankId: selectedTank.id,
          tankName: selectedTank.name,
          type: 'plant',
          name: selectedPlant.commonName,
          commonName: selectedPlant.commonName,
          latinName: selectedPlant.latinName,
          catalogPlantId: selectedPlant.id,
          phMin: Number(selectedPlant.phMin),
          phMax: Number(selectedPlant.phMax),
          ghMin: Number(selectedPlant.ghMin),
          ghMax: Number(selectedPlant.ghMax),
          tempMin: Number(selectedPlant.tempMin),
          tempMax: Number(selectedPlant.tempMax),
          minLiters,
          notes: selectedPlant.notes ?? '',
          createdAt: new Date(),
        };
      }

      await addDoc(collection(db, 'stockItems'), payload);

      setStockFishSearch('');
      setStockPlantSearch('');
      setFishQuantity('1');
      setSelectedCatalogFishId(null);
      setSelectedCatalogPlantId(null);

      await fetchStockItems(user.uid, selectedTank.id);

      const addWarnings = [];

      if (
        payload.type === 'fish' &&
        payload.isSchooling &&
        Number(payload.quantity) < Number(payload.minGroupSize)
      ) {
        addWarnings.push(
          t('schoolingFishWarning', {
            value: payload.minGroupSize,
          })
        );
      }

      if (payload.type === 'fish') {
        const hasAggressionConflict = stockItems
          .filter((item) => item.type === 'fish')
          .some((item) => getFishAggressionConflict(payload, item));

        if (hasAggressionConflict) {
          addWarnings.push(t('fishAggressionWarning'));
        }
      }

      if (Number(selectedTank.liters) < minLiters) {
        addWarnings.push(
          'Uwaga: minimalny litraz tej pozycji jest wiekszy niz litraz aktywnego akwarium.'
        );
      }

      if (addWarnings.length === 0) {
        alert('Obsada dodana');
      } else {
        alert(`Obsada dodana.\n\n${addWarnings.join('\n')}`);
      }
    } catch (error) {
      alert(
        'Blad dodawania obsady: ' +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setStockBusy(false);
    }
  };

  const handleUpdateFishQuantity = async (itemId) => {
    if (!user || !selectedTank?.id || stockBusy) {
      return false;
    }

    setStockBusy(true);

    try {
      const draft = fishQuantityDrafts[itemId] ?? '';
      const quantity = parseNonNegativeNumberOrThrow('ilosc', String(draft));

      if (!Number.isInteger(quantity)) {
        throw new Error('Pole ilosc musi byc liczba calkowita');
      }

      if (quantity === 0) {
        await deleteDoc(doc(db, 'stockItems', itemId));
      } else {
        await updateDoc(doc(db, 'stockItems', itemId), { quantity });
      }
      await fetchStockItems(user.uid, selectedTank.id);

      alert(
        quantity === 0
          ? 'Ryba usunieta z obsady (ilosc ustawiona na 0).'
          : 'Ilosc ryby zaktualizowana'
      );
      return true;
    } catch (error) {
      alert(
        'Blad aktualizacji ilosci: ' +
          (error instanceof Error ? error.message : '')
      );
      return false;
    } finally {
      setStockBusy(false);
    }
  };

  const handleDeleteStockItem = (itemId, itemType = 'fish') => {
    if (!user || !selectedTank?.id || stockBusy) {
      return;
    }

    const itemLabel = itemType === 'plant' ? 'te rosline' : 'te rybe';
    const successMessage =
      itemType === 'plant'
        ? 'Pozycja usunieta z obsady roslin'
        : 'Pozycja usunieta z obsady';
    const errorMessage =
      itemType === 'plant'
        ? 'Blad usuwania rosliny z obsady: '
        : 'Blad usuwania obsady: ';

    Alert.alert(
      'Potwierdz usuniecie',
      `Czy na pewno chcesz usunac ${itemLabel} z obsady? Tej zmiany nie da sie cofnac.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usun',
          style: 'destructive',
          onPress: async () => {
            if (!user || !selectedTank?.id || stockBusy) {
              return;
            }

            setStockBusy(true);

            try {
              await deleteDoc(doc(db, 'stockItems', itemId));
              await fetchStockItems(user.uid, selectedTank.id);
              alert(successMessage);
            } catch (error) {
              alert(
                errorMessage +
                  (error instanceof Error ? error.message : '')
              );
            } finally {
              setStockBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleCloseFishAddModal = useCallback(() => {
    Keyboard.dismiss();

    if (isDiseaseImageModalVisible) {
      setIsDiseaseImageModalVisible(false);
      return;
    }

    setIsEditingFish(false);
  }, [isDiseaseImageModalVisible]);

  const handleClosePlantAddModal = useCallback(() => {
    Keyboard.dismiss();

    setIsEditingPlant(false);
    setEditingPlantItemId(null);
    setStockPlantSearch('');
    setSelectedCatalogPlantId(null);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (isForgotPasswordModalVisible) {
          handleCloseForgotPasswordModal();
          return true;
        }

        if (isDeleteAccountReauthModalVisible) {
          handleCloseDeleteAccountReauthModal();
          return true;
        }

        if (selectedMeasurementTileDetails) {
          setSelectedMeasurementTileDetails(null);
          return true;
        }

        if (selectedHomeScoreSummary) {
          handleCloseHomeScoreDetails();
          return true;
        }

        if (isEditingFish) {
          handleCloseFishAddModal();
          return true;
        }

        if (isEditingPlant) {
          handleClosePlantAddModal();
          return true;
        }

        if (isAddMeasurementModalVisible) {
          setIsAddMeasurementModalVisible(false);
          setEditingMeasurementId(null);
          return true;
        }

        if (isEquipmentCatalogModalVisible) {
          handleCloseEquipmentCatalog();
          return true;
        }

        if (isAddingTankModalVisible) {
          if (editingTankId) {
            handleCancelEditTank();
          } else {
            handleCancelAddTank();
          }
          return true;
        }

        if (activeSection !== 'home') {
          setActiveSection('home');
          return true;
        }

        return false;
      }
    );

    return () => {
      backSubscription.remove();
    };
  }, [
    activeSection,
    editingTankId,
    handleCloseDeleteAccountReauthModal,
    handleCloseFishAddModal,
    handleCloseHomeScoreDetails,
    handleClosePlantAddModal,
    isAddMeasurementModalVisible,
    isAddingTankModalVisible,
    isDeleteAccountReauthModalVisible,
    isEditingFish,
    isEditingPlant,
    isEquipmentCatalogModalVisible,
    isForgotPasswordModalVisible,
    selectedHomeScoreSummary,
    selectedMeasurementTileDetails,
    setActiveSection,
  ]);

  const handleSaveMeasurement = async () => {
    if (!user || saveBusy) {
      return;
    }

    if (!selectedTank?.id) {
      alert('Najpierw dodaj i wybierz aktywne akwarium');
      return;
    }

    Keyboard.dismiss();
    setSaveBusy(true);

    try {
      const note = measurementNote.trim();
      const selectedTests = availableMeasurementTests;

      if (measurementInputRows.length === 0) {
        throw new Error(
          'W ustawieniach wlacz przynajmniej 1 pole, aby pokazac je w formularzu.'
        );
      }

      const measurement = { note };
      let filledMeasurementCount = 0;

      measurementInputRows.forEach((field) => {
        const parsedValue = field.parseValue(field.value);

        if (parsedValue === null) {
          return;
        }

        measurement[field.key] = parsedValue;
        filledMeasurementCount += 1;
      });

      if (filledMeasurementCount === 0 && !editingMeasurementId && !note) {
        throw new Error('Uzupelnij przynajmniej 1 widoczny parametr pomiaru.');
      }

      const co2Estimated = calculateCo2FromKhPhLogic(measurement.kh, measurement.ph);
      if (co2Estimated !== null) {
        measurement.co2 = co2Estimated;
      }

      const baseAnalysis = analyzeMeasurementLogic(measurement, selectedTests);
      const contextInsights = buildContextualEcosystemInsights({
        measurement,
        enabledTests: selectedTests,
        stockItems,
        tank: selectedTank,
        equipmentAssessment: buildTankEquipmentAssessment(
          selectedTank,
          EQUIPMENT_CATALOG
        ),
      });
      const analysis = mergeWaterAnalysisWithContext(baseAnalysis, contextInsights);

      if (editingMeasurementId) {
        await updateDoc(doc(db, 'measurements', editingMeasurementId), {
          ...measurement,
          updatedAt: new Date(),
        });
      } else {
        await addDoc(collection(db, 'measurements'), {
          userId: user.uid,
          tankId: selectedTank.id,
          tankName: selectedTank.name,
          createdAt: new Date(),
          ...measurement,
        });
      }

      resetMeasurementDraft();
      setSelectedMeasurementId(null);
      setEditingMeasurementId(null);
      setIsAddMeasurementModalVisible(false);

      await fetchMeasurements(user.uid, selectedTank.id);
      await fetchHomeData(user.uid);

      if (!hasParameterAnalysisAccess) {
        alert(
          editingMeasurementId
            ? `Zaktualizowano wpis dla akwarium: ${selectedTank.name}.`
            : `Zapisano dla akwarium: ${selectedTank.name}.`
        );
      } else if (!analysis || analysis.recommendations.length === 0) {
        alert(
          `${
            editingMeasurementId
              ? `Zaktualizowano wpis dla akwarium: ${selectedTank.name}.`
              : `Zapisano dla akwarium: ${selectedTank.name}.`
          }\n\nParametry sa w normie.`
        );
      } else {
        const highlights = analysis.recommendations
          .slice(0, 3)
          .map((item) => `- ${item.parameter}: ${item.issue}`)
          .join('\n');
        alert(
          `${
            editingMeasurementId
              ? `Zaktualizowano wpis dla akwarium: ${selectedTank.name}.`
              : `Zapisano dla akwarium: ${selectedTank.name}.`
          }\n\n${analysis.summary}\n${highlights}`
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'nieznany blad';
      alert('Blad: ' + message);
    } finally {
      setSaveBusy(false);
    }
  };

  const handleDeleteMeasurement = (measurementId) => {
    if (!user?.uid || !selectedTank?.id || !measurementId || measurementDeleteBusy) {
      return;
    }

    Alert.alert(
      'Usun wpis z historii',
      'Czy na pewno chcesz usunac ten wpis pomiaru? Tej operacji nie da sie cofnac (nieodwracalne).',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usun',
          style: 'destructive',
          onPress: async () => {
            if (!user?.uid || !selectedTank?.id || measurementDeleteBusy) {
              return;
            }

            setMeasurementDeleteBusy(true);

            try {
              await deleteDoc(doc(db, 'measurements', measurementId));

              if (selectedMeasurementId === measurementId) {
                setSelectedMeasurementId(null);
              }
              if (editingMeasurementId === measurementId) {
                setEditingMeasurementId(null);
              }

              await fetchMeasurements(user.uid, selectedTank.id);
              await fetchHomeData(user.uid);
              alert('Wpis z historii zostal usuniety.');
            } catch (error) {
              alert(
                'Blad usuwania wpisu z historii: ' +
                  (error instanceof Error ? error.message : '')
              );
            } finally {
              setMeasurementDeleteBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteIssueHistoryEntry = (issueEntry) => {
    const issueId = String(issueEntry?.id ?? '');
    if (
      !issueId ||
      !user?.uid ||
      !selectedTank?.id ||
      Boolean(historyIssueDeleteBusyId)
    ) {
      return;
    }

    const issueName = String(issueEntry?.issueName ?? t('noData')).trim();
    Alert.alert(
      'Usun wpis z historii problemow',
      `Czy na pewno chcesz usunac "${issueName}"? Tej operacji nie da sie cofnac (nieodwracalne).`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usun',
          style: 'destructive',
          onPress: async () => {
            if (
              !issueId ||
              !user?.uid ||
              !selectedTank?.id ||
              Boolean(historyIssueDeleteBusyId)
            ) {
              return;
            }

            setHistoryIssueDeleteBusyId(issueId);
            try {
              await deleteDoc(doc(db, 'tankDiseaseCases', issueId));
              await fetchTankDiseaseCases(user.uid, selectedTank.id);
              await fetchHomeData(user.uid);
              setExpandedHistoryIssueId((prev) => (prev === issueId ? null : prev));
              alert('Wpis z historii problemow zostal usuniety.');
            } catch (error) {
              alert(
                'Blad usuwania wpisu z historii problemow: ' +
                  (error instanceof Error ? error.message : '')
              );
            } finally {
              setHistoryIssueDeleteBusyId(null);
            }
          },
        },
      ]
    );
  };

  const handleToggleOnboardingTaskCheck = async (rowId, checked) => {
    if (
      !rowId ||
      !user?.uid ||
      !selectedTank?.id ||
      onboardingTaskBusy ||
      !hasTaskChecklistAccess
    ) {
      return;
    }

    const currentChecks = normalizeOnboardingTaskChecks(selectedTank.onboardingTaskChecks);
    const nextChecks = {
      ...currentChecks,
      [rowId]: Boolean(checked),
    };

    setOnboardingTaskBusy(true);
    try {
      await updateDoc(doc(db, 'tanks', selectedTank.id), {
        onboardingTaskChecks: nextChecks,
        updatedAt: new Date(),
      });

      setTanks((prev) =>
        prev.map((tank) =>
          tank.id === selectedTank.id ? { ...tank, onboardingTaskChecks: nextChecks } : tank
        )
      );
      setSelectedTank({
        ...selectedTank,
        onboardingTaskChecks: nextChecks,
      });
    } catch (error) {
      alert(
        'Blad zapisu statusu zadania onboardingu: ' +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setOnboardingTaskBusy(false);
    }
  };

  const toggleDiseaseSymptom = (symptomId) => {
    setSelectedDiseaseSymptoms((prev) => ({
      ...prev,
      [symptomId]: !prev[symptomId],
    }));
  };

  const togglePlantDiseaseSymptom = (symptomId) => {
    setSelectedPlantDiseaseSymptoms((prev) => ({
      ...prev,
      [symptomId]: !prev[symptomId],
    }));
  };

  const toggleAlgaeSymptom = (symptomId) => {
    setSelectedAlgaeSymptoms((prev) => ({
      ...prev,
      [symptomId]: !prev[symptomId],
    }));
  };

  const handleCloseIssueTankPicker = useCallback(() => {
    setIsIssueTankPickerVisible(false);
    setIssueTankPickerPayload(null);
  }, []);

  const handleSelectIssueTank = async (tank) => {
    if (!tank?.id || !issueTankPickerPayload) {
      return;
    }

    const { kind, item } = issueTankPickerPayload;
    setIsIssueTankPickerVisible(false);
    setIssueTankPickerPayload(null);

    if (kind === 'disease') {
      await handleAssignDiseaseToTank(item, tank);
      return;
    }

    if (kind === 'plant_disease') {
      await handleAssignPlantDiseaseToTank(item, tank);
      return;
    }

    if (kind === 'algae') {
      await handleAssignAlgaeToTank(item, tank);
    }
  };

  const handleOpenIssueTankPicker = (kind, item) => {
    if (!user?.uid || !item) {
      return;
    }

    if (tanks.length === 0) {
      alert('Najpierw dodaj akwarium.');
      return;
    }

    if (tanks.length === 1) {
      const onlyTank = tanks[0];
      if (kind === 'disease') {
        handleAssignDiseaseToTank(item, onlyTank);
        return;
      }
      if (kind === 'plant_disease') {
        handleAssignPlantDiseaseToTank(item, onlyTank);
        return;
      }
      if (kind === 'algae') {
        handleAssignAlgaeToTank(item, onlyTank);
      }
      return;
    }

    setIssueTankPickerPayload({ kind, item });
    setIsIssueTankPickerVisible(true);
  };

  const handleAssignDiseaseToTank = async (disease, tank) => {
    if (!user?.uid || !tank || diseaseCaseBusy) {
      return;
    }

    setDiseaseCaseBusy(true);

    try {
      const schedule = buildDiseaseTreatmentSchedule(disease);
      const nextReviewAt =
        schedule[1]?.dueAt ??
        (() => {
          const review = new Date();
          review.setDate(review.getDate() + 1);
          return review;
        })();

      await addDoc(collection(db, 'tankDiseaseCases'), {
        userId: user.uid,
        tankId: tank.id,
        tankName: tank.name,
        caseType: 'disease',
        issueId: disease.id,
        issueName: disease.name,
        diseaseId: disease.id,
        diseaseName: disease.name,
        severity: disease.severity,
        diseaseSummary: disease.summary,
        causes: [],
        caution: disease.caution,
        treatmentPlan: disease.treatment.slice(0, 4),
        schedule,
        status: 'active',
        createdAt: new Date(),
        startedAt: new Date(),
        nextReviewAt,
      });

      if (selectedTank?.id === tank.id) {
        await fetchTankDiseaseCases(user.uid, tank.id);
      }

      alert(`Dodano do akwarium "${tank.name}". Szczegoly pojawily sie w sekcji akwarium.`);
    } catch (error) {
      alert(
        'Blad dodawania choroby do akwarium: ' +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setDiseaseCaseBusy(false);
    }
  };

  const handleAddDiseaseToAquarium = (disease) => {
    handleOpenIssueTankPicker('disease', disease);
  };

  const handleAssignPlantDiseaseToTank = async (disease, tank) => {
    if (!user?.uid || !tank || diseaseCaseBusy) {
      return;
    }

    setDiseaseCaseBusy(true);

    try {
      const schedule = buildPlantDiseaseTreatmentSchedule(disease);
      const nextReviewAt =
        schedule[1]?.dueAt ??
        (() => {
          const review = new Date();
          review.setDate(review.getDate() + 2);
          return review;
        })();

      await addDoc(collection(db, 'tankDiseaseCases'), {
        userId: user.uid,
        tankId: tank.id,
        tankName: tank.name,
        caseType: 'plant_disease',
        issueId: disease.id,
        issueName: disease.name,
        diseaseId: disease.id,
        diseaseName: disease.name,
        severity: disease.severity,
        diseaseSummary: disease.summary,
        causes: [],
        caution: disease.caution,
        treatmentPlan: disease.treatment.slice(0, 4),
        schedule,
        status: 'active',
        createdAt: new Date(),
        startedAt: new Date(),
        nextReviewAt,
      });

      if (selectedTank?.id === tank.id) {
        await fetchTankDiseaseCases(user.uid, tank.id);
      }

      alert(`Dodano chorobe roslin do akwarium "${tank.name}". Szczegoly pojawily sie w sekcji akwarium.`);
    } catch (error) {
      alert(
        'Blad dodawania choroby roslin do akwarium: ' +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setDiseaseCaseBusy(false);
    }
  };

  const handleAddPlantDiseaseToAquarium = (disease) => {
    handleOpenIssueTankPicker('plant_disease', disease);
  };

  const handleAssignAlgaeToTank = async (algae, tank) => {
    if (!user?.uid || !tank || diseaseCaseBusy) {
      return;
    }

    setDiseaseCaseBusy(true);

    try {
      const schedule = buildAlgaeTreatmentSchedule(algae);
      const nextReviewAt =
        schedule[1]?.dueAt ??
        (() => {
          const review = new Date();
          review.setDate(review.getDate() + 2);
          return review;
        })();

      const treatmentPlan = [
        ...algae.removeActions.slice(0, 3),
        ...algae.preventionActions.slice(0, 3),
      ];

      await addDoc(collection(db, 'tankDiseaseCases'), {
        userId: user.uid,
        tankId: tank.id,
        tankName: tank.name,
        caseType: 'algae',
        issueId: algae.id,
        issueName: algae.name,
        diseaseId: algae.id,
        diseaseName: algae.name,
        severity: algae.severity,
        diseaseSummary: algae.summary,
        causes: algae.causes,
        caution: algae.caution,
        treatmentPlan,
        schedule,
        status: 'active',
        createdAt: new Date(),
        startedAt: new Date(),
        nextReviewAt,
      });

      if (selectedTank?.id === tank.id) {
        await fetchTankDiseaseCases(user.uid, tank.id);
      }

      alert(`Dodano glony do akwarium "${tank.name}". Szczegoly pojawily sie w sekcji akwarium.`);
    } catch (error) {
      alert(
        'Blad dodawania glonow do akwarium: ' +
          (error instanceof Error ? error.message : '')
      );
    } finally {
      setDiseaseCaseBusy(false);
    }
  };

  const handleAddAlgaeToAquarium = (algae) => {
    handleOpenIssueTankPicker('algae', algae);
  };

  const handleOpenDiseaseImageModal = useCallback((disease) => {
    const imageUri = String(disease?.imageUrl ?? disease?.imagePreviewUrl ?? '').trim();
    const fallbackUri = String(
      disease?.imageFallbackUrl ?? disease?.imageFallbackPreviewUrl ?? ''
    ).trim();
    if (!imageUri) {
      return;
    }

    setDiseaseImageModalUri(imageUri);
    setDiseaseImageModalFallbackUri(
      fallbackUri && fallbackUri !== imageUri ? fallbackUri : ''
    );
    setDiseaseImageModalLoadStage(0);
    setDiseaseImageModalTitle(String(disease?.name ?? '').trim());
    setDiseaseImageZoomLevel(1);
    setIsDiseaseImageModalVisible(true);
  }, []);
  const handleCloseDiseaseImageModal = useCallback(() => {
    setIsDiseaseImageModalVisible(false);
    setDiseaseImageModalLoadStage(0);
    setDiseaseImageModalFallbackUri('');
    setDiseaseImageZoomLevel(1);
  }, []);

  const handleDiseasePreviewImageError = useCallback(
    (diseaseId, errorMessage, stage = 0) => {
      if (!diseaseId) {
        return;
      }

      if (errorMessage && stage >= 1) {
        console.warn(
          `Nie udalo sie zaladowac miniatury choroby (${diseaseId}, etap ${stage + 1}):`,
          errorMessage
        );
      }

      setDiseasePreviewLoadStageById((prev) => {
        const currentStage = Number(prev[diseaseId] ?? 0);
        const nextStage = Math.min(
          2,
          Math.max(currentStage, Number(stage) || 0) + 1
        );

        if (nextStage === currentStage) {
          return prev;
        }

        return {
          ...prev,
          [diseaseId]: nextStage,
        };
      });
    },
    []
  );

  const handleDiseaseModalImageError = useCallback((errorMessage) => {
    setDiseaseImageModalLoadStage((prevStage) => {
      const nextStage = Math.min(2, prevStage + 1);
      if (errorMessage && prevStage >= 1) {
        console.warn(
          `Nie udalo sie zaladowac zdjecia choroby (etap ${prevStage + 1}):`,
          errorMessage
        );
      }
      return nextStage;
    });
  }, []);

  const handleZoomInDiseaseImage = useCallback(() => {
    setDiseaseImageZoomLevel((prev) => Math.min(3.5, Number((prev + 0.25).toFixed(2))));
  }, []);

  const handleZoomOutDiseaseImage = useCallback(() => {
    setDiseaseImageZoomLevel((prev) => Math.max(1, Number((prev - 0.25).toFixed(2))));
  }, []);

  const handleResetDiseaseImageZoom = useCallback(() => {
    setDiseaseImageZoomLevel(1);
  }, []);

  const handleSetThemeMode = (themeMode) => {
    if (themeMode !== 'light' && themeMode !== 'dark') {
      return;
    }

    updateAppSettings({ themeMode });
  };

  const handleSetLanguage = (language) => {
    if (!language) {
      return;
    }

    updateAppSettings({ language });
  };

  const handleSubscriptionTierManualChange = (tier) => {
    if (!canManualSwitchSubscriptionPlan) {
      alert(t('settingsSubscriptionManualSwitchUnavailable'));
      return;
    }

    const switchedInLocalMode = setSubscriptionTier(tier);
    if (switchedInLocalMode) {
      return;
    }

    const switchedAsAdminOverride = applyAdminSubscriptionTier(tier);
    if (!switchedAsAdminOverride) {
      alert(t('settingsSubscriptionManualSwitchUnavailable'));
    }
  };

  const handleToggleMeasurementPrefillFromLast = () => {
    updateAppSettings((prev) => ({
      prefillMeasurementFromLast: !Boolean(prev.prefillMeasurementFromLast),
    }));
  };

  const handleToggleEnabledTest = (testKey) => {
    if (!testKey) {
      return;
    }

    if (!canAccessMeasurementKey(testKey)) {
      const requiredTier = requiredPlanByParameterKey.get(testKey);
      const requiredPlanLabel =
        requiredTier === 'premium'
          ? t('settingsSubscriptionTierPremium')
          : requiredTier === 'pro'
            ? t('settingsSubscriptionTierPro')
            : t('settingsSubscriptionTierFree');
      const parameterLabel =
        TEST_PARAMETER_OPTIONS.find((item) => item.key === testKey)?.label ??
        testKey;

      alert(
        t('subscriptionParameterLocked', {
          parameter: parameterLabel,
          plan: requiredPlanLabel,
        })
      );
      return;
    }

    const currentEnabledTests = activeEnabledTests ?? {};
    const currentlyEnabledCount = TEST_PARAMETER_OPTIONS.filter(
      (item) => currentEnabledTests[item.key]
    ).length;
    const isCurrentlyEnabled = Boolean(currentEnabledTests[testKey]);

    if (isCurrentlyEnabled && currentlyEnabledCount <= 1) {
      alert(t('settingsAtLeastOneTest'));
      return;
    }

    const nextValue = !isCurrentlyEnabled;

    updateAppSettings({
      enabledTests: {
        [testKey]: nextValue,
      },
    });

    if (!nextValue) {
      if (testKey === 'ph') setPh('');
      if (testKey === 'gh') setGh('');
      if (testKey === 'kh') setKh('');
      if (testKey === 'ca') setCa('');
      if (testKey === 'mg') setMg('');
      if (testKey === 'no2') setNo2('');
      if (testKey === 'no3') setNo3('');
      if (testKey === 'nh3nh4') setNh3Nh4('');
      if (testKey === 'po4') setPo4('');
      if (testKey === 'fe') setFe('');
      if (testKey === 'temperature') setTemperature('');
    }
  };

  const authProviderIds = useMemo(
    () =>
      (user?.providerData ?? [])
        .map((provider) => String(provider?.providerId ?? '').trim())
        .filter(Boolean),
    [user?.providerData]
  );
  const hasPasswordSignInProvider = authProviderIds.includes('password');
  const hasGoogleSignInProvider = authProviderIds.includes('google.com');

  const handleCloseDeleteAccountReauthModal = useCallback(() => {
    if (deleteAccountBusy || deleteAccountReauthBusy) {
      return;
    }

    setDeleteAccountReauthPassword('');
    setIsDeleteAccountReauthModalVisible(false);
  }, [deleteAccountBusy, deleteAccountReauthBusy]);

  const handleDeleteAccountConfirmed = useCallback(
    async (allowReauthPrompt = true) => {
      if (!user?.uid || deleteAccountBusy) {
        return false;
      }

      setDeleteAccountBusy(true);

      try {
        const userId = user.uid;
        const deleteByUserId = async (collectionName) => {
          const dataQuery = query(
            collection(db, collectionName),
            where('userId', '==', userId)
          );
          const snapshot = await getDocs(dataQuery);
          await Promise.all(
            snapshot.docs.map((item) =>
              deleteDoc(doc(db, collectionName, item.id))
            )
          );
        };

        await Promise.all([
          deleteByUserId('measurements'),
          deleteByUserId('stockItems'),
          deleteByUserId('tankDiseaseCases'),
          deleteByUserId('tanks'),
        ]);

        const selectedTankStorageKey = getSelectedTankStorageKey(userId);
        await AsyncStorage.removeItem(selectedTankStorageKey).catch(() => {});

        const currentAuthUser = auth.currentUser;
        if (!currentAuthUser || currentAuthUser.uid !== userId) {
          throw new Error(t('deleteAccountReauthSessionMissing'));
        }

        await deleteUser(currentAuthUser);
        setIsAccountDeletedScreenVisible(true);
        return true;
      } catch (error) {
        const errorCode =
          error && typeof error === 'object' && 'code' in error
            ? String(error.code)
            : '';

        if (errorCode === 'auth/requires-recent-login') {
          if (allowReauthPrompt) {
            setDeleteAccountReauthPassword('');
            setIsDeleteAccountReauthModalVisible(true);
          }
          alert(t('deleteAccountRequiresRecentLogin'));
          return false;
        }

        alert(
          t('deleteAccountError', {
            value: error instanceof Error ? error.message : String(error ?? ''),
          })
        );
        return false;
      } finally {
        setDeleteAccountBusy(false);
      }
    },
    [deleteAccountBusy, t, user?.uid]
  );

  useEffect(() => {
    deleteAccountConfirmedRef.current = handleDeleteAccountConfirmed;
  }, [handleDeleteAccountConfirmed]);

  const handleDeleteAccount = () => {
    if (!user?.uid || deleteAccountBusy) {
      return;
    }

    Alert.alert(
      t('deleteAccountConfirmTitle'),
      t('deleteAccountConfirmMessage'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('deleteAccountConfirmAction'),
          style: 'destructive',
          onPress: () => {
            handleDeleteAccountConfirmed(true);
          },
        },
      ]
    );
  };

  const handleDeleteAccountReauthWithPassword = async () => {
    if (deleteAccountBusy || deleteAccountReauthBusy) {
      return;
    }

    const currentAuthUser = auth.currentUser;
    const userEmail = String(currentAuthUser?.email ?? '').trim();
    const normalizedPassword = deleteAccountReauthPassword.trim();

    if (!currentAuthUser) {
      alert(t('deleteAccountReauthSessionMissing'));
      return;
    }

    if (!userEmail) {
      alert(t('deleteAccountReauthEmailMissing'));
      return;
    }

    if (!normalizedPassword) {
      alert(t('deleteAccountReauthPasswordRequired'));
      return;
    }

    setDeleteAccountReauthBusy(true);
    try {
      const credential = EmailAuthProvider.credential(userEmail, normalizedPassword);
      await reauthenticateWithCredential(currentAuthUser, credential);
      setDeleteAccountReauthPassword('');
      setIsDeleteAccountReauthModalVisible(false);
      await handleDeleteAccountConfirmed(false);
    } catch (error) {
      const errorCode =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : '';

      if (
        errorCode === 'auth/wrong-password' ||
        errorCode === 'auth/invalid-credential'
      ) {
        alert(t('deleteAccountReauthInvalidPassword'));
        return;
      }

      if (errorCode === 'auth/too-many-requests') {
        alert(t('deleteAccountReauthTooManyRequests'));
        return;
      }

      alert(
        t('deleteAccountReauthGenericError', {
          value: error instanceof Error ? error.message : String(error ?? ''),
        })
      );
    } finally {
      setDeleteAccountReauthBusy(false);
    }
  };

  const handleDeleteAccountReauthWithGoogle = () => {
    if (deleteAccountBusy || deleteAccountReauthBusy) {
      return;
    }

    handleGoogleAuth('reauth-delete-account');
  };

  const handleCloseTankIssueCase = (caseItem) => {
    if (!caseItem?.id || !user?.uid || !selectedTank?.id || diseaseCaseBusy) {
      return;
    }

    const caseType = String(caseItem.caseType ?? 'disease').toLowerCase();
    const isAlgaeCase = caseType === 'algae';
    const isPlantDiseaseCase = caseType === 'plant_disease';
    const actionLabel = isAlgaeCase ? 'usuniete' : 'wyleczone';
    const nextStatus = isAlgaeCase ? 'removed' : 'resolved';
    const confirmLabel = isAlgaeCase
      ? 'Oznacz jako usuniete'
      : 'Oznacz jako wyleczone';
    const successLabel = isAlgaeCase
      ? 'Problem z glonami oznaczono jako usuniety.'
      : isPlantDiseaseCase
        ? 'Chorobe roslin oznaczono jako wyleczona.'
        : 'Chorobe oznaczono jako wyleczona.';

    Alert.alert(
      confirmLabel,
      `Czy na pewno chcesz oznaczyc "${caseItem.issueName ?? 'pozycja'}" jako ${actionLabel}?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Potwierdz',
          style: 'destructive',
          onPress: async () => {
            if (!caseItem?.id || !user?.uid || !selectedTank?.id || diseaseCaseBusy) {
              return;
            }

            setDiseaseCaseBusy(true);

            try {
              await updateDoc(doc(db, 'tankDiseaseCases', caseItem.id), {
                status: nextStatus,
                closedAt: new Date(),
                closedReason: nextStatus,
              });
              await fetchTankDiseaseCases(user.uid, selectedTank.id);
              await fetchHomeData(user.uid);
              if (isAlgaeCase) {
                setExpandedAlgaeCaseId((prev) => (prev === caseItem.id ? null : prev));
              } else if (isPlantDiseaseCase) {
                setExpandedPlantDiseaseCaseId((prev) =>
                  prev === caseItem.id ? null : prev
                );
              } else {
                setExpandedDiseaseCaseId((prev) => (prev === caseItem.id ? null : prev));
              }
              alert(successLabel);
            } catch (error) {
              alert(
                'Blad aktualizacji statusu: ' +
                  (error instanceof Error ? error.message : '')
              );
            } finally {
              setDiseaseCaseBusy(false);
            }
          },
        },
      ]
    );
  };

  const isHomeSection = activeSection === 'home';
  const isReviewSection = activeSection === 'review';
  const isHistorySection = activeSection === 'history';
  const isTankSection = activeSection === 'tank';
  const isTankInfoSection = activeSection === 'tankInfo';
  const isFishSection = activeSection === 'fish';
  const isPlantSection = activeSection === 'plant';
  const isIssuesSection = activeSection === 'issues';
  const isDiseaseSection = activeSection === 'disease';
  const isPlantDiseaseSection = activeSection === 'plantDisease';
  const isAlgaeSection = activeSection === 'algae';
  const isSettingsSection = activeSection === 'settings';
  const availableMeasurementTests = useMemo(
    () =>
      TEST_PARAMETER_OPTIONS.reduce((acc, option) => {
        if (canAccessMeasurementKey(option.key)) {
          acc[option.key] = true;
        }

        return acc;
      }, {}),
    [canAccessMeasurementKey]
  );
  const activeEnabledTests = useMemo(
    () =>
      TEST_PARAMETER_OPTIONS.reduce((acc, option) => {
        if (
          availableMeasurementTests[option.key] &&
          Boolean(appSettings.enabledTests?.[option.key])
        ) {
          acc[option.key] = true;
        }

        return acc;
      }, {}),
    [appSettings.enabledTests, availableMeasurementTests]
  );
  const visibleMeasurementOptionLabels = useMemo(
    () =>
      TEST_PARAMETER_OPTIONS.filter((item) => activeEnabledTests[item.key]).map(
        (item) => item.label
      ),
    [activeEnabledTests]
  );
  const allowedTestParameterOptions = useMemo(
    () =>
      TEST_PARAMETER_OPTIONS.filter(
        (item) => availableMeasurementTests[item.key]
      ),
    [availableMeasurementTests]
  );
  const enabledAllowedTestCount = useMemo(
    () =>
      allowedTestParameterOptions.filter((item) => activeEnabledTests[item.key]).length,
    [activeEnabledTests, allowedTestParameterOptions]
  );
  const requiredPlanByParameterKey = useMemo(() => {
    const map = new Map();

    TEST_PARAMETER_OPTIONS.forEach((option) => {
      const firstMatchingPlan = subscriptionPlans.find((plan) =>
        plan.entitlements.measurementKeys.includes(option.key)
      );

      if (firstMatchingPlan) {
        map.set(option.key, firstMatchingPlan.tier);
      }
    });

    return map;
  }, [subscriptionPlans]);
  const isAquariumSection =
    isReviewSection || isTankInfoSection || isFishSection || isPlantSection;
  const isHealthSection =
    isIssuesSection || isDiseaseSection || isPlantDiseaseSection || isAlgaeSection;
  const isHealthCatalogMode = isHealthSection && sectionEntrySource === 'menu';
  const isHealthTankMode = isHealthSection && !isHealthCatalogMode;
  const isFishDiseaseCatalogMode =
    isHealthCatalogMode && (isIssuesSection || isDiseaseSection);
  const isPlantDiseaseCatalogMode =
    isHealthCatalogMode && (isIssuesSection || isPlantDiseaseSection);
  const isAlgaeCatalogMode =
    isHealthCatalogMode &&
    (isIssuesSection || isAlgaeSection);
  const showHeaderTankSwitcher =
    !isHealthCatalogMode &&
    !isHomeSection &&
    !isSettingsSection &&
    Boolean(selectedTank) &&
    tanks.length > 1;
  const selectedTankLiters = Number(selectedTank?.liters);
  const currentMeasurement = useMemo(() => measurements[0] ?? null, [measurements]);
  const selectedTankEnvironmentProfile = useMemo(
    () => buildTankEnvironmentProfile(selectedTank),
    [selectedTank]
  );
  const currentEquipmentAssessmentForContext = useMemo(
    () => buildTankEquipmentAssessment(selectedTank, EQUIPMENT_CATALOG),
    [selectedTank]
  );
  const currentContextInsights = useMemo(
    () =>
      buildContextualEcosystemInsights({
        measurement: currentMeasurement,
        enabledTests: availableMeasurementTests,
        stockItems,
        tank: selectedTank,
        equipmentAssessment: currentEquipmentAssessmentForContext,
      }),
    [
      availableMeasurementTests,
      currentEquipmentAssessmentForContext,
      currentMeasurement,
      selectedTank,
      stockItems,
    ]
  );
  const currentBaseAnalysis = useMemo(
    () => {
      if (!currentMeasurement) {
        return null;
      }

      return analyzeMeasurementLogic(
        currentMeasurement,
        availableMeasurementTests
      );
    },
    [availableMeasurementTests, currentMeasurement]
  );
  const currentAnalysis = useMemo(
    () => mergeWaterAnalysisWithContext(currentBaseAnalysis, currentContextInsights),
    [currentBaseAnalysis, currentContextInsights]
  );
  const currentMeasurementDetailRows = useMemo(
    () => buildMeasurementDetailRows(currentMeasurement, availableMeasurementTests),
    [availableMeasurementTests, currentMeasurement]
  );
  const currentMeasurementIssueSeverityByKey = useMemo(() => {
    const map = new Map();

    if (!currentMeasurement) {
      return map;
    }

    const setSeverity = (key, severity) => {
      if (!key || !severity || severity === 'ok') {
        return;
      }

      const existingSeverity = map.get(key);
      if (
        !existingSeverity ||
        getAnalysisSeverityRank(severity) >
          getAnalysisSeverityRank(existingSeverity)
      ) {
        map.set(key, severity);
      }
    };

    currentMeasurementDetailRows.forEach((item) => {
      const rowKey = String(item?.key ?? '');
      const directSeverity = getMeasurementSeverityFromValue(rowKey, item?.value);
      setSeverity(rowKey, directSeverity);
    });

    return map;
  }, [
    currentMeasurement,
    currentMeasurementDetailRows,
  ]);
  const currentRiskNotes = useMemo(
    () => {
      if (!currentMeasurement) {
        return [];
      }

      const baseRiskNotes = buildCurrentRiskNotesLogic(
        currentMeasurement,
        selectedTankEnvironmentProfile
      );
      const extraRiskNotes = currentContextInsights?.riskNotes ?? [];

      const unique = [];
      const seen = new Set();
      [...baseRiskNotes, ...extraRiskNotes].forEach((item) => {
        const key = String(item?.text ?? '')
          .trim()
          .toLowerCase();

        if (!key || seen.has(key)) {
          return;
        }

        seen.add(key);
        unique.push(item);
      });

      return unique
        .sort(
          (a, b) =>
            getAnalysisSeverityRank(b?.severity) - getAnalysisSeverityRank(a?.severity)
        )
        .slice(0, 6);
    },
    [currentContextInsights, currentMeasurement, selectedTankEnvironmentProfile]
  );
  const currentMeasurementRecommendationsByKey = useMemo(() => {
    const map = new Map();

    (currentAnalysis?.recommendations ?? []).forEach((recommendation) => {
      const keys = getMeasurementKeysFromRecommendationParameter(
        recommendation?.parameter
      );

      keys.forEach((key) => {
        const currentItems = map.get(key) ?? [];
        currentItems.push(recommendation);
        currentItems.sort(
          (a, b) =>
            getAnalysisSeverityRank(b?.severity) - getAnalysisSeverityRank(a?.severity)
        );
        map.set(key, currentItems);
      });
    });

    return map;
  }, [currentAnalysis]);
  const handleOpenMeasurementTileDetails = useCallback(
    (item) => {
      if (!item?.key) {
        return;
      }

      const key = String(item.key);
      const severity = currentMeasurementIssueSeverityByKey.get(key) ?? 'ok';
      const recommendations = currentMeasurementRecommendationsByKey.get(key) ?? [];
      const primaryRecommendation = recommendations[0] ?? null;
      const relatedRiskNotes = currentRiskNotes
        .filter((risk) => {
          const keys = getMeasurementKeysFromRecommendationParameter(risk?.text);
          return keys.includes(key);
        })
        .map((risk) => risk.text)
        .slice(0, 3);

      setSelectedMeasurementTileDetails({
        key,
        label: item.label,
        value: formatLatestTrendValue(item.value),
        severity,
        range:
          primaryRecommendation?.expectedRange ?? getMeasurementTargetRangeLabel(key),
        action:
          primaryRecommendation?.action ??
          getMeasurementDefaultAction(key, severity),
        impact:
          primaryRecommendation?.issue ??
          getMeasurementDefaultImpact(key, severity),
        relatedRiskNotes,
      });
    },
    [
      currentMeasurementIssueSeverityByKey,
      currentMeasurementRecommendationsByKey,
      currentRiskNotes,
    ]
  );
  const waterTestingSchedule = useMemo(
    () => buildWaterTestingScheduleLogic(measurements, availableMeasurementTests),
    [availableMeasurementTests, measurements]
  );
  const tankOnboardingPlan = useMemo(
    () =>
      buildTankOnboardingPlan(
        selectedTank,
        measurements,
        availableMeasurementTests
      ),
    [availableMeasurementTests, measurements, selectedTank]
  );
  const selectedTankOnboardingTaskChecks = useMemo(
    () => normalizeOnboardingTaskChecks(selectedTank?.onboardingTaskChecks),
    [selectedTank]
  );
  const visibleOnboardingRows = useMemo(
    () =>
      tankOnboardingPlan.rows.filter(
        (row) =>
          row.status !== 'upcoming' &&
          !Boolean(selectedTankOnboardingTaskChecks[row.id])
      ),
    [selectedTankOnboardingTaskChecks, tankOnboardingPlan.rows]
  );
  const completedOnboardingRows = useMemo(
    () =>
      tankOnboardingPlan.rows.filter((row) =>
        Boolean(selectedTankOnboardingTaskChecks[row.id])
      ),
    [selectedTankOnboardingTaskChecks, tankOnboardingPlan.rows]
  );
  const enabledHistoryChartParameters = useMemo(() => {
    const enabledTestsMap = availableMeasurementTests;
    return HISTORY_CHART_PARAMETERS.filter((item) => {
      const hasAccess =
        item.key === 'co2'
          ? Boolean(enabledTestsMap.ph && enabledTestsMap.kh)
          : Boolean(enabledTestsMap[item.key]);

      if (!hasAccess) {
        return false;
      }

      const hasData = measurements.some((measurementItem) => {
        const value = getMeasurementNumericValue(measurementItem, item.key);
        return Number.isFinite(value);
      });

      if (!hasData) {
        return false;
      }

      if (item.key === 'co2') {
        return true;
      }
      return true;
    });
  }, [availableMeasurementTests, measurements]);
  useEffect(() => {
    if (enabledHistoryChartParameters.length === 0) {
      return;
    }

    const hasSelected = enabledHistoryChartParameters.some(
      (item) => item.key === selectedHistoryChartParameter
    );

    if (!hasSelected) {
      setSelectedHistoryChartParameter(enabledHistoryChartParameters[0].key);
    }
  }, [enabledHistoryChartParameters, selectedHistoryChartParameter]);
  const selectedHistoryChartMeta = useMemo(
    () =>
      enabledHistoryChartParameters.find(
        (item) => item.key === selectedHistoryChartParameter
      ) ?? enabledHistoryChartParameters[0] ?? HISTORY_CHART_PARAMETERS[0],
    [enabledHistoryChartParameters, selectedHistoryChartParameter]
  );
  const historyChartData = useMemo(() => {
    const historyChartTopPadding = 8;
    const historyChartBottomPadding = 24;
    const historyChartAreaHeight = 136;

    if (!isHistorySection) {
      return {
        series: [],
        latestValue: null,
        latestColor: getHistoryChartColorByStatus('neutral'),
        rawMin: 0,
        rawMax: 0,
        displayMin: 0,
        displayMax: 1,
        points: [],
        segments: [],
        hasLine: false,
        firstDateMs: 0,
        lastDateMs: 0,
        topPadding: historyChartTopPadding,
        bottomPadding: historyChartBottomPadding,
        areaHeight: historyChartAreaHeight,
      };
    }

    const series = measurements
      .map((item) => {
        const createdAtMs = getCreatedAtMs(item.createdAt);
        const value = getMeasurementNumericValue(item, selectedHistoryChartMeta.key);

        return {
          id: item.id,
          createdAtMs,
          value,
        };
      })
      .filter((item) => Number.isFinite(item.value) && item.createdAtMs > 0)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);

    const historyChartValues = series.map((item) => item.value);
    const latestValue =
      historyChartValues.length > 0
        ? historyChartValues[historyChartValues.length - 1]
        : null;
    const latestStatus = getHistoryChartValueStatus(
      selectedHistoryChartMeta.key,
      latestValue
    );
    const isNonNegativeParameter =
      selectedHistoryChartMeta.key !== 'ph' &&
      selectedHistoryChartMeta.key !== 'temperature';
    const rawHistoryChartMin =
      historyChartValues.length > 0 ? Math.min(...historyChartValues) : 0;
    const rawHistoryChartMax =
      historyChartValues.length > 0 ? Math.max(...historyChartValues) : 0;
    const baseHistoryChartSpan = Math.max(
      rawHistoryChartMax - rawHistoryChartMin,
      0
    );
    const historyChartPadding =
      baseHistoryChartSpan > 0
        ? baseHistoryChartSpan * 0.15
        : Math.max(Math.abs(rawHistoryChartMax) * 0.1, 1);
    const displayMin = isNonNegativeParameter
      ? Math.max(0, rawHistoryChartMin - historyChartPadding)
      : rawHistoryChartMin - historyChartPadding;
    const displayMax = rawHistoryChartMax + historyChartPadding;
    const historyChartRange =
      displayMax - displayMin > 0 ? displayMax - displayMin : 1;
    const chartWidthSafe = Math.max(historyChartWidth - 2, 1);
    const points = series.map((item, index) => {
      const x =
        series.length <= 1
          ? chartWidthSafe / 2
          : (index / (series.length - 1)) * chartWidthSafe;
      const normalized = (item.value - displayMin) / historyChartRange;
      const clamped = Math.min(1, Math.max(0, normalized));
      const y = historyChartTopPadding + (1 - clamped) * historyChartAreaHeight;
      const status = getHistoryChartValueStatus(selectedHistoryChartMeta.key, item.value);

      return {
        ...item,
        x,
        y,
        status,
        color: getHistoryChartColorByStatus(status),
      };
    });
    const segments = points.slice(1).map((point, index) => {
      const prev = points[index];
      const dx = point.x - prev.x;
      const dy = point.y - prev.y;
      const width = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      const segmentStatus =
        getHistoryChartStatusRank(prev.status) >=
        getHistoryChartStatusRank(point.status)
          ? prev.status
          : point.status;

      return {
        id: `${prev.id}-${point.id}`,
        width,
        angle,
        left: (prev.x + point.x) / 2 - width / 2,
        top: (prev.y + point.y) / 2,
        color: getHistoryChartColorByStatus(segmentStatus),
      };
    });

    return {
      series,
      latestValue,
      latestColor: getHistoryChartColorByStatus(latestStatus),
      rawMin: rawHistoryChartMin,
      rawMax: rawHistoryChartMax,
      displayMin,
      displayMax,
      points,
      segments,
      hasLine: points.length >= 2 && historyChartWidth > 10,
      firstDateMs: series[0]?.createdAtMs ?? 0,
      lastDateMs: series[series.length - 1]?.createdAtMs ?? 0,
      topPadding: historyChartTopPadding,
      bottomPadding: historyChartBottomPadding,
      areaHeight: historyChartAreaHeight,
    };
  }, [
    historyChartWidth,
    isHistorySection,
    measurements,
    selectedHistoryChartMeta,
  ]);
  const historyChartSeries = historyChartData.series;
  const historyChartLatestValue = historyChartData.latestValue;
  const historyChartLatestColor = historyChartData.latestColor;
  const rawHistoryChartMin = historyChartData.rawMin;
  const rawHistoryChartMax = historyChartData.rawMax;
  const historyChartDisplayMin = historyChartData.displayMin;
  const historyChartDisplayMax = historyChartData.displayMax;
  const historyChartPoints = historyChartData.points;
  const historyChartSegments = historyChartData.segments;
  const historyChartHasLine = historyChartData.hasLine;
  const historyChartFirstDateMs = historyChartData.firstDateMs;
  const historyChartLastDateMs = historyChartData.lastDateMs;
  const historyChartTopPadding = historyChartData.topPadding;
  const historyChartBottomPadding = historyChartData.bottomPadding;
  const historyChartAreaHeight = historyChartData.areaHeight;
  const historyChartAverageValue = useMemo(() => {
    if (historyChartSeries.length === 0) {
      return null;
    }

    const sum = historyChartSeries.reduce((acc, item) => acc + item.value, 0);
    return sum / historyChartSeries.length;
  }, [historyChartSeries]);
  const historyChartDeltaValue = useMemo(() => {
    if (historyChartSeries.length < 2) {
      return null;
    }

    return (
      historyChartSeries[historyChartSeries.length - 1].value -
      historyChartSeries[0].value
    );
  }, [historyChartSeries]);
  const selectedDiseaseSymptomIds = useMemo(
    () =>
      DISEASE_SYMPTOMS.filter((item) => selectedDiseaseSymptoms[item.id]).map(
        (item) => item.id
      ),
    [selectedDiseaseSymptoms]
  );
  const selectedDiseaseSymptomLabels = useMemo(
    () =>
      DISEASE_SYMPTOMS.filter((item) => selectedDiseaseSymptoms[item.id]).map(
        (item) => item.label
      ),
    [selectedDiseaseSymptoms]
  );
  const diseaseSuggestions = useMemo(
    () => buildDiseaseSuggestions(selectedDiseaseSymptomIds),
    [selectedDiseaseSymptomIds]
  );
  const selectedPlantDiseaseSymptomIds = useMemo(
    () =>
      PLANT_DISEASE_SYMPTOMS.filter((item) => selectedPlantDiseaseSymptoms[item.id]).map(
        (item) => item.id
      ),
    [selectedPlantDiseaseSymptoms]
  );
  const selectedPlantDiseaseSymptomLabels = useMemo(
    () =>
      PLANT_DISEASE_SYMPTOMS.filter((item) => selectedPlantDiseaseSymptoms[item.id]).map(
        (item) => item.label
      ),
    [selectedPlantDiseaseSymptoms]
  );
  const plantDiseaseSuggestions = useMemo(
    () => buildPlantDiseaseSuggestions(selectedPlantDiseaseSymptomIds),
    [selectedPlantDiseaseSymptomIds]
  );
  const selectedAlgaeSymptomIds = useMemo(
    () =>
      ALGAE_SYMPTOMS.filter((item) => selectedAlgaeSymptoms[item.id]).map(
        (item) => item.id
      ),
    [selectedAlgaeSymptoms]
  );
  const selectedAlgaeSymptomLabels = useMemo(
    () =>
      ALGAE_SYMPTOMS.filter((item) => selectedAlgaeSymptoms[item.id]).map(
        (item) => item.label
      ),
    [selectedAlgaeSymptoms]
  );
  const algaeSuggestions = useMemo(
    () => buildAlgaeSuggestions(selectedAlgaeSymptomIds),
    [selectedAlgaeSymptomIds]
  );
  const hasDiseaseEmergencySignal =
    selectedDiseaseSymptoms.rapid_breathing ||
    selectedDiseaseSymptoms.sudden_deaths;
  const selectedCatalogFish = useMemo(
    () =>
      isFishSection && isEditingFish
        ? fishCatalog.find((item) => item.id === selectedCatalogFishId) ?? null
        : null,
    [fishCatalog, isEditingFish, isFishSection, selectedCatalogFishId]
  );
  const selectedCatalogPlant = useMemo(
    () =>
      isPlantSection && isEditingPlant
        ? plantCatalog.find((item) => item.id === selectedCatalogPlantId) ?? null
        : null,
    [isEditingPlant, isPlantSection, plantCatalog, selectedCatalogPlantId]
  );
  const selectedCatalogFishSchoolingProfile = useMemo(
    () =>
      selectedCatalogFish
        ? resolveFishSchoolingProfile(selectedCatalogFish)
        : null,
    [selectedCatalogFish]
  );
  const selectedCatalogFishAggressionConflicts = useMemo(
    () =>
      selectedCatalogFish
        ? stockItems
            .filter((item) => item.type === 'fish')
            .map((item) => ({
              item,
              conflict: getFishAggressionConflict(selectedCatalogFish, item),
            }))
            .filter((entry) => entry.conflict)
        : [],
    [selectedCatalogFish, stockItems]
  );
  const selectedCatalogFishSchoolingWarning = useMemo(() => {
    if (!selectedCatalogFishSchoolingProfile?.isSchooling) {
      return null;
    }

    const quantity = Number(fishQuantity);

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity >= selectedCatalogFishSchoolingProfile.minGroupSize
    ) {
      return null;
    }

    return {
      minGroupSize: selectedCatalogFishSchoolingProfile.minGroupSize,
    };
  }, [fishQuantity, selectedCatalogFishSchoolingProfile]);
  const filteredFishCatalog = useMemo(() => {
    if (!isFishSection || !isEditingFish) {
      return [];
    }

    const search = normalizeText(stockFishSearch);
    const filtered = fishCatalog.filter((item) => {
      if (!search) {
        return true;
      }

      return (
        normalizeText(item.commonName).includes(search) ||
        normalizeText(item.latinName).includes(search)
      );
    });

    if (!currentMeasurement) {
      return filtered.sort((a, b) =>
        compareCatalogEntryCommonNames(a, b, catalogSortLocale)
      );
    }

    const issueCountById = new Map(
      filtered.map((item) => [
        item.id,
        checkFishCompatibility(
          item,
          currentMeasurement,
          selectedTankLiters,
          selectedTankEnvironmentProfile
        ).length,
      ])
    );

    return filtered.sort((a, b) => {
      const aIssues = issueCountById.get(a.id) ?? 0;
      const bIssues = issueCountById.get(b.id) ?? 0;
      const aFits = aIssues === 0;
      const bFits = bIssues === 0;

      if (aFits !== bFits) {
        return aFits ? -1 : 1;
      }

      if (aIssues !== bIssues) {
        return aIssues - bIssues;
      }

      return compareCatalogEntryCommonNames(a, b, catalogSortLocale);
    });
  }, [
    catalogSortLocale,
    currentMeasurement,
    fishCatalog,
    isEditingFish,
    isFishSection,
    selectedTankEnvironmentProfile,
    selectedTankLiters,
    stockFishSearch,
  ]);
  const filteredPlantCatalog = useMemo(() => {
    if (!isPlantSection || !isEditingPlant) {
      return [];
    }

    const search = normalizeText(stockPlantSearch);
    const filtered = plantCatalog.filter((item) => {
      if (!search) {
        return true;
      }

      return (
        normalizeText(item.commonName).includes(search) ||
        normalizeText(item.latinName).includes(search)
      );
    });

    if (!currentMeasurement) {
      return filtered.sort((a, b) =>
        compareCatalogEntryCommonNames(a, b, catalogSortLocale)
      );
    }

    const issueCountById = new Map(
      filtered.map((item) => [
        item.id,
        checkPlantCompatibility(
          item,
          currentMeasurement,
          selectedTankLiters,
          selectedTankEnvironmentProfile
        ).length,
      ])
    );

    return filtered.sort((a, b) => {
      const aIssues = issueCountById.get(a.id) ?? 0;
      const bIssues = issueCountById.get(b.id) ?? 0;
      const aFits = aIssues === 0;
      const bFits = bIssues === 0;

      if (aFits !== bFits) {
        return aFits ? -1 : 1;
      }

      if (aIssues !== bIssues) {
        return aIssues - bIssues;
      }

      return compareCatalogEntryCommonNames(a, b, catalogSortLocale);
    });
  }, [
    catalogSortLocale,
    currentMeasurement,
    isEditingPlant,
    isPlantSection,
    plantCatalog,
    selectedTankEnvironmentProfile,
    selectedTankLiters,
    stockPlantSearch,
  ]);
  const visibleFilteredFishCatalog = useMemo(() => {
    if (
      !ENABLE_FISH_IMAGES ||
      !IS_IOS_EXPO_GO ||
      String(stockFishSearch ?? '').trim().length > 0
    ) {
      return filteredFishCatalog;
    }

    return filteredFishCatalog.slice(0, CATALOG_EAGER_RENDER_LIMIT);
  }, [filteredFishCatalog, stockFishSearch]);
  const visibleFilteredPlantCatalog = useMemo(() => {
    if (
      !ENABLE_PLANT_IMAGES ||
      !IS_IOS_EXPO_GO ||
      String(stockPlantSearch ?? '').trim().length > 0
    ) {
      return filteredPlantCatalog;
    }

    return filteredPlantCatalog.slice(0, CATALOG_EAGER_RENDER_LIMIT);
  }, [filteredPlantCatalog, stockPlantSearch]);
  const fishCatalogCompatibilityById = useMemo(() => {
    const map = new Map();

    if (!isFishSection || !isEditingFish) {
      return map;
    }

    for (const fish of visibleFilteredFishCatalog) {
      map.set(
        fish.id,
        checkFishCompatibility(
          fish,
          currentMeasurement,
          selectedTankLiters,
          selectedTankEnvironmentProfile
        )
      );
    }

    if (selectedCatalogFish && !map.has(selectedCatalogFish.id)) {
      map.set(
        selectedCatalogFish.id,
        checkFishCompatibility(
          selectedCatalogFish,
          currentMeasurement,
          selectedTankLiters,
          selectedTankEnvironmentProfile
        )
      );
    }

    return map;
  }, [
    currentMeasurement,
    visibleFilteredFishCatalog,
    isEditingFish,
    isFishSection,
    selectedCatalogFish,
    selectedTankEnvironmentProfile,
    selectedTankLiters,
  ]);
  const plantCatalogCompatibilityById = useMemo(() => {
    const map = new Map();

    if (!isPlantSection || !isEditingPlant) {
      return map;
    }

    for (const plant of visibleFilteredPlantCatalog) {
      map.set(
        plant.id,
        checkPlantCompatibility(
          plant,
          currentMeasurement,
          selectedTankLiters,
          selectedTankEnvironmentProfile
        )
      );
    }

    if (selectedCatalogPlant && !map.has(selectedCatalogPlant.id)) {
      map.set(
        selectedCatalogPlant.id,
        checkPlantCompatibility(
          selectedCatalogPlant,
          currentMeasurement,
          selectedTankLiters,
          selectedTankEnvironmentProfile
        )
      );
    }

    return map;
  }, [
    currentMeasurement,
    visibleFilteredPlantCatalog,
    isEditingPlant,
    isPlantSection,
    selectedCatalogPlant,
    selectedTankEnvironmentProfile,
    selectedTankLiters,
  ]);
  const fishCompatibilityResults = useMemo(
    () =>
      stockItems
        .filter((item) => item.type === 'fish')
        .map((item) => {
          const issues = checkFishCompatibility(
            item,
            currentMeasurement,
            selectedTankLiters,
            selectedTankEnvironmentProfile
          );

          return {
            id: item.id,
            label: `${item.commonName ?? item.name} (${item.latinName ?? t('noDataCaps')})`,
            issues,
          };
        }),
    [currentMeasurement, selectedTankEnvironmentProfile, selectedTankLiters, stockItems, t]
  );
  const fishCatalogById = useMemo(
    () => new Map(fishCatalog.map((item) => [item.id, item])),
    [fishCatalog]
  );
  const fishCatalogByLatinName = useMemo(() => {
    const map = new Map();

    fishCatalog.forEach((item) => {
      const key = normalizeLatinCatalogKey(item.latinName);

      if (key && !map.has(key)) {
        map.set(key, item);
      }
    });

    return map;
  }, [fishCatalog]);
  const plantCatalogById = useMemo(
    () => new Map(plantCatalog.map((item) => [item.id, item])),
    [plantCatalog]
  );
  const plantCatalogByLatinName = useMemo(() => {
    const map = new Map();

    plantCatalog.forEach((item) => {
      const key = normalizeLatinCatalogKey(item.latinName);

      if (key && !map.has(key)) {
        map.set(key, item);
      }
    });

    return map;
  }, [plantCatalog]);
  const getFishImageCacheKey = useCallback((fish) => {
    if (!fish) {
      return '';
    }

    const latinKey = normalizeLatinCatalogKey(fish.latinName);
    if (latinKey) {
      return `latin:${latinKey}`;
    }

    const idKey = String(fish.id ?? fish.catalogFishId ?? '').trim();
    if (idKey) {
      return `id:${idKey}`;
    }

    const commonNameKey = normalizeText(fish.commonName ?? fish.name);
    return commonNameKey ? `common:${commonNameKey}` : '';
  }, []);
  const fetchFishImageFromSearchPhrase = useCallback(async (queryText) => {
    const normalizedQuery = normalizeFishSearchPhrase(queryText);
    if (!normalizedQuery) {
      return '';
    }

    const searchUrl = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(
      normalizedQuery
    )}&limit=4`;

    try {
      const response = await fetch(searchUrl, {
        headers: REMOTE_JSON_REQUEST_HEADERS,
      });
      if (!response.ok) {
        return '';
      }

      const payload = await response.json();
      const pages = Array.isArray(payload?.pages) ? payload.pages : [];

      for (const page of pages) {
        const thumbnailUrl = String(
          page?.thumbnail?.url ?? page?.thumbnail?.source ?? ''
        ).trim();
        if (thumbnailUrl) {
          return thumbnailUrl;
        }
      }
    } catch {
      return '';
    }

    return '';
  }, []);
  const fetchFishImageFromWikiPageTitles = useCallback(async (titles) => {
    const sanitizedTitles = Array.isArray(titles)
      ? titles
          .map((item) => String(item ?? '').trim())
          .filter(Boolean)
      : [];

    if (sanitizedTitles.length === 0) {
      return '';
    }

    try {
      const queryUrl =
        'https://en.wikipedia.org/w/api.php' +
        `?action=query&format=json&formatversion=2&prop=pageimages&piprop=thumbnail&pithumbsize=420&redirects=1&titles=${encodeURIComponent(
          sanitizedTitles.join('|')
        )}`;
      const response = await fetch(queryUrl, {
        headers: REMOTE_JSON_REQUEST_HEADERS,
      });
      if (!response.ok) {
        return '';
      }

      const payload = await response.json();
      const pages = Array.isArray(payload?.query?.pages) ? payload.query.pages : [];

      for (const page of pages) {
        const imageUrl = String(page?.thumbnail?.source ?? '').trim();
        if (imageUrl) {
          return imageUrl;
        }
      }
    } catch {
      return '';
    }

    return '';
  }, []);
  const getFishPreviewImageUri = useCallback(
    (fish, options = {}) => {
      if (!fish) {
        return '';
      }

      if (!ENABLE_FISH_IMAGES) {
        return '';
      }

      const allowRemote = options.allowRemote ?? !IS_IOS_EXPO_GO;
      if (!allowRemote) {
        return '';
      }

      const cacheKey = getFishImageCacheKey(fish);

      const directPreview = String(
        fish.imageUrl ?? fish.imagePreviewUrl ?? ''
      ).trim();
      if (directPreview) {
        return directPreview;
      }

      if (cacheKey && Object.prototype.hasOwnProperty.call(fishImageUriByKey, cacheKey)) {
        return String(fishImageUriByKey[cacheKey] ?? '').trim() || GENERIC_FISH_IMAGE_URL;
      }

      const catalogEntry =
        (fish.catalogFishId && fishCatalogById.get(fish.catalogFishId)) ||
        fishCatalogByLatinName.get(normalizeLatinCatalogKey(fish.latinName));
      const catalogPreview = String(
        catalogEntry?.imageUrl ?? catalogEntry?.imagePreviewUrl ?? ''
      ).trim();
      if (catalogPreview) {
        return catalogPreview;
      }

      const latinName = String(
        fish.latinName ?? catalogEntry?.latinName ?? ''
      ).trim();
      const normalizedLatinKey = normalizeLatinCatalogKey(latinName);
      const manualCommonsFileName = normalizedLatinKey
        ? FISH_COMMONS_FILE_BY_LATIN[normalizedLatinKey]
        : '';
      if (manualCommonsFileName) {
        return (
          buildCommonsFileThumbnailUrl(manualCommonsFileName, 420) ||
          GENERIC_FISH_IMAGE_URL
        );
      }
      return buildFishCommonsFallbackImageUrl(latinName, 420) || GENERIC_FISH_IMAGE_URL;
    },
    [
      fishCatalogById,
      fishCatalogByLatinName,
      fishImageUriByKey,
      getFishImageCacheKey,
    ]
  );
  const getFishPreviewImageSource = useCallback(
    (fish, options = {}) => {
      const previewUri = getFishPreviewImageUri(fish, options);
      return previewUri
        ? getDiseaseRemoteImageSource(previewUri)
        : DISEASE_IMAGE_PLACEHOLDER_SOURCE;
    },
    [getFishPreviewImageUri]
  );
  const requestFishImageLookup = useCallback(
    (fish) => {
      if (!ENABLE_FISH_IMAGES) {
        return;
      }

      const cacheKey = getFishImageCacheKey(fish);
      if (!cacheKey) {
        return;
      }

      if (IS_IOS_EXPO_GO) {
        return;
      }

      if (
        fishImageLookupAttemptedRef.current.has(cacheKey) ||
        fishImageLookupInFlightRef.current.has(cacheKey)
      ) {
        return;
      }

      if (fishImageLookupInFlightRef.current.size >= 2) {
        return;
      }

      fishImageLookupAttemptedRef.current.add(cacheKey);
      fishImageLookupInFlightRef.current.add(cacheKey);

      const latinName = String(fish?.latinName ?? '').trim();
      const normalizedLatinKey = normalizeLatinCatalogKey(latinName);
      const aliasTitles = normalizedLatinKey
        ? FISH_WIKI_TITLE_ALIASES_BY_LATIN[normalizedLatinKey] ?? []
        : [];
      const normalizedLatinTitle = latinName
        ? latinName.replace(/\s+/g, '_')
        : '';
      const wikiPageTitleCandidates = [
        ...aliasTitles,
        normalizedLatinTitle,
      ].filter(Boolean);
      const searchPhrases = buildFishSearchPhrases(latinName);

      (async () => {
        let bestImageUri = '';

        bestImageUri = await fetchFishImageFromWikiPageTitles(wikiPageTitleCandidates);

        if (!bestImageUri) {
          bestImageUri = await fetchFishImageFromWikiPageTitles(searchPhrases);
        }

        for (const phrase of searchPhrases) {
          if (bestImageUri) {
            break;
          }
          bestImageUri = await fetchFishImageFromSearchPhrase(phrase);
          if (bestImageUri) {
            break;
          }
        }

        setFishImageUriByKey((prev) => ({
          ...prev,
          [cacheKey]: bestImageUri || prev[cacheKey] || GENERIC_FISH_IMAGE_URL,
        }));
      })()
        .catch(() => null)
        .finally(() => {
          fishImageLookupInFlightRef.current.delete(cacheKey);
        });
    },
    [
      fetchFishImageFromSearchPhrase,
      fetchFishImageFromWikiPageTitles,
      getFishImageCacheKey,
    ]
  );
  const handleFishPreviewImageError = useCallback(
    (fish) => {
      const cacheKey = getFishImageCacheKey(fish);
      if (!cacheKey) {
        return;
      }

      requestFishImageLookup(fish);
    },
    [getFishImageCacheKey, requestFishImageLookup]
  );
  const handleOpenFishImageModal = useCallback(
    (fish) => {
      if (!ENABLE_FISH_IMAGES) {
        return;
      }

      const previewUri = getFishPreviewImageUri(fish, { allowRemote: true });
      if (!previewUri) {
        return;
      }

      const modalTitle = String(fish?.commonName ?? fish?.name ?? '').trim();
      handleOpenDiseaseImageModal({
        name: modalTitle,
        imageUrl: previewUri,
        imagePreviewUrl: previewUri,
      });
    },
    [getFishPreviewImageUri, handleOpenDiseaseImageModal]
  );
  const getPlantImageCacheKey = useCallback((plant) => {
    if (!plant) {
      return '';
    }

    const latinKey = normalizeLatinCatalogKey(plant.latinName);
    if (latinKey) {
      return `latin:${latinKey}`;
    }

    const idKey = String(plant.id ?? plant.catalogPlantId ?? '').trim();
    if (idKey) {
      return `id:${idKey}`;
    }

    const commonNameKey = normalizeText(plant.commonName ?? plant.name);
    return commonNameKey ? `common:${commonNameKey}` : '';
  }, []);
  const getPlantPreviewImageUri = useCallback(
    (plant, options = {}) => {
      if (!plant) {
        return '';
      }

      if (!ENABLE_PLANT_IMAGES) {
        return '';
      }

      const allowRemote = options.allowRemote ?? !IS_IOS_EXPO_GO;
      if (!allowRemote) {
        return '';
      }

      const cacheKey = getPlantImageCacheKey(plant);
      const catalogEntry =
        (plant.catalogPlantId && plantCatalogById.get(plant.catalogPlantId)) ||
        plantCatalogByLatinName.get(normalizeLatinCatalogKey(plant.latinName));
      const latinName = String(
        plant.latinName ?? catalogEntry?.latinName ?? ''
      ).trim();
      const normalizedLatinKey = normalizeLatinCatalogKey(latinName);
      const manualCommonsFileName = getPlantCommonsFileOverride(normalizedLatinKey);
      if (manualCommonsFileName) {
        return (
          buildCommonsFileThumbnailUrl(manualCommonsFileName, 420) ||
          GENERIC_PLANT_IMAGE_URL
        );
      }

      if (cacheKey && Object.prototype.hasOwnProperty.call(plantImageUriByKey, cacheKey)) {
        return String(plantImageUriByKey[cacheKey] ?? '').trim() || GENERIC_PLANT_IMAGE_URL;
      }

      const directPreview = String(
        plant.imagePreviewUrl ??
          plant.imageUrl ??
          catalogEntry?.imagePreviewUrl ??
          catalogEntry?.imageUrl ??
          ''
      ).trim();
      if (directPreview) {
        return directPreview;
      }

      return buildPlantCommonsFallbackImageUrl(latinName, 420) || GENERIC_PLANT_IMAGE_URL;
    },
    [
      getPlantImageCacheKey,
      plantCatalogById,
      plantCatalogByLatinName,
      plantImageUriByKey,
    ]
  );
  const getPlantPreviewImageSource = useCallback(
    (plant, options = {}) => {
      const previewUri = getPlantPreviewImageUri(plant, options);
      return previewUri
        ? getDiseaseRemoteImageSource(previewUri)
        : DISEASE_IMAGE_PLACEHOLDER_SOURCE;
    },
    [getPlantPreviewImageUri]
  );
  const requestPlantImageLookup = useCallback(
    (plant) => {
      if (!ENABLE_PLANT_IMAGES) {
        return;
      }

      const cacheKey = getPlantImageCacheKey(plant);
      if (!cacheKey) {
        return;
      }

      if (IS_IOS_EXPO_GO) {
        return;
      }

      if (
        plantImageLookupAttemptedRef.current.has(cacheKey) ||
        plantImageLookupInFlightRef.current.has(cacheKey)
      ) {
        return;
      }

      if (plantImageLookupInFlightRef.current.size >= 2) {
        return;
      }

      plantImageLookupAttemptedRef.current.add(cacheKey);
      plantImageLookupInFlightRef.current.add(cacheKey);

      const latinName = String(plant?.latinName ?? '').trim();
      const commonName = String(plant?.commonName ?? plant?.name ?? '').trim();
      const normalizedLatinKey = normalizeLatinCatalogKey(latinName);
      const manualCommonsFileName = getPlantCommonsFileOverride(normalizedLatinKey);
      if (manualCommonsFileName) {
        setPlantImageUriByKey((prev) => ({
          ...prev,
          [cacheKey]:
            buildCommonsFileThumbnailUrl(manualCommonsFileName, 420) ||
            prev[cacheKey] ||
            GENERIC_PLANT_IMAGE_URL,
        }));
        plantImageLookupInFlightRef.current.delete(cacheKey);
        return;
      }

      const normalizedLatinTitle = latinName ? latinName.replace(/\s+/g, '_') : '';
      const aliasTitles = normalizedLatinKey
        ? PLANT_WIKI_TITLE_ALIASES_BY_LATIN[normalizedLatinKey] ?? []
        : [];
      const searchPhrases = [
        ...buildFishSearchPhrases(latinName),
        ...buildFishSearchPhrases(commonName),
      ].filter(Boolean);
      const wikiPageTitleCandidates = [
        ...aliasTitles,
        normalizedLatinTitle,
        ...searchPhrases.map((item) => item.replace(/\s+/g, '_')),
      ].filter(Boolean);

      (async () => {
        let bestImageUri = '';

        bestImageUri = await fetchFishImageFromWikiPageTitles(wikiPageTitleCandidates);

        if (!bestImageUri) {
          bestImageUri = await fetchFishImageFromWikiPageTitles(searchPhrases);
        }

        for (const phrase of searchPhrases) {
          if (bestImageUri) {
            break;
          }
          bestImageUri = await fetchFishImageFromSearchPhrase(phrase);
          if (bestImageUri) {
            break;
          }
        }

        setPlantImageUriByKey((prev) => ({
          ...prev,
          [cacheKey]: bestImageUri || prev[cacheKey] || GENERIC_PLANT_IMAGE_URL,
        }));
      })()
        .catch(() => null)
        .finally(() => {
          plantImageLookupInFlightRef.current.delete(cacheKey);
        });
    },
    [
      fetchFishImageFromSearchPhrase,
      fetchFishImageFromWikiPageTitles,
      getPlantImageCacheKey,
    ]
  );
  const handlePlantPreviewImageError = useCallback(
    (plant) => {
      const cacheKey = getPlantImageCacheKey(plant);
      if (!cacheKey) {
        return;
      }

      requestPlantImageLookup(plant);
    },
    [getPlantImageCacheKey, requestPlantImageLookup]
  );
  const handleOpenPlantImageModal = useCallback(
    (plant) => {
      if (!ENABLE_PLANT_IMAGES) {
        return;
      }

      const previewUri = getPlantPreviewImageUri(plant, { allowRemote: true });
      if (!previewUri) {
        return;
      }

      const latinName = String(plant?.latinName ?? '').trim();
      const normalizedLatinKey = normalizeLatinCatalogKey(latinName);
      const manualCommonsFileName = getPlantCommonsFileOverride(normalizedLatinKey);
      const fallbackUri = manualCommonsFileName
        ? buildCommonsFileThumbnailUrl(manualCommonsFileName, 900)
        : buildPlantCommonsFallbackImageUrl(latinName, 900);

      const modalTitle = String(plant?.commonName ?? plant?.name ?? '').trim();
      handleOpenDiseaseImageModal({
        name: modalTitle,
        imageUrl: previewUri,
        imagePreviewUrl: previewUri,
        imageFallbackUrl: fallbackUri || GENERIC_PLANT_IMAGE_URL,
        imageFallbackPreviewUrl: fallbackUri || GENERIC_PLANT_IMAGE_URL,
      });
    },
    [getPlantPreviewImageUri, handleOpenDiseaseImageModal]
  );
  void handleOpenFishImageModal;
  void getPlantPreviewImageSource;
  void handlePlantPreviewImageError;
  void handleOpenPlantImageModal;
  useEffect(() => {
    if (!isEditingFish) {
      return;
    }

    fishImageLookupAttemptedRef.current = new Set();
    fishImageLookupInFlightRef.current = new Set();
  }, [isEditingFish]);
  useEffect(() => {
    if (isEditingFish) {
      return undefined;
    }

    const resetTimer = setTimeout(() => {
      setStockFishSearch('');
      setSelectedCatalogFishId(null);
      setFishQuantity('1');
    }, 0);

    return () => {
      clearTimeout(resetTimer);
    };
  }, [isEditingFish]);
  useEffect(() => {
    if (!ENABLE_FISH_IMAGES) {
      return;
    }

    if (!isEditingFish || visibleFilteredFishCatalog.length === 0) {
      return;
    }

    if (IS_IOS_EXPO_GO) {
      return;
    }

    const previewUris = visibleFilteredFishCatalog
      .slice(0, 12)
      .map((fish) => getFishPreviewImageUri(fish, { allowRemote: true }))
      .map((uri) => String(uri ?? '').trim())
      .filter(Boolean);

    previewUris.forEach((uri) => {
      Image.prefetch(uri).catch(() => null);
    });
  }, [getFishPreviewImageUri, isEditingFish, visibleFilteredFishCatalog]);
  useEffect(() => {
    if (!isEditingPlant) {
      return;
    }

    plantImageLookupAttemptedRef.current = new Set();
    plantImageLookupInFlightRef.current = new Set();
  }, [isEditingPlant]);
  useEffect(() => {
    if (isEditingPlant) {
      return undefined;
    }

    const resetTimer = setTimeout(() => {
      setPlantImageUriByKey({});
    }, 0);

    return () => {
      clearTimeout(resetTimer);
    };
  }, [isEditingPlant]);
  useEffect(() => {
    if (!ENABLE_PLANT_IMAGES) {
      return;
    }

    if (!isEditingPlant || visibleFilteredPlantCatalog.length === 0) {
      return;
    }

    if (IS_IOS_EXPO_GO) {
      return;
    }

    const previewUris = visibleFilteredPlantCatalog
      .slice(0, 12)
      .map((plant) => getPlantPreviewImageUri(plant, { allowRemote: true }))
      .map((uri) => String(uri ?? '').trim())
      .filter(Boolean);

    previewUris.forEach((uri) => {
      Image.prefetch(uri).catch(() => null);
    });
  }, [getPlantPreviewImageUri, isEditingPlant, visibleFilteredPlantCatalog]);
  const fishSchoolingWarnings = useMemo(
    () =>
      stockItems
        .filter((item) => item.type === 'fish')
        .map((item) => {
          const catalogEntry =
            (item.catalogFishId && fishCatalogById.get(item.catalogFishId)) ||
            fishCatalogByLatinName.get(normalizeLatinCatalogKey(item.latinName));
          const schoolingProfile = resolveFishSchoolingProfile({
            ...(catalogEntry ?? {}),
            ...item,
          });
          const quantity = getFishQuantity(item);

          if (
            !schoolingProfile.isSchooling ||
            quantity >= schoolingProfile.minGroupSize
          ) {
            return null;
          }

          return {
            id: item.id,
            label: `${item.commonName ?? item.name} (${item.latinName ?? t('noDataCaps')})`,
            quantity,
            minGroupSize: schoolingProfile.minGroupSize,
          };
        })
        .filter(Boolean),
    [fishCatalogById, fishCatalogByLatinName, stockItems, t]
  );
  const fishAggressionConflicts = useMemo(() => {
    const fishItems = stockItems.filter((item) => item.type === 'fish');
    const conflicts = [];

    for (let index = 0; index < fishItems.length; index += 1) {
      const currentFish = fishItems[index];

      for (
        let compareIndex = index + 1;
        compareIndex < fishItems.length;
        compareIndex += 1
      ) {
        const comparedFish = fishItems[compareIndex];
        const conflict = getFishAggressionConflict(currentFish, comparedFish);

        if (conflict) {
          conflicts.push({
            id: `${currentFish.id}-${comparedFish.id}`,
            firstFish: currentFish,
            secondFish: comparedFish,
            ...conflict,
          });
        }
      }
    }

    return conflicts;
  }, [stockItems]);
  const fishIssueDetails = useMemo(
    () => [
      ...fishCompatibilityResults.flatMap((item) =>
        item.issues.map((issue) => `${item.label}: ${issue}`)
      ),
      ...fishSchoolingWarnings.map(
        (item) =>
          `${item.label}: ${t('schoolingFishSummaryWarning', {
            min: item.minGroupSize,
            current: item.quantity,
          })}`
      ),
      ...fishAggressionConflicts.map((item) =>
        t('fishAggressionPairWarning', {
          first: item.firstFish.commonName ?? item.firstFish.name ?? item.firstFish.latinName,
          second:
            item.secondFish.commonName ??
            item.secondFish.name ??
            item.secondFish.latinName,
        })
      ),
    ],
    [fishAggressionConflicts, fishCompatibilityResults, fishSchoolingWarnings, t]
  );
  const hasFishCompatibilityIssues = fishIssueDetails.length > 0;
  const fishCompatibilitySummary = useMemo(
    () => summarizeCompatibilityResults(fishCompatibilityResults),
    [fishCompatibilityResults]
  );
  const incompatibleFishCount = fishCompatibilitySummary.speciesWithIssues;
  const incompatibleFishMajorCount = fishCompatibilitySummary.speciesWithMajorIssues;
  const fishWarningsByItemId = useMemo(() => {
    const warningsMap = new Map();
    const appendWarning = (fishId, text, severity = 'warning') => {
      if (!fishId || !text) {
        return;
      }

      const current = warningsMap.get(fishId) ?? [];
      current.push({
        text,
        severity,
      });
      warningsMap.set(fishId, current);
    };

    fishCompatibilityResults.forEach((item) => {
      item.issues.forEach((issueText) => appendWarning(item.id, issueText, 'warning'));
    });

    fishSchoolingWarnings.forEach((item) => {
      appendWarning(
        item.id,
        t('schoolingFishSummaryWarning', {
          min: item.minGroupSize,
          current: item.quantity,
        }),
        'warning'
      );
    });

    fishAggressionConflicts.forEach((item) => {
      const text = t('fishAggressionPairWarning', {
        first: item.firstFish.commonName ?? item.firstFish.name ?? item.firstFish.latinName,
        second:
          item.secondFish.commonName ??
          item.secondFish.name ??
          item.secondFish.latinName,
      });
      appendWarning(item.firstFish.id, text, 'critical');
      appendWarning(item.secondFish.id, text, 'critical');
    });

    return warningsMap;
  }, [fishAggressionConflicts, fishCompatibilityResults, fishSchoolingWarnings, t]);
  const plantCompatibilityResults = useMemo(
    () =>
      stockItems
        .filter((item) => item.type === 'plant')
        .map((item) => {
          const issues = checkPlantCompatibility(
            item,
            currentMeasurement,
            selectedTankLiters,
            selectedTankEnvironmentProfile
          );

          return {
            id: item.id,
            label: `${item.commonName ?? item.name} (${item.latinName ?? t('noDataCaps')})`,
            issues,
          };
        }),
    [currentMeasurement, selectedTankEnvironmentProfile, selectedTankLiters, stockItems, t]
  );
  const plantCompatibilitySummary = useMemo(
    () => summarizeCompatibilityResults(plantCompatibilityResults),
    [plantCompatibilityResults]
  );
  const incompatiblePlantCount = plantCompatibilitySummary.speciesWithIssues;
  const incompatiblePlantMajorCount = plantCompatibilitySummary.speciesWithMajorIssues;
  const plantWarningsByItemId = useMemo(() => {
    const warningsMap = new Map();

    plantCompatibilityResults.forEach((item) => {
      if (!item.id || !Array.isArray(item.issues) || item.issues.length === 0) {
        return;
      }

      warningsMap.set(
        item.id,
        item.issues.map((issueText) => ({
          text: issueText,
          severity: 'warning',
        }))
      );
    });

    return warningsMap;
  }, [plantCompatibilityResults]);
  const fishStockingSummary = useMemo(
    () => buildFishStockingSummary(stockItems, selectedTankLiters),
    [selectedTankLiters, stockItems]
  );
  const todayDayBucketMs = getDayBucketMs(new Date());
  const homeStockItemsByTankId = useMemo(
    () =>
      homeStockItems.reduce((acc, item) => {
        const tankId = String(item.tankId ?? '');

        if (!tankId) {
          return acc;
        }

        const currentItems = acc.get(tankId) ?? [];
        currentItems.push(item);
        acc.set(tankId, currentItems);
        return acc;
      }, new Map()),
    [homeStockItems]
  );
  const homeTankSummaries = useMemo(() => {
    if (tanks.length === 0) {
      return [];
    }

    const alphabeticallySortedTanks = [...tanks].sort((a, b) =>
      String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'pl', {
        sensitivity: 'base',
      })
    );

    return alphabeticallySortedTanks.map((tank) => {
      const tankStockItems = homeStockItemsByTankId.get(tank.id) ?? [];
      const tankMeasurements = homeMeasurements
        .filter((item) => item.tankId === tank.id)
        .sort((a, b) => getCreatedAtMs(b.createdAt) - getCreatedAtMs(a.createdAt));
      const latestMeasurement = tankMeasurements[0] ?? null;
      const latestAnalysis = latestMeasurement
        ? analyzeMeasurementLogic(latestMeasurement, availableMeasurementTests)
        : null;

      const measurementActionsToday = (latestAnalysis?.recommendations ?? []).filter(
        (item) => getDayBucketMs(getRecommendationDueAtMsLogic(item)) === todayDayBucketMs
      ).length;

      const schedule = buildWaterTestingScheduleLogic(
        tankMeasurements,
        availableMeasurementTests
      );
      const scheduleActionsToday = (schedule.parameters ?? []).filter(
        (item) => item.dayBucketMs === todayDayBucketMs
      ).length;

      const issueCases = homeActiveIssueCases.filter((item) => item.tankId === tank.id);
      const healthAssessment = buildAquariumHealthAssessment({
        tank,
        measurement: latestMeasurement,
        stockItems: tankStockItems,
        activeIssueCases: issueCases,
      });
      const tankProfile = buildTankEnvironmentProfile(tank);
      const tankLiters = Number(tank?.liters);
      const tankEquipmentAssessment = buildTankEquipmentAssessment(
        tank,
        EQUIPMENT_CATALOG
      );
      const tankFishItems = tankStockItems.filter((item) => item.type === 'fish');
      const tankPlantItems = tankStockItems.filter((item) => item.type === 'plant');
      const tankFishCompatibilityResults = tankFishItems.map((item) => ({
        id: item.id,
        issues: checkFishCompatibility(item, latestMeasurement, tankLiters, tankProfile),
      }));
      const tankPlantCompatibilityResults = tankPlantItems.map((item) => ({
        id: item.id,
        issues: checkPlantCompatibility(item, latestMeasurement, tankLiters, tankProfile),
      }));
      let tankFishAggressionConflictsCount = 0;
      for (let index = 0; index < tankFishItems.length; index += 1) {
        for (
          let compareIndex = index + 1;
          compareIndex < tankFishItems.length;
          compareIndex += 1
        ) {
          if (getFishAggressionConflict(tankFishItems[index], tankFishItems[compareIndex])) {
            tankFishAggressionConflictsCount += 1;
          }
        }
      }
      const tankFishSchoolingWarningsCount = tankFishItems.filter((item) => {
        const schoolingProfile = resolveFishSchoolingProfile(item);
        return (
          schoolingProfile.isSchooling &&
          getFishQuantity(item) < schoolingProfile.minGroupSize
        );
      }).length;
      const tankStockingSummary = buildFishStockingSummary(tankStockItems, tankLiters);
      const tankActiveDiseaseCasesCount = issueCases.filter(
        (item) => String(item.caseType ?? 'disease').toLowerCase() === 'disease'
      ).length;
      const tankActivePlantDiseaseCasesCount = issueCases.filter(
        (item) => String(item.caseType ?? '').toLowerCase() === 'plant_disease'
      ).length;
      const tankActiveAlgaeCasesCount = issueCases.filter(
        (item) => String(item.caseType ?? '').toLowerCase() === 'algae'
      ).length;
      const tankTrendSuggestedEnvironment = buildTrendSuggestedEnvironmentForTank({
        fishItems: tankFishItems,
        plantItems: tankPlantItems,
        activeDiseaseCases: issueCases.filter(
          (item) => String(item.caseType ?? 'disease').toLowerCase() === 'disease'
        ),
        activePlantDiseaseCases: issueCases.filter(
          (item) => String(item.caseType ?? '').toLowerCase() === 'plant_disease'
        ),
        activeAlgaeCases: issueCases.filter(
          (item) => String(item.caseType ?? '').toLowerCase() === 'algae'
        ),
        measurement: latestMeasurement,
        tankProfile,
      });
      const homeAttentionItems = buildAttentionItemsForTank({
        hasGeneralRecommendationAccess,
        hasEquipmentSaveAccess,
        equipmentAssessment: tankEquipmentAssessment,
        trendSuggestedEnvironment: tankTrendSuggestedEnvironment,
        fishCompatibilityResults: tankFishCompatibilityResults,
        plantCompatibilityResults: tankPlantCompatibilityResults,
        fishAggressionConflictsCount: tankFishAggressionConflictsCount,
        fishSchoolingWarningsCount: tankFishSchoolingWarningsCount,
        fishStockingSummary: tankStockingSummary,
        activeDiseaseCasesCount: tankActiveDiseaseCasesCount,
        activePlantDiseaseCasesCount: tankActivePlantDiseaseCasesCount,
        activeAlgaeCasesCount: tankActiveAlgaeCasesCount,
        selectedTankHealthAssessment: healthAssessment,
      });
      const sectionCounts = buildHomeSectionCounts({
        tank,
        measurement: latestMeasurement,
        stockItems: tankStockItems,
        issueCases,
        enabledTests: availableMeasurementTests,
      });
      const fallbackActionsTodayCount =
        measurementActionsToday + scheduleActionsToday;
      const actionsTodayCount =
        sectionCounts.planCount > 0
          ? sectionCounts.planCount
          : fallbackActionsTodayCount;
      const reminderActionsTodayCount = actionsTodayCount;

      return {
        tank,
        statusSeverity: getHomeStatusSeverityFromScore(healthAssessment.score),
        healthAssessment,
        actionsTodayCount,
        reminderActionsTodayCount,
        issueCount: Math.max(homeAttentionItems.length, issueCases.length),
      };
    });
  }, [
    tanks,
    homeStockItemsByTankId,
    homeMeasurements,
    availableMeasurementTests,
    homeActiveIssueCases,
    hasEquipmentSaveAccess,
    hasGeneralRecommendationAccess,
    todayDayBucketMs,
  ]);
  const selectedHomeScoreAssessment = selectedHomeScoreSummary?.healthAssessment ?? null;
  const selectedHomeScoreDetails = selectedHomeScoreAssessment?.penalties ?? [];
  const selectedHomeScoreLabel = selectedHomeScoreAssessment
    ? selectedHomeScoreAssessment.score >= 85
      ? t('homeScoreIdeal')
      : selectedHomeScoreAssessment.score >= 65
        ? t('homeScoreStable')
        : selectedHomeScoreAssessment.score >= 50
          ? t('homeScoreSurvivable')
          : t('homeScoreCritical')
    : '';
  const sectionTitle =
    activeSection === 'home'
      ? t('sectionHome')
      : activeSection === 'tank'
      ? t('sectionReview')
      : activeSection === 'history'
        ? t('sectionHistory')
      : activeSection === 'fish'
        ? t('sectionFish')
        : activeSection === 'tankInfo'
          ? t('sectionInfo')
        : activeSection === 'plant'
          ? t('sectionPlants')
          : activeSection === 'issues'
            ? t('sectionIssues')
          : activeSection === 'disease'
            ? t('sectionDiseasesCatalog')
          : activeSection === 'plantDisease'
            ? t('sectionPlantDiseasesCatalog')
          : activeSection === 'algae'
            ? t('sectionAlgaeCatalog')
            : activeSection === 'settings'
              ? t('sectionSettings')
              : '';
  const headerTitle = isHealthSection || isSettingsSection
    || isHomeSection
    ? sectionTitle
    : selectedTank?.name ?? t('noTank');
  const fishInTank = useMemo(
    () => stockItems.filter((item) => item.type === 'fish'),
    [stockItems]
  );
  const plantsInTank = useMemo(
    () => stockItems.filter((item) => item.type === 'plant'),
    [stockItems]
  );
  const { colors, isLightTheme } = useAppTheme();
  const enabledTests = activeEnabledTests;
  const themeTextPrimary = colors.textPrimary;
  const themeTextSecondary = colors.textSecondary;
  const themeCardBg = colors.cardBg;
  const themeCardBgAlt = colors.cardBgAlt;
  const themeBorder = colors.border;
  const themeBorderStrong = colors.borderStrong;
  const themeChipBg = colors.chipBg;
  const themeChipText = colors.chipText;
  const themeActionText = colors.accentText;
  const themeNameText = colors.accentText;
  const themeAccentText = colors.accentText;
  const themeModalBg = colors.modalBg;
  const themeInputBorder = colors.inputBorder;
  const themeInputText = colors.inputText;
  const themePlaceholder = colors.placeholder;
  const themePageBg = colors.pageBg;
  const themeAccent = colors.accent;
  const themeAccentStrongBg = colors.accentStrongBg;
  const themeAccentSoftBg = colors.accentSoftBg;
  const themeAccentOnStrong = colors.accentOnStrong;
  const themeSuccess = colors.success;
  const themeSuccessBg = colors.successBg;
  const themeSuccessSoftBg = colors.successSoftBg;
  const themeWarning = colors.warning;
  const themeWarningBg = colors.warningBg;
  const themeWarningSoftBg = colors.warningSoftBg;
  const themeWarningText = colors.warningText;
  const themeDanger = colors.danger;
  const themeDangerBg = colors.dangerBg;
  const themeDangerSoftBg = colors.dangerSoftBg;
  const themeDangerText = colors.dangerText;
  const themeSuccessText = colors.successText;
  const themeTextMuted = colors.textMuted;
  const themeInputBg = colors.inputBg;
  const themeChartBg = colors.chartBg;
  const themeChartGrid = colors.chartGrid;
  const themeChartPointBorder = colors.chartPointBorder;
  const themeChartAxis = colors.chartAxis;
  const themeOverlay = colors.overlay;
  const themeDragHandle = colors.dragHandle;
  const issueAccentText = themeAccentText;
  const issueSuccessText = themeSuccessText;
  const issueScheduleText = themeTextSecondary;
  const issueMutedText = themeTextMuted;
  const issueMetaText = themeTextSecondary;
  const issueWarningText = themeWarningText;
  const issueDangerText = themeDangerText;
  const issueDivider = themeBorder;
  const issueBodyTextSize = 13;
  const diseaseImageModalFrameWidth = Math.max(windowWidth - 24, 280);
  const diseaseImageModalFrameHeight = Math.max(windowHeight - 220, 260);
  const diseaseImageModalScaleLabel = `${Math.round(diseaseImageZoomLevel * 100)}%`;
  const currentTankCount = tanks.length;
  const tankLimit = getSubscriptionLimit('maxTanks');
  const canAddTank = tankLimit === null || currentTankCount < tankLimit;
  const isOverTankLimit = tankLimit !== null && currentTankCount > tankLimit;
  const subscriptionStatusLabel =
    subscription.status === 'active'
      ? t('settingsSubscriptionStatusActive')
      : subscription.status === 'grace_period'
        ? t('settingsSubscriptionStatusGracePeriod')
        : subscription.status === 'paused'
          ? t('settingsSubscriptionStatusPaused')
          : subscription.status === 'cancelled'
            ? t('settingsSubscriptionStatusCancelled')
            : t('settingsSubscriptionStatusInactive');
  const currentSubscriptionTierLabel =
    subscriptionPlan.tier === 'free'
      ? t('settingsSubscriptionTierFree')
      : subscriptionPlan.tier === 'premium'
        ? t('settingsSubscriptionTierPremium')
        : t('settingsSubscriptionTierPro');
  const hasParameterAnalysisAccess = Boolean(
    subscriptionEntitlements?.parameterAnalysis
  );
  const hasChartAccess = subscriptionEntitlements?.chartAccess !== 'none';
  const hasAdvancedChartAccess =
    subscriptionEntitlements?.chartAccess === 'advanced';
  const hasExtendedAlertAccess =
    subscriptionEntitlements?.alertAccess === 'extended' ||
    subscriptionEntitlements?.alertAccess === 'smart';
  const hasEquipmentSaveAccess =
    subscriptionEntitlements?.equipmentAccess === 'save' ||
    subscriptionEntitlements?.equipmentAccess === 'analysis_and_recommendations';
  const hasEquipmentAnalysisAccess =
    subscriptionEntitlements?.equipmentAccess === 'analysis_and_recommendations';
  const hasGeneralRecommendationAccess =
    subscriptionEntitlements?.recommendationAccess === 'general' ||
    subscriptionEntitlements?.recommendationAccess === 'step_by_step';
  const hasGuidedRecommendationAccess =
    subscriptionEntitlements?.recommendationAccess === 'step_by_step';
  const hasTaskReminderAccess =
    subscriptionEntitlements?.taskAccess === 'reminders' ||
    subscriptionEntitlements?.taskAccess === 'checklists_and_plan';
  const hasTaskChecklistAccess =
    subscriptionEntitlements?.taskAccess === 'checklists_and_plan';
  const historyEntryLimit = getSubscriptionLimit('maxSavedMeasurementsPerTank');
  const currentHistoryEntryCount = measurements.length;
  const visibleHistoryMeasurements =
    historyEntryLimit === null
      ? measurements
      : measurements.slice(0, historyEntryLimit);
  const isHistoryDisplayLimited =
    historyEntryLimit !== null && currentHistoryEntryCount > historyEntryLimit;
  const tankLimitUsageText =
    tankLimit === null
      ? t('subscriptionTankLimitUsageUnlimited', {
          plan: currentSubscriptionTierLabel,
          current: currentTankCount,
        })
      : t('subscriptionTankLimitUsage', {
          plan: currentSubscriptionTierLabel,
          current: currentTankCount,
          limit: tankLimit,
        });
  const historyLimitUsageText =
    historyEntryLimit === null
      ? t('subscriptionHistoryLimitUsageUnlimited', {
          plan: currentSubscriptionTierLabel,
          current: currentHistoryEntryCount,
        })
      : t('subscriptionHistoryLimitUsage', {
          plan: currentSubscriptionTierLabel,
          current: currentHistoryEntryCount,
          limit: historyEntryLimit,
        });
  const subscriptionPlatformProductIdByTier = useMemo(
    () =>
      subscriptionPlans.reduce((acc, plan) => {
        acc[plan.tier] = getStoreProductIdForTier(plan.tier);
        return acc;
      }, {}),
    [getStoreProductIdForTier, subscriptionPlans]
  );
  const currentSubscriptionProductId =
    subscriptionPlatformProductIdByTier[subscriptionPlan.tier] ?? null;
  const canManualSwitchSubscriptionPlan = canManageSubscriptionManually;
  const selectedTankSubstrateValue = normalizeSubstrateType(selectedTank?.substrateType);
  const selectedTankSubstrateOption = SUBSTRATE_OPTIONS.find(
    (item) => item.value === selectedTankSubstrateValue
  );
  const selectedTankSubstrateLabel = selectedTankSubstrateOption
    ? t(selectedTankSubstrateOption.labelKey)
    : t('noDataCaps');
  const selectedTankLightValue = normalizeLightIntensity(selectedTank?.lightIntensity);
  const selectedTankLightOption = LIGHT_INTENSITY_OPTIONS.find(
    (item) => item.value === selectedTankLightValue
  );
  const selectedTankLightLabel = selectedTankLightOption
    ? t(selectedTankLightOption.labelKey)
    : t('noDataCaps');
  const selectedTankLightHoursValue = Number(selectedTank?.lightHours);
  const selectedTankLightHoursLabel = Number.isFinite(selectedTankLightHoursValue)
    ? `${selectedTankLightHoursValue} h`
    : t('noDataCaps');
  const selectedTankAquariumTypeValue = normalizeAquariumType(selectedTank?.aquariumType);
  const selectedTankAquariumTypeOption = AQUARIUM_TYPE_OPTIONS.find(
    (item) => item.value === selectedTankAquariumTypeValue
  );
  const selectedTankAquariumTypeLabel = selectedTankAquariumTypeOption
    ? t(selectedTankAquariumTypeOption.labelKey)
    : t('noDataCaps');
  const selectedTankPlantFertilizationSummary = useMemo(
    () => summarizePlantFertilization(selectedTank?.plantFertilizationEntries),
    [selectedTank]
  );
  const selectedTankPlantFertilizationEntries = selectedTankPlantFertilizationSummary.entries;
  const issueTankPickerKind = String(issueTankPickerPayload?.kind ?? '');
  const issueTankPickerItemName = String(
    issueTankPickerPayload?.item?.name ?? issueTankPickerPayload?.item?.issueName ?? ''
  ).trim();
  const issueTankPickerTitle =
    issueTankPickerKind === 'plant_disease'
      ? t('issueTankPickerTitlePlantDisease')
      : issueTankPickerKind === 'algae'
        ? t('issueTankPickerTitleAlgae')
        : t('issueTankPickerTitleDisease');
  const issueTankPickerHint =
    issueTankPickerKind === 'plant_disease'
      ? t('issueTankPickerHintPlantDisease', { name: issueTankPickerItemName })
      : issueTankPickerKind === 'algae'
        ? t('issueTankPickerHintAlgae', { name: issueTankPickerItemName })
        : t('issueTankPickerHintDisease', { name: issueTankPickerItemName });
  const issueTankPickerTanks = useMemo(
    () =>
      [...tanks].sort((a, b) =>
        String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'pl', {
          sensitivity: 'base',
        })
      ),
    [tanks]
  );
  const tankEquipmentAssessment = useMemo(
    () => buildTankEquipmentAssessment(selectedTank, EQUIPMENT_CATALOG),
    [selectedTank]
  );
  const filteredEquipmentCatalog = useMemo(() => {
    const normalizedType = normalizeEquipmentType(equipmentCatalogType);

    if (!normalizedType) {
      return [];
    }

    const search = normalizeText(equipmentCatalogSearch);
    return EQUIPMENT_CATALOG.filter((item) => item.type === normalizedType)
      .filter((item) => {
        if (!search) {
          return true;
        }
        const haystack = normalizeText(
          `${item.brand ?? ''} ${item.model ?? ''} ${item.powerW ?? ''} ${item.flowLh ?? ''}`
        );
        return haystack.includes(search);
      })
      .map((item) => {
        const minLiters = toFiniteNumber(item.tankMinLiters) ?? 0;
        const maxLiters = toFiniteNumber(item.tankMaxLiters) ?? Number.MAX_SAFE_INTEGER;
        const fitsTank =
          Number.isFinite(selectedTankLiters) &&
          selectedTankLiters >= minLiters &&
          selectedTankLiters <= maxLiters;
        const flowRatio =
          item.type === 'filter' &&
          Number.isFinite(selectedTankLiters) &&
          selectedTankLiters > 0 &&
          Number.isFinite(toFiniteNumber(item.flowLh))
            ? Math.round((item.flowLh / selectedTankLiters) * 10) / 10
            : null;
        return {
          ...item,
          description: getEquipmentCatalogDescription(item),
          fitsTank,
          flowRatio,
        };
      })
      .sort((a, b) => {
        if (a.fitsTank !== b.fitsTank) {
          return a.fitsTank ? -1 : 1;
        }
        return `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`, 'pl');
      });
  }, [equipmentCatalogSearch, equipmentCatalogType, selectedTankLiters]);
  const measurementDraftCo2 = useMemo(
    () => calculateCo2FromKhPhLogic(kh, ph),
    [kh, ph]
  );
  const measurementInputRows = [
    enabledTests.ph
      ? {
          key: 'ph',
          label: 'pH',
          value: ph,
          onChangeText: setPh,
          parseValue: (rawValue) => parseOptionalNumberOrThrow('pH', rawValue),
          isRecommended: true,
        }
      : null,
    enabledTests.gh
      ? {
          key: 'gh',
          label: 'GH',
          value: gh,
          onChangeText: setGh,
          parseValue: (rawValue) => parseOptionalNumberOrThrow('GH', rawValue),
          isRecommended: true,
        }
      : null,
    enabledTests.kh
      ? {
          key: 'kh',
          label: 'KH',
          value: kh,
          onChangeText: setKh,
          parseValue: (rawValue) => parseOptionalNumberOrThrow('KH', rawValue),
          isRecommended: true,
        }
      : null,
    enabledTests.ca
      ? {
          key: 'ca',
          label: 'Ca',
          value: ca,
          onChangeText: setCa,
          parseValue: (rawValue) =>
            parseOptionalNonNegativeNumberOrThrow('Ca', rawValue),
          isRecommended: true,
        }
      : null,
    enabledTests.mg
      ? {
          key: 'mg',
          label: 'Mg',
          value: mg,
          onChangeText: setMg,
          parseValue: (rawValue) =>
            parseOptionalNonNegativeNumberOrThrow('Mg', rawValue),
          isRecommended: true,
        }
      : null,
    enabledTests.no2
      ? {
          key: 'no2',
          label: 'NO2',
          value: no2,
          onChangeText: setNo2,
          parseValue: (rawValue) => parseOptionalNumberOrThrow('NO2', rawValue),
          isRecommended: true,
        }
      : null,
    enabledTests.no3
      ? {
          key: 'no3',
          label: 'NO3',
          value: no3,
          onChangeText: setNo3,
          parseValue: (rawValue) => parseOptionalNumberOrThrow('NO3', rawValue),
          isRecommended: true,
        }
      : null,
    enabledTests.nh3nh4
      ? {
          key: 'nh3nh4',
          label: 'NH3/NH4',
          value: nh3nh4,
          onChangeText: setNh3Nh4,
          parseValue: (rawValue) =>
            parseOptionalNonNegativeNumberOrThrow('NH3/NH4', rawValue),
          isRecommended: true,
        }
      : null,
    enabledTests.po4
      ? {
          key: 'po4',
          label: 'PO4',
          value: po4,
          onChangeText: setPo4,
          parseValue: (rawValue) =>
            parseOptionalNonNegativeNumberOrThrow('PO4', rawValue),
          isRecommended: true,
        }
      : null,
    enabledTests.fe
      ? {
          key: 'fe',
          label: 'Fe',
          value: fe,
          onChangeText: setFe,
          parseValue: (rawValue) =>
            parseOptionalNonNegativeNumberOrThrow('Fe', rawValue),
          isRecommended: true,
        }
      : null,
    enabledTests.temperature
      ? {
          key: 'temperature',
          label: 'Temp',
          value: temperature,
          onChangeText: setTemperature,
          parseValue: (rawValue) =>
            parseOptionalNumberOrThrow('temperatura', rawValue),
          isRecommended: true,
        }
      : null,
  ].filter(Boolean);
  const activeDiseaseCases = useMemo(
    () =>
      tankDiseaseCases.filter((item) => {
        const caseType = String(item.caseType ?? 'disease').toLowerCase();
        return caseType === 'disease' || !item.caseType;
      }),
    [tankDiseaseCases]
  );
  const activePlantDiseaseCases = useMemo(
    () =>
      tankDiseaseCases.filter(
        (item) => String(item.caseType ?? '').toLowerCase() === 'plant_disease'
      ),
    [tankDiseaseCases]
  );
  const activeAlgaeCases = useMemo(
    () =>
      tankDiseaseCases.filter(
        (item) => String(item.caseType ?? '').toLowerCase() === 'algae'
      ),
    [tankDiseaseCases]
  );
  const historyIssueTimeline = useMemo(
    () =>
      tankDiseaseHistoryCases
        .map((item) => {
          const caseType = String(item.caseType ?? 'disease').toLowerCase();
          const issueTypeLabel =
            caseType === 'plant_disease'
              ? t('typePlantDisease')
              : caseType === 'algae'
                ? t('typeAlgae')
                : t('typeDisease');
          const status = String(item.status ?? 'active').toLowerCase();
          const issueName = String(
            item.issueName ?? item.diseaseName ?? item.name ?? t('noData')
          ).trim();
          const createdAtMs = getCreatedAtMs(item.createdAt);
          const addedAt = formatDateOnly(item.createdAt);
          const endedAtRaw = item.closedAt ?? item.updatedAt ?? null;
          const endedAt = status === 'active' ? null : formatDateOnly(endedAtRaw);
          return {
            id: item.id,
            issueName,
            issueTypeLabel,
            status,
            createdAtMs,
            addedAt,
            endedAt,
          };
        })
        .sort((a, b) => (b?.createdAtMs ?? 0) - (a?.createdAtMs ?? 0)),
    [tankDiseaseHistoryCases, t]
  );
  const trendSuggestedEnvironment = useMemo(() => {
    const fishTempRange = buildRecommendedRange(
      fishInTank.map((item) => item.tempMin),
      fishInTank.map((item) => item.tempMax)
    );
    const plantTempRange = buildRecommendedRange(
      plantsInTank.map((item) => item.tempMin),
      plantsInTank.map((item) => item.tempMax)
    );

    const baseTempRanges = [fishTempRange, plantTempRange].filter(Boolean);
    const baseTempRange =
      baseTempRanges.length === 0
        ? null
        : buildRecommendedRange(
            baseTempRanges.map((range) => range.min),
            baseTempRanges.map((range) => range.max)
          );

    const plantLightRanges = plantsInTank
      .map((item) => inferPlantLightRange(item))
      .filter(Boolean)
      .map((range) => ({
        min: Number(range.minHours),
        max: Number(range.maxHours),
      }))
      .filter(
        (range) =>
          Number.isFinite(range.min) &&
          Number.isFinite(range.max) &&
          range.min <= range.max
      );
    const baseLightRange =
      plantLightRanges.length === 0
        ? null
        : buildRecommendedRange(
            plantLightRanges.map((range) => range.min),
            plantLightRanges.map((range) => range.max)
          );

    let recommendedTempRange = baseTempRange;
    let recommendedLightRange = baseLightRange;
    const treatmentReasons = [];

    const activeFishDiseaseIds = new Set(
      activeDiseaseCases.map((item) =>
        String(item.issueId ?? item.diseaseId ?? '').toLowerCase()
      )
    );
    const activePlantDiseaseIds = new Set(
      activePlantDiseaseCases.map((item) =>
        String(item.issueId ?? item.diseaseId ?? '').toLowerCase()
      )
    );
    const activeAlgaeIds = new Set(
      activeAlgaeCases.map((item) =>
        String(item.issueId ?? item.diseaseId ?? '').toLowerCase()
      )
    );

    if (activeFishDiseaseIds.has('ich')) {
      recommendedTempRange = { min: 28, max: 30, conflict: false };
      recommendedLightRange = { min: 6, max: 8, conflict: false };
      treatmentReasons.push('ospa rybia');
    }

    if (activeFishDiseaseIds.has('velvet')) {
      recommendedTempRange = { min: 27, max: 28, conflict: false };
      recommendedLightRange = { min: 4, max: 6, conflict: false };
      treatmentReasons.push('oodinioza (velvet)');
    }

    if (activePlantDiseaseIds.size > 0 && treatmentReasons.length === 0) {
      recommendedLightRange = { min: 6, max: 8, conflict: false };
      treatmentReasons.push('aktywny problem roslin');
    }

    if (activeAlgaeIds.has('black-beard-algae')) {
      recommendedLightRange = { min: 6, max: 7, conflict: false };
      treatmentReasons.push('krasnorosty (BBA)');
    } else if (activeAlgaeIds.has('cyanobacteria')) {
      recommendedLightRange = { min: 5, max: 6, conflict: false };
      treatmentReasons.push('sinice');
    } else if (activeAlgaeIds.has('green-hair-algae')) {
      recommendedLightRange = { min: 6, max: 7, conflict: false };
      treatmentReasons.push('zielenice nitkowate');
    }

    const isTreatmentMode = treatmentReasons.length > 0;
    const latestTemperature = Number(currentMeasurement?.temperature);
    const currentTempValue = Number.isFinite(latestTemperature)
      ? roundToOneDecimal(latestTemperature)
      : null;
    const currentLightHours = Number(selectedTankEnvironmentProfile.lightHours);
    const currentLightValue = Number.isFinite(currentLightHours)
      ? roundToOneDecimal(currentLightHours)
      : null;

    const isTempWithinSuggested =
      recommendedTempRange && currentTempValue !== null
        ? currentTempValue >= recommendedTempRange.min &&
          currentTempValue <= recommendedTempRange.max
        : null;
    const isLightWithinSuggested =
      recommendedLightRange && currentLightValue !== null
        ? currentLightValue >= recommendedLightRange.min &&
          currentLightValue <= recommendedLightRange.max
        : null;

    return {
      isTreatmentMode,
      treatmentReasons,
      fishTempRange,
      plantTempRange,
      recommendedTempRange,
      recommendedLightRange,
      currentTempValue,
      currentLightValue,
      isTempWithinSuggested,
      isLightWithinSuggested,
    };
  }, [
    activeAlgaeCases,
    activeDiseaseCases,
    activePlantDiseaseCases,
    currentMeasurement?.temperature,
    fishInTank,
    plantsInTank,
    selectedTankEnvironmentProfile.lightHours,
  ]);
  const guidedRecommendationSteps = useMemo(() => {
    if (!selectedTank || !hasGuidedRecommendationAccess) {
      return [];
    }

    const steps = [];
    const seen = new Set();
    const toPriority = (severity, area, text) => {
      let score = severity === 'critical' ? 320 : severity === 'warning' ? 220 : 140;
      const normalized = `${area} ${text}`.toLowerCase();

      if (
        normalized.includes('agresj') ||
        normalized.includes('konflikt') ||
        normalized.includes('chorob') ||
        normalized.includes('glon')
      ) {
        score += 80;
      }

      if (
        normalized.includes('przerybienie') ||
        normalized.includes('filtr') ||
        normalized.includes('grzalk')
      ) {
        score += 55;
      }

      if (normalized.includes('dodaj') || normalized.includes('uzupelnij')) {
        score += 20;
      }

      return score;
    };
    const priorityLabel = (score) => {
      if (score >= 320) return 'Pilne';
      if (score >= 240) return 'Wysoki';
      return 'Sredni';
    };
    const appendStep = (severity, area, text, details = []) => {
      const normalizedArea = String(area ?? '').trim();
      const normalizedText = String(text ?? '').trim();
      if (!normalizedText) {
        return;
      }
      const dedupeKey = `${normalizedArea}|${normalizedText}`.toLowerCase();
      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);

      const priority = toPriority(severity, normalizedArea, normalizedText);
      steps.push({
        id: dedupeKey,
        severity: severity === 'critical' ? 'critical' : severity === 'warning' ? 'warning' : 'info',
        area: normalizedArea || 'Akwarium',
        text: normalizedText,
        details: Array.isArray(details)
          ? details
              .map((item) => String(item ?? '').trim())
              .filter(Boolean)
          : [],
        priority,
        priorityLabel: priorityLabel(priority),
      });
    };
    const fishMismatch = buildCompatibilityMismatchDetails(fishCompatibilityResults, {
      maxSpecies: 3,
      maxIssuesPerSpecies: 2,
    });
    const fishMismatchNames = formatCompactNameList(fishMismatch.names, 3);
    const plantMismatch = buildCompatibilityMismatchDetails(plantCompatibilityResults, {
      maxSpecies: 3,
      maxIssuesPerSpecies: 2,
    });
    const plantMismatchNames = formatCompactNameList(plantMismatch.names, 3);
    const aggressionDetails = buildAggressionConflictDetails(fishAggressionConflicts, 4);
    const schoolingDetails = buildSchoolingWarningDetails(fishSchoolingWarnings, 4);
    const activeIssueNames = formatCompactNameList(
      [
        ...activeDiseaseCases.map((item) => getIssueCaseDisplayName(item)),
        ...activePlantDiseaseCases.map((item) => getIssueCaseDisplayName(item)),
        ...activeAlgaeCases.map((item) => getIssueCaseDisplayName(item)),
      ],
      4
    );

    (currentAnalysis?.recommendations ?? []).slice(0, 3).forEach((item) => {
      appendStep(
        item.severity,
        'Parametry',
        `Skoryguj ${item.parameter} (aktualnie ${item.value || 'brak'}, cel ${item.expectedRange || 'zakres docelowy'}). ${item.action}`,
        [
          `Parametr: ${item.parameter || '-'}.`,
          `Aktualnie: ${item.value || 'brak danych'}.`,
          `Zakres docelowy: ${item.expectedRange || 'zakres docelowy'}.`,
          `Dzialanie: ${item.action || 'sprawdz pomiar i skoryguj stopniowo'}.`,
        ]
      );
    });

    if (
      trendSuggestedEnvironment.recommendedTempRange &&
      trendSuggestedEnvironment.isTempWithinSuggested === false
    ) {
      appendStep(
        'critical',
        'Parametry',
        `Ustaw temperature w zakresie ${trendSuggestedEnvironment.recommendedTempRange.min}-${trendSuggestedEnvironment.recommendedTempRange.max} C (aktualnie: ${trendSuggestedEnvironment.currentTempValue} C).`,
        [
          `Cel: ${trendSuggestedEnvironment.recommendedTempRange.min}-${trendSuggestedEnvironment.recommendedTempRange.max} C.`,
          `Aktualnie: ${trendSuggestedEnvironment.currentTempValue} C.`,
          'Dzialanie: zmieniaj temperature stopniowo (maks. 1 C na dobe).',
        ]
      );
    }

    if (
      trendSuggestedEnvironment.recommendedLightRange &&
      trendSuggestedEnvironment.isLightWithinSuggested === false
    ) {
      appendStep(
        'warning',
        'Informacje',
        `Skoryguj czas swiecenia do ${trendSuggestedEnvironment.recommendedLightRange.min}-${trendSuggestedEnvironment.recommendedLightRange.max} h/dobe (aktualnie: ${trendSuggestedEnvironment.currentLightValue} h).`,
        [
          `Cel: ${trendSuggestedEnvironment.recommendedLightRange.min}-${trendSuggestedEnvironment.recommendedLightRange.max} h/dobe.`,
          `Aktualnie: ${trendSuggestedEnvironment.currentLightValue} h/dobe.`,
          'Dzialanie: zmien czas swiecenia o 30-60 min i ocen efekt po 3-4 dniach.',
        ]
      );
    }

    if (hasEquipmentAnalysisAccess) {
      [tankEquipmentAssessment.heater, tankEquipmentAssessment.filter].forEach((entry) => {
        if (entry.status !== 'ok') {
          appendStep(
            entry.status === 'critical' ? 'critical' : 'warning',
            'Informacje',
            `Popraw ${entry.title.toLowerCase()}: ${entry.actions?.[0] || entry.details}.`,
            [entry.details, ...(Array.isArray(entry.actions) ? entry.actions.slice(0, 3) : [])]
          );
        }
      });
    }

    if (fishAggressionConflicts.length > 0) {
      appendStep(
        'critical',
        'Ryby',
        aggressionDetails.length > 0
          ? `Konflikty agresji: ${formatCompactNameList(aggressionDetails, 2)}.`
          : `Wykryto konflikty agresji (${fishAggressionConflicts.length}).`,
        [
          ...aggressionDetails.map((pair) => `Konflikt: ${pair}.`),
          'Dzialanie: rozdziel konfliktowe gatunki lub ogranicz agresywna obsade.',
        ]
      );
    }

    if (incompatibleFishCount > 0) {
      appendStep(
        incompatibleFishMajorCount >= 2 ? 'critical' : 'warning',
        'Ryby',
        fishMismatchNames
          ? `Niedopasowanie warunkow u ryb: ${fishMismatchNames}.`
          : `Wykryto niedopasowanie warunkow dla ${incompatibleFishCount} gat. ryb.`,
        [
          ...fishMismatch.details,
          'Dzialanie: dopasuj gatunki do pH, GH/KH, temperatury i litrazu.',
        ]
      );
    }

    if (fishSchoolingWarnings.length > 0) {
      appendStep(
        'warning',
        'Ryby',
        `Za mala liczebnosc ryb stadnych: ${formatCompactNameList(
          fishSchoolingWarnings.map((item) => item?.label),
          3
        )}.`,
        [
          ...schoolingDetails,
          'Dzialanie: zwieksz liczebnosc grup lub ogranicz gatunki stadne.',
        ]
      );
    }

    if (fishStockingSummary.hasFish && fishStockingSummary.hasTankLiters) {
      if (fishStockingSummary.ratio > 1.2) {
        appendStep(
          'critical',
          'Ryby',
          `Przerybienie jest wysokie (${Math.round(fishStockingSummary.ratio * 100)}%). Ogranicz obsade albo zwieksz litraz.`,
          [
            `Poziom obciazenia: ${Math.round(fishStockingSummary.ratio * 100)}%.`,
            'Dzialanie: zmniejsz obsade lub zwieksz litraz/filtracje.',
          ]
        );
      } else if (fishStockingSummary.isOverstocked) {
        appendStep(
          'warning',
          'Ryby',
          `Obsada jest lekko za duza (${Math.round(fishStockingSummary.ratio * 100)}%). Warto odciazyc zbiornik.`,
          [
            `Poziom obciazenia: ${Math.round(fishStockingSummary.ratio * 100)}%.`,
            'Dzialanie: lekko zmniejsz obsade i monitoruj NO2/NO3.',
          ]
        );
      }
    }

    if (incompatiblePlantCount > 0) {
      appendStep(
        incompatiblePlantMajorCount >= 2 ? 'critical' : 'warning',
        'Rosliny',
        plantMismatchNames
          ? `Niedopasowanie warunkow u roslin: ${plantMismatchNames}.`
          : `Wykryto niedopasowanie dla ${incompatiblePlantCount} gat. roslin.`,
        [
          ...plantMismatch.details,
          'Dzialanie: dopasuj oswietlenie, pH, GH/KH i temperature do gatunkow.',
        ]
      );
    }

    const activeIssueCasesCount =
      activeDiseaseCases.length + activePlantDiseaseCases.length + activeAlgaeCases.length;
    if (activeIssueCasesCount > 0) {
      appendStep(
        activeIssueCasesCount > 1 ? 'critical' : 'warning',
        'Choroby/Glony',
        activeIssueNames
          ? `Aktywne problemy: ${activeIssueNames}.`
          : `Aktywne problemy: ${activeIssueCasesCount}. Najpierw ustabilizuj leczenie i harmonogram.`,
        [
          ...activeDiseaseCases
            .map((item) => getIssueCaseDisplayName(item))
            .filter(Boolean)
            .slice(0, 2)
            .map((name) => `Choroba ryb: ${name}.`),
          ...activePlantDiseaseCases
            .map((item) => getIssueCaseDisplayName(item))
            .filter(Boolean)
            .slice(0, 2)
            .map((name) => `Choroba roslin: ${name}.`),
          ...activeAlgaeCases
            .map((item) => getIssueCaseDisplayName(item))
            .filter(Boolean)
            .slice(0, 2)
            .map((name) => `Glony: ${name}.`),
        ]
      );
    }

    [...activeDiseaseCases, ...activePlantDiseaseCases, ...activeAlgaeCases]
      .slice(0, 3)
      .forEach((caseItem) => {
      const issueName = String(
        caseItem?.issueName ?? caseItem?.diseaseName ?? caseItem?.name ?? 'problem'
      ).trim();
      const treatmentHint = String(
        caseItem?.treatmentPlan?.[0] ?? caseItem?.schedule?.[0]?.action ?? ''
      ).trim();
      const severityLabel = String(caseItem?.severity ?? 'medium').toLowerCase();
      const stepSeverity =
        severityLabel === 'high'
          ? 'critical'
          : severityLabel === 'low'
            ? 'warning'
            : 'warning';

        if (treatmentHint) {
          appendStep(
            stepSeverity,
            'Choroby/Glony',
            `${issueName}: ${treatmentHint} Jesli w terapii jest lek/preparat, stosuj go zgodnie z dawkowaniem na opakowaniu.`,
            [
              `Problem: ${issueName}.`,
              `Najblizszy krok: ${treatmentHint}.`,
              'Wskazowka: leki/preparaty stosuj zgodnie z etykieta producenta.',
            ]
          );
          return;
        }

        appendStep(
          stepSeverity,
          'Choroby/Glony',
          `${issueName}: sprawdz i realizuj plan terapii. Jesli w terapii jest lek/preparat, stosuj go zgodnie z dawkowaniem na opakowaniu.`,
          [
            `Problem: ${issueName}.`,
            'Dzialanie: otworz plan leczenia i realizuj kolejne kroki.',
            'Wskazowka: leki/preparaty stosuj zgodnie z etykieta producenta.',
          ]
        );
      });

    return steps
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 6);
  }, [
    activeAlgaeCases,
    activeDiseaseCases,
    activePlantDiseaseCases,
    currentAnalysis?.recommendations,
    fishAggressionConflicts,
    fishCompatibilityResults,
    incompatibleFishCount,
    incompatibleFishMajorCount,
    fishSchoolingWarnings,
    fishStockingSummary,
    hasEquipmentAnalysisAccess,
    hasGuidedRecommendationAccess,
    incompatiblePlantCount,
    incompatiblePlantMajorCount,
    plantCompatibilityResults,
    selectedTank,
    tankEquipmentAssessment.filter,
    tankEquipmentAssessment.heater,
    trendSuggestedEnvironment.currentLightValue,
    trendSuggestedEnvironment.currentTempValue,
    trendSuggestedEnvironment.isLightWithinSuggested,
    trendSuggestedEnvironment.isTempWithinSuggested,
    trendSuggestedEnvironment.recommendedLightRange,
    trendSuggestedEnvironment.recommendedTempRange,
  ]);
  const selectedTankHealthAssessment = useMemo(() => {
    if (!selectedTank) {
      return null;
    }

    const activeIssueCases = [
      ...activeDiseaseCases,
      ...activePlantDiseaseCases,
      ...activeAlgaeCases,
    ];

    return buildAquariumHealthAssessment({
      tank: selectedTank,
      measurement: currentMeasurement,
      stockItems,
      activeIssueCases,
    });
  }, [
    activeAlgaeCases,
    activeDiseaseCases,
    activePlantDiseaseCases,
    currentMeasurement,
    selectedTank,
    stockItems,
  ]);
  const suggestionChangeItems = useMemo(() => {
    if (!selectedTank) {
      return [];
    }

    return buildAttentionItemsForTank({
      hasGeneralRecommendationAccess,
      hasEquipmentSaveAccess,
      equipmentAssessment: tankEquipmentAssessment,
      trendSuggestedEnvironment,
      fishCompatibilityResults,
      plantCompatibilityResults,
      fishAggressionConflictsCount: fishAggressionConflicts.length,
      fishAggressionConflicts,
      fishSchoolingWarningsCount: fishSchoolingWarnings.length,
      fishSchoolingWarnings,
      fishStockingSummary,
      activeDiseaseCasesCount: activeDiseaseCases.length,
      activeDiseaseCases,
      activePlantDiseaseCasesCount: activePlantDiseaseCases.length,
      activePlantDiseaseCases,
      activeAlgaeCasesCount: activeAlgaeCases.length,
      activeAlgaeCases,
      selectedTankHealthAssessment,
    });
  }, [
    activeAlgaeCases,
    activeDiseaseCases,
    activePlantDiseaseCases,
    fishAggressionConflicts,
    fishCompatibilityResults,
    fishSchoolingWarnings,
    fishStockingSummary,
    plantCompatibilityResults,
    hasGeneralRecommendationAccess,
    hasEquipmentSaveAccess,
    selectedTankHealthAssessment,
    selectedTank,
    tankEquipmentAssessment,
    trendSuggestedEnvironment,
  ]);
  const currentParametersSectionSeverity = useMemo(() => {
    if (!selectedTank || historyLoading) {
      return 'none';
    }

    if (!currentMeasurement || currentMeasurementDetailRows.length === 0) {
      return 'none';
    }

    const severities = currentMeasurementDetailRows
      .map((item) =>
        currentMeasurementIssueSeverityByKey.get(String(item.key ?? ''))
      )
      .filter(Boolean);

    if (severities.includes('critical')) {
      return 'critical';
    }

    if (severities.includes('warning')) {
      return 'warning';
    }

    return 'none';
  }, [
    currentMeasurement,
    currentMeasurementDetailRows,
    currentMeasurementIssueSeverityByKey,
    historyLoading,
    selectedTank,
  ]);
  const suggestionsSectionSeverity = useMemo(() => {
    if (!selectedTank || !hasGeneralRecommendationAccess) {
      return 'none';
    }

    if (suggestionChangeItems.some((item) => item.severity === 'critical')) {
      return 'critical';
    }

    if (suggestionChangeItems.length > 0) {
      return 'warning';
    }

    return 'none';
  }, [
    hasGeneralRecommendationAccess,
    selectedTank,
    suggestionChangeItems,
  ]);
  const guidedPlanSectionSeverity = useMemo(() => {
    if (
      !selectedTank ||
      !hasGeneralRecommendationAccess ||
      !hasGuidedRecommendationAccess ||
      guidedRecommendationSteps.length === 0
    ) {
      return 'none';
    }

    if (guidedRecommendationSteps.some((item) => item.severity === 'critical')) {
      return 'critical';
    }

    return 'warning';
  }, [
    guidedRecommendationSteps,
    hasGeneralRecommendationAccess,
    hasGuidedRecommendationAccess,
    selectedTank,
  ]);
  const waterTestingSectionSeverity = useMemo(() => {
    if (!selectedTank || !hasTaskReminderAccess) {
      return 'none';
    }

    if (
      waterTestingSchedule.isOverdue ||
      (waterTestingSchedule.parameters ?? []).some((plan) => plan.level === 'problem')
    ) {
      return 'critical';
    }

    if (
      waterTestingSchedule.requiresPostWaterChangeTest ||
      (waterTestingSchedule.parameters ?? []).some((plan) => plan.level === 'warning')
    ) {
      return 'warning';
    }

    return 'none';
  }, [
    hasTaskReminderAccess,
    selectedTank,
    waterTestingSchedule.isOverdue,
    waterTestingSchedule.parameters,
    waterTestingSchedule.requiresPostWaterChangeTest,
  ]);
  const onboardingSectionSeverity = useMemo(() => {
    if (
      !selectedTank ||
      !tankOnboardingPlan.isActive ||
      !hasTaskChecklistAccess
    ) {
      return 'none';
    }

    if (tankOnboardingPlan.rows.some((row) => row.level === 'warning')) {
      return 'warning';
    }

    if (tankOnboardingPlan.todayItems.length > 0) {
      return 'warning';
    }

    return 'none';
  }, [
    hasTaskChecklistAccess,
    selectedTank,
    tankOnboardingPlan.isActive,
    tankOnboardingPlan.rows,
    tankOnboardingPlan.todayItems,
  ]);
  const reviewTabSeverity = useMemo(
    () =>
      getHighestSeverity([
        currentParametersSectionSeverity,
        suggestionsSectionSeverity,
        waterTestingSectionSeverity,
        onboardingSectionSeverity,
      ]),
    [
      currentParametersSectionSeverity,
      onboardingSectionSeverity,
      suggestionsSectionSeverity,
      waterTestingSectionSeverity,
    ]
  );
  const tankInfoTabSeverity = useMemo(() => {
    if (!selectedTank || !hasEquipmentSaveAccess) {
      return 'none';
    }

    const equipmentEntries = [
      tankEquipmentAssessment.heater,
      tankEquipmentAssessment.filter,
    ];

    if (equipmentEntries.some((entry) => entry.status === 'critical')) {
      return 'critical';
    }

    if (
      equipmentEntries.some(
        (entry) => entry.status === 'warning' || entry.status === 'none'
      )
    ) {
      return 'warning';
    }

    return 'none';
  }, [
    hasEquipmentSaveAccess,
    selectedTank,
    tankEquipmentAssessment.filter,
    tankEquipmentAssessment.heater,
  ]);
  const fishTabSeverity = useMemo(() => {
    const fishItems = stockItems.filter((item) => item.type === 'fish');

    if (fishItems.length === 0) {
      return 'none';
    }

    if (
      fishAggressionConflicts.length > 0 ||
      (fishStockingSummary.hasFish &&
        fishStockingSummary.hasTankLiters &&
        fishStockingSummary.ratio > 1.2)
    ) {
      return 'critical';
    }

    if (
      hasFishCompatibilityIssues ||
      fishSchoolingWarnings.length > 0 ||
      fishStockingSummary.isOverstocked
    ) {
      return 'warning';
    }

    return 'none';
  }, [
    fishAggressionConflicts.length,
    fishSchoolingWarnings.length,
    fishStockingSummary.hasFish,
    fishStockingSummary.hasTankLiters,
    fishStockingSummary.isOverstocked,
    fishStockingSummary.ratio,
    hasFishCompatibilityIssues,
    stockItems,
  ]);
  const plantTabSeverity = useMemo(() => {
    const plantItems = stockItems.filter((item) => item.type === 'plant');

    if (plantItems.length === 0) {
      return 'none';
    }

    if (incompatiblePlantMajorCount >= 2) {
      return 'critical';
    }

    if (incompatiblePlantCount > 0) {
      return 'warning';
    }

    return 'none';
  }, [incompatiblePlantCount, incompatiblePlantMajorCount, stockItems]);
  const issuesTabSeverity = useMemo(() => {
    const allIssueCases = [
      ...activeDiseaseCases,
      ...activePlantDiseaseCases,
      ...activeAlgaeCases,
    ];

    if (allIssueCases.length === 0) {
      return 'none';
    }

    const highestPriority = allIssueCases.reduce(
      (maxSeverity, caseItem) =>
        Math.max(
          maxSeverity,
          DISEASE_SEVERITY_PRIORITY[String(caseItem.severity ?? 'low').toLowerCase()] ?? 0
        ),
      0
    );

    return highestPriority >= DISEASE_SEVERITY_PRIORITY.high
      ? 'critical'
      : 'warning';
  }, [activeAlgaeCases, activeDiseaseCases, activePlantDiseaseCases]);
  const renderReviewSectionTitle = (title, severity = 'none') => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}>
      {severity === 'warning' ? (
        <Text
          style={{
            color: themeWarningText,
            fontSize: 16,
            fontWeight: '700',
          }}>
          ⚠
        </Text>
      ) : severity === 'critical' ? (
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: themeDanger,
          }}>
          <Text
            style={{
              color: '#ffffff',
              fontSize: 12,
              fontWeight: '700',
              lineHeight: 14,
            }}>
            !
          </Text>
        </View>
      ) : null}
      <Text
        style={{
          color: themeTextPrimary,
          fontWeight: '700',
          fontSize: 16,
        }}>
        {title}
      </Text>
    </View>
  );
  const renderNavigationChipLabel = (title, severity = 'none', isActive = false) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}>
      {severity === 'warning' ? (
        <Text
          style={{
            color: themeWarningText,
            fontSize: 13,
            fontWeight: '700',
          }}>
          {'⚠'}
        </Text>
      ) : severity === 'critical' ? (
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: themeDanger,
          }}>
          <Text
            style={{
              color: '#ffffff',
              fontSize: 11,
              fontWeight: '700',
              lineHeight: 12,
            }}>
            !
          </Text>
        </View>
      ) : null}
      <Text
        style={{
          color: isActive ? themeAccentOnStrong : themeChipText,
          fontWeight: '700',
          fontSize: 12,
        }}>
        {title}
      </Text>
    </View>
  );

  useEffect(() => {
    if (!user?.uid) {
      return;
    }

    let cancelled = false;
    const tn = createTranslator(appSettings.language);
    const storageKey = getWaterTestNotificationStorageKey(user.uid);

    const clearWaterTestReminderNotification = async () => {
      try {
        const Notifications = await ensureNotificationsModule();

        if (!Notifications) {
          return;
        }

        const existingNotificationId = await AsyncStorage.getItem(storageKey);

        if (existingNotificationId) {
          await Notifications.cancelScheduledNotificationAsync(
            existingNotificationId
          ).catch(() => {});
        }

        const scheduledNotifications =
          await Notifications.getAllScheduledNotificationsAsync();
        await Promise.all(
          scheduledNotifications
            .filter((item) => item?.content?.data?.type === 'water_test_reminder')
            .map((item) =>
              Notifications.cancelScheduledNotificationAsync(item.identifier).catch(
                () => {}
              )
            )
        );

        await AsyncStorage.removeItem(storageKey).catch(() => {});
      } catch (error) {
        console.warn(
          tn('notificationScheduleError'),
          error instanceof Error ? error.message : String(error)
        );
      }
    };

    if (!hasTaskReminderAccess) {
      clearWaterTestReminderNotification();
      return () => {
        cancelled = true;
      };
    }

    const syncWaterTestReminderNotification = async () => {
      try {
        const Notifications = await ensureNotificationsModule();

        if (!Notifications) {
          if (!IS_EXPO_GO) {
            console.warn(tn('notificationsMissingModule'));
          }
          return;
        }

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('water-test-reminders', {
            name: tn('notificationChannelName'),
            importance: Notifications.AndroidImportance.DEFAULT,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: themeAccent,
          });
        }

        const permissions = await Notifications.getPermissionsAsync();
        let finalStatus = permissions.status;

        if (finalStatus !== 'granted') {
          const requested = await Notifications.requestPermissionsAsync();
          finalStatus = requested.status;
        }

        if (finalStatus !== 'granted') {
          console.warn(tn('notificationsPermissionDenied'));
          return;
        }

        const existingNotificationId = await AsyncStorage.getItem(storageKey);

        if (existingNotificationId) {
          await Notifications.cancelScheduledNotificationAsync(
            existingNotificationId
          ).catch(() => {});
        }

        const scheduledNotifications =
          await Notifications.getAllScheduledNotificationsAsync();
        await Promise.all(
          scheduledNotifications
            .filter(
              (item) =>
                item?.content?.data?.type === 'water_test_reminder' &&
                item.identifier !== existingNotificationId
            )
            .map((item) =>
              Notifications.cancelScheduledNotificationAsync(item.identifier).catch(
                () => {}
              )
            )
        );

        const safeTankName = selectedTank?.name ?? null;
        const safeTankId = selectedTank?.id ?? '';

        const body = safeTankName
          ? tn('notificationDailyWithTank', { name: safeTankName })
          : tn('notificationDailyNoTank');

        const trigger =
          Platform.OS === 'android'
            ? {
                type: 'daily',
                hour: 13,
                minute: 0,
                channelId: 'water-test-reminders',
              }
            : {
                type: 'daily',
                hour: 13,
                minute: 0,
              };

        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: safeTankName
              ? tn('notificationTitleWithTank', { name: safeTankName })
              : tn('notificationTitle'),
            body,
            sound: true,
            data: {
              type: 'water_test_reminder',
              tankId: safeTankId,
            },
          },
          trigger,
        });

        if (!cancelled) {
          await AsyncStorage.setItem(storageKey, notificationId);
        }
      } catch (error) {
        console.warn(
          tn('notificationScheduleError'),
          error instanceof Error ? error.message : String(error)
        );
      }
    };

    syncWaterTestReminderNotification();

    return () => {
      cancelled = true;
    };
  }, [
    user?.uid,
    appSettings.language,
    hasTaskReminderAccess,
    selectedTank?.id,
    selectedTank?.name,
    themeAccent,
  ]);

  if (loading) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: themeModalBg }} />;
  }

  if (!user) {
    if (isAccountDeletedScreenVisible) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: themeModalBg }}>
          <View
            style={{
              flex: 1,
              paddingHorizontal: 24,
              justifyContent: 'center',
            }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: themeSuccessBg,
                borderRadius: 14,
                padding: 18,
                backgroundColor: themeSuccessSoftBg,
              }}>
              <Text
                style={{
                  color: themeTextPrimary,
                  fontSize: 22,
                  fontWeight: '700',
                  textAlign: 'center',
                }}>
                {t('deleteAccountDoneScreenTitle')}
              </Text>
              <Text
                style={{
                  color: themeTextSecondary,
                  marginTop: 10,
                  textAlign: 'center',
                }}>
                {t('deleteAccountDoneScreenSubtitle')}
              </Text>

              <View style={{ marginTop: 14 }}>
                <Text style={{ color: themeTextPrimary, marginBottom: 6 }}>
                  - {t('deleteAccountDoneItemTanks')}
                </Text>
                <Text style={{ color: themeTextPrimary, marginBottom: 6 }}>
                  - {t('deleteAccountDoneItemMeasurements')}
                </Text>
                <Text style={{ color: themeTextPrimary, marginBottom: 6 }}>
                  - {t('deleteAccountDoneItemStock')}
                </Text>
                <Text style={{ color: themeTextPrimary }}>
                  - {t('deleteAccountDoneItemIssues')}
                </Text>
              </View>

              <Pressable
                onPress={() => setIsAccountDeletedScreenVisible(false)}
                style={{
                  marginTop: 16,
                  backgroundColor: themeSuccessBg,
                  paddingVertical: 12,
                  borderRadius: 10,
                }}>
                <Text
                  style={{
                    color: themeAccentOnStrong,
                    textAlign: 'center',
                    fontWeight: '700',
                  }}>
                  {t('deleteAccountDoneScreenCta')}
                </Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      );
    }

    const isRegisterMode = authMode === 'register';

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: themePageBg }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            style={{ flex: 1, backgroundColor: themePageBg }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScrollBeginDrag={Keyboard.dismiss}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              paddingHorizontal: 22,
              paddingVertical: 26,
            }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: themeBorder,
                  borderRadius: 24,
                  backgroundColor: themeCardBg,
                  paddingHorizontal: 18,
                  paddingVertical: 20,
                  shadowColor: '#001322',
                  shadowOpacity: isLightTheme ? 0.14 : 0.36,
                  shadowRadius: 24,
                  shadowOffset: { width: 0, height: 12 },
                  elevation: 8,
                }}>
              <View
                style={{
                  alignSelf: 'center',
                  borderWidth: 1,
                  borderColor: themeAccent,
                  borderRadius: 999,
                  backgroundColor: themeAccentSoftBg,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  marginBottom: 14,
                }}>
                <Text
                  style={{
                    color: themeAccentText,
                    fontSize: 11,
                    letterSpacing: 0.5,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                  }}>
                  Premium Experience
                </Text>
              </View>
              <Text
                style={{
                  color: themeTextPrimary,
                  fontSize: 26,
                  fontWeight: '700',
                  marginBottom: 6,
                  textAlign: 'center',
                }}>
                {t('aquariumAssistant')}
              </Text>

              <Text
                style={{
                  color: themeTextSecondary,
                  textAlign: 'center',
                  marginBottom: 24,
                  lineHeight: 21,
                }}>
                {isRegisterMode
                  ? t('authRegisterSubtitle')
                  : t('authLoginSubtitle')}
              </Text>

              {isRegisterMode ? (
                <TextInput
                  placeholder={t('nameOrNick')}
                  placeholderTextColor={themePlaceholder}
                  value={authNickname}
                  onChangeText={setAuthNickname}
                  autoCapitalize="words"
                  style={{
                    borderWidth: 1,
                    borderColor: themeInputBorder,
                    color: themeInputText,
                    padding: 12,
                    borderRadius: 12,
                    marginBottom: 10,
                    backgroundColor: themeInputBg,
                  }}
                />
              ) : null}

              <TextInput
                placeholder={t('email')}
                placeholderTextColor={themePlaceholder}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                style={{
                  borderWidth: 1,
                  borderColor: themeInputBorder,
                  color: themeInputText,
                  padding: 12,
                  borderRadius: 12,
                  marginBottom: 10,
                  backgroundColor: themeInputBg,
                }}
              />

              <TextInput
                placeholder={t('password')}
                placeholderTextColor={themePlaceholder}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                style={{
                  borderWidth: 1,
                  borderColor: themeInputBorder,
                  color: themeInputText,
                  padding: 12,
                  borderRadius: 12,
                  marginBottom: 14,
                  backgroundColor: themeInputBg,
                }}
              />

              {!isRegisterMode ? (
                <Pressable
                  onPress={handleOpenForgotPasswordModal}
                  disabled={authBusy}
                  style={{ marginBottom: 14, opacity: authBusy ? 0.7 : 1 }}>
                  <Text
                    style={{
                      color: themeAccentText,
                      textAlign: 'right',
                      fontSize: 12,
                      fontWeight: '600',
                    }}>
                    {t('forgotPassword')}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={handleAuthSubmit}
                style={{
                  backgroundColor: themeAccent,
                  padding: 14,
                  borderRadius: 12,
                  marginBottom: 10,
                  opacity: authBusy ? 0.7 : 1,
                  shadowColor: themeAccent,
                  shadowOpacity: isLightTheme ? 0.18 : 0.28,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 4,
                }}>
                <Text
                  style={{
                    color: themeAccentOnStrong,
                    textAlign: 'center',
                    fontWeight: '700',
                  }}>
                  {isRegisterMode ? t('register') : t('login')}
                </Text>
              </Pressable>

              {!isRegisterMode ? (
                <>
                  <Pressable
                    onPress={handleGoogleAuth}
                    disabled={
                      authBusy || IS_EXPO_GO || !isGoogleAuthConfiguredForPlatform
                    }
                    style={{
                      borderWidth: 1,
                      borderColor: themeBorder,
                      backgroundColor: themeCardBgAlt,
                      padding: 14,
                      borderRadius: 12,
                      marginBottom: 10,
                      opacity:
                        authBusy || IS_EXPO_GO || !isGoogleAuthConfiguredForPlatform
                          ? 0.6
                          : 1,
                    }}>
                    <Text
                      style={{
                        color: themeTextPrimary,
                        textAlign: 'center',
                        fontWeight: '700',
                      }}>
                      {t('loginWithGoogle')}
                    </Text>
                  </Pressable>
                  {IS_EXPO_GO ? (
                    <Text
                      style={{
                        color: themeTextSecondary,
                        fontSize: 12,
                        marginBottom: 10,
                      }}>
                      Google logowanie wymaga development build (poza Expo Go).
                    </Text>
                  ) : !isGoogleAuthConfiguredForPlatform ? (
                    <Text
                      style={{
                        color: themeTextSecondary,
                        fontSize: 12,
                        marginBottom: 10,
                      }}>
                      Uzupelnij Google Client ID dla tej platformy w .env.
                    </Text>
                  ) : null}
                </>
              ) : null}

              <Pressable
                onPress={() =>
                  setAuthMode((prev) =>
                    prev === 'login' ? 'register' : 'login'
                  )
                }>
                <Text
                  style={{
                    color: themeAccentText,
                    textAlign: 'center',
                    fontWeight: '600',
                  }}>
                  {isRegisterMode
                    ? t('haveAccount')
                    : t('noAccount')}
                </Text>
              </Pressable>
              </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {isForgotPasswordModalVisible ? (
          <BottomSheetModal
            visible
            onClose={handleCloseForgotPasswordModal}
            title={t('forgotPasswordModalTitle')}
            themeCardBg={themeCardBg}
            themeBorder={themeBorder}
            themeTextPrimary={themeTextPrimary}
            themeCardBgAlt={themeCardBgAlt}
            themeOverlay={themeOverlay}
            themeDragHandle={themeDragHandle}
            isLightTheme={isLightTheme}
            maxWidth={560}
            heightPercent={48}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
            <ScrollView
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{
                paddingHorizontal: 14,
                paddingTop: 14,
                paddingBottom: Math.max(insets.bottom + 20, 20),
              }}>
              <Text style={{ color: themeTextSecondary, marginBottom: 10, fontSize: 12 }}>
                {t('forgotPasswordModalHint')}
              </Text>

              <TextInput
                placeholder={t('email')}
                placeholderTextColor={themePlaceholder}
                value={forgotPasswordEmail}
                onChangeText={setForgotPasswordEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                style={{
                  borderWidth: 1,
                  borderColor: themeInputBorder,
                  color: themeInputText,
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 12,
                  backgroundColor: themeInputBg,
                }}
              />

              <Pressable
                onPress={handleForgotPassword}
                disabled={authBusy}
                style={{
                  backgroundColor: themeAccent,
                  padding: 12,
                  borderRadius: 12,
                  opacity: authBusy ? 0.7 : 1,
                }}>
                <Text
                  style={{
                    color: themeAccentOnStrong,
                    textAlign: 'center',
                    fontWeight: '700',
                  }}>
                  {t('forgotPasswordSendButton')}
                </Text>
              </Pressable>
            </ScrollView>
          </BottomSheetModal>
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: themePageBg,
      }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <ScrollView
          style={{
            flex: 1,
            backgroundColor: themePageBg,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={Keyboard.dismiss}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={themeAccent}
              colors={[themeAccent]}
            />
          }
          contentContainerStyle={{
            paddingHorizontal: 18,
            paddingTop: 18,
            paddingBottom: 24,
          }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginBottom: 18,
            }}>
            <Pressable
              onPress={handleOpenDrawer}
              style={{
                width: 44,
                height: 44,
                borderWidth: 1,
                borderColor: themeBorder,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: themeCardBg,
                shadowColor: '#001322',
                shadowOpacity: isLightTheme ? 0.1 : 0.22,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
                elevation: 3,
              }}>
              <View
                style={{
                  width: 16,
                  height: 2,
                  backgroundColor: themeTextPrimary,
                  marginBottom: 3,
                }}
              />
              <View
                style={{
                  width: 16,
                  height: 2,
                  backgroundColor: themeTextPrimary,
                  marginBottom: 3,
                }}
              />
              <View
                style={{
                  width: 16,
                  height: 2,
                  backgroundColor: themeTextPrimary,
                }}
              />
            </Pressable>

            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: themeBorder,
                borderRadius: 20,
                backgroundColor: themeCardBg,
                paddingHorizontal: 12,
                paddingVertical: 10,
                shadowColor: '#001322',
                shadowOpacity: isLightTheme ? 0.1 : 0.26,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
                elevation: 4,
              }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}>
              {!showHeaderTankSwitcher ? null : (
                <Pressable
                  onPress={() => handleSwitchTank('prev')}
                  style={{
                    width: 32,
                    height: 32,
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: themeCardBgAlt,
                  }}>
                  <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>{'<'}</Text>
                </Pressable>
              )}
              <Text
                numberOfLines={1}
                  style={{
                    color: themeTextPrimary,
                    fontSize: 23,
                    fontWeight: '700',
                    textAlign: 'center',
                  flex: 1,
                  paddingHorizontal: 4,
                }}>
                {headerTitle}
              </Text>
              {!showHeaderTankSwitcher ? null : (
                <Pressable
                  onPress={() => handleSwitchTank('next')}
                  style={{
                    width: 32,
                    height: 32,
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: themeCardBgAlt,
                  }}>
                  <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>{'>'}</Text>
                </Pressable>
              )}
            </View>
            </View>
          </View>

          {(isAquariumSection || isHealthTankMode) && (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 14,
              }}>
              <Pressable
                onPress={() => setActiveSection('review')}
                style={{
                  borderWidth: 1,
                  borderColor:
                    activeSection === 'review' ? themeAccent : themeBorderStrong,
                  backgroundColor:
                    activeSection === 'review'
                      ? themeAccentStrongBg
                      : themeChipBg,
                  borderRadius: 999,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                }}>
                {renderNavigationChipLabel(
                  t('sectionReview'),
                  reviewTabSeverity,
                  activeSection === 'review'
                )}
              </Pressable>
              <Pressable
                onPress={() => setActiveSection('tankInfo')}
                style={{
                  borderWidth: 1,
                  borderColor:
                    activeSection === 'tankInfo' ? themeAccent : themeBorderStrong,
                  backgroundColor:
                    activeSection === 'tankInfo'
                      ? themeAccentStrongBg
                      : themeChipBg,
                  borderRadius: 999,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                }}>
                {renderNavigationChipLabel(
                  t('sectionInfo'),
                  tankInfoTabSeverity,
                  activeSection === 'tankInfo'
                )}
              </Pressable>
              <Pressable
                onPress={() => setActiveSection('fish')}
                style={{
                  borderWidth: 1,
                  borderColor:
                    activeSection === 'fish' ? themeAccent : themeBorderStrong,
                  backgroundColor:
                    activeSection === 'fish'
                      ? themeAccentStrongBg
                      : themeChipBg,
                  borderRadius: 999,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                }}>
                {renderNavigationChipLabel(
                  t('sectionFish'),
                  fishTabSeverity,
                  activeSection === 'fish'
                )}
              </Pressable>
              <Pressable
                onPress={() => setActiveSection('plant')}
                style={{
                  borderWidth: 1,
                  borderColor:
                    activeSection === 'plant' ? themeAccent : themeBorderStrong,
                  backgroundColor:
                    activeSection === 'plant'
                      ? themeAccentStrongBg
                      : themeChipBg,
                  borderRadius: 999,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                }}>
                {renderNavigationChipLabel(
                  t('sectionPlants'),
                  plantTabSeverity,
                  activeSection === 'plant'
                )}
              </Pressable>
              {activeDiseaseCases.length +
                activePlantDiseaseCases.length +
                activeAlgaeCases.length >
                0 && (
                <Pressable
                  onPress={() => setActiveSection('issues', 'internal')}
                  style={{
                    borderWidth: 1,
                    borderColor:
                      activeSection === 'issues' ? themeAccent : themeBorderStrong,
                    backgroundColor:
                      activeSection === 'issues'
                        ? themeAccentStrongBg
                        : themeChipBg,
                    borderRadius: 999,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                  }}>
                  {renderNavigationChipLabel(
                    t('issuesTabLabel', {
                      count:
                        activeDiseaseCases.length +
                        activePlantDiseaseCases.length +
                        activeAlgaeCases.length,
                    }),
                    issuesTabSeverity,
                    activeSection === 'issues'
                  )}
                </Pressable>
              )}
            </View>
          )}

          {isHomeSection && (
            <>
              {homeLoading ? (
                <Text style={{ color: themeTextSecondary, marginBottom: 14 }}>{t('loading')}</Text>
              ) : tanks.length === 0 ? (
                <Text style={{ color: themeTextSecondary, marginBottom: 14 }}>{t('noTankAddFirst')}</Text>
              ) : (
                homeTankSummaries.map((summary) => {
                  const scoreValue = summary.healthAssessment?.score ?? 0;
                  const scoreColor =
                    scoreValue >= 85
                      ? isLightTheme
                        ? '#1f7a3a'
                        : '#9be7a3'
                      : scoreValue >= 65
                        ? themeTextPrimary
                        : scoreValue >= 50
                          ? isLightTheme
                            ? '#8a5a12'
                            : '#ffdd99'
                          : '#ffb3b3';
                  const scoreBadgeBg =
                    scoreValue >= 85
                      ? isLightTheme
                        ? '#e8f8eb'
                        : '#143220'
                      : scoreValue >= 65
                        ? isLightTheme
                          ? '#eef2ff'
                          : '#1b2238'
                        : scoreValue >= 50
                          ? isLightTheme
                            ? '#fff7e6'
                            : '#3a2a14'
                          : isLightTheme
                            ? '#fdecec'
                            : '#3a1414';
                  const scoreBadgeBorder =
                    scoreValue >= 85
                      ? isLightTheme
                        ? '#1f7a3a'
                        : '#9be7a3'
                      : scoreValue >= 65
                        ? isLightTheme
                          ? '#355caa'
                          : '#9bb5ff'
                        : scoreValue >= 50
                          ? isLightTheme
                            ? '#8a5a12'
                            : '#ffdd99'
                          : isLightTheme
                            ? '#c92a2a'
                            : '#ffb3b3';
                  const statusColor =
                    summary.statusSeverity === 'critical'
                      ? '#ffb3b3'
                      : summary.statusSeverity === 'warning'
                        ? isLightTheme
                          ? '#8a5a12'
                          : '#ffdd99'
                        : summary.statusSeverity === 'ok'
                          ? isLightTheme
                            ? '#1f7a3a'
                            : '#9be7a3'
                          : themeTextSecondary;
                  const statusText =
                    summary.statusSeverity === 'critical'
                      ? t('homeStatusCritical')
                      : summary.statusSeverity === 'warning'
                        ? t('homeStatusWarning')
                        : summary.statusSeverity === 'ok'
                          ? t('homeStatusOk')
                          : t('homeStatusNoData');
                  const visibleActionsTodayCount = hasTaskChecklistAccess
                    ? summary.actionsTodayCount
                    : summary.reminderActionsTodayCount;

                  return (
                    <Pressable
                      key={`home-tank-${summary.tank.id}`}
                      onPress={() => handleOpenTankFromHome(summary.tank)}
                      style={{
                        borderWidth: 1,
                        borderColor: themeBorder,
                        borderRadius: 8,
                        padding: 10,
                        paddingRight: 80,
                        marginBottom: 8,
                        backgroundColor: themeCardBgAlt,
                      }}>
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation?.();
                          handleShowHomeTankScoreDetails(summary);
                        }}
                        style={{
                          position: 'absolute',
                          right: 10,
                          top: 10,
                          width: 56,
                          height: 56,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: scoreBadgeBorder,
                          backgroundColor: scoreBadgeBg,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        <Text
                          style={{
                            color: scoreColor,
                            fontSize: 20,
                            fontWeight: '800',
                            lineHeight: 22,
                          }}>
                          {Math.round(scoreValue)}
                        </Text>
                      </Pressable>
                      <Text style={{ color: themeTextPrimary, fontWeight: '700', fontSize: 15 }}>
                        {summary.tank.name}
                      </Text>
                      <Text style={{ color: statusColor, marginTop: 4, fontWeight: '700' }}>
                        {t('status', { value: statusText })}
                      </Text>
                      {hasTaskReminderAccess ? (
                        <Text style={{ color: themeTextSecondary, marginTop: 2, fontSize: 12 }}>
                          {t('homeActionsToday', { count: visibleActionsTodayCount })}
                        </Text>
                      ) : (
                        <Text style={{ color: themeTextSecondary, marginTop: 2, fontSize: 12 }}>
                          {t('subscriptionTasksLocked')}
                        </Text>
                      )}
                      {hasExtendedAlertAccess ? (
                        <Text style={{ color: themeTextSecondary, marginTop: 2, fontSize: 12 }}>
                          {t('homeProblemsCount', { count: summary.issueCount })}
                        </Text>
                      ) : (
                        <Text style={{ color: themeTextSecondary, marginTop: 2, fontSize: 12 }}>
                          {t('subscriptionAlertsSimple')}
                        </Text>
                      )}
                    </Pressable>
                  );
                })
              )}
              <Pressable
                onPress={handleStartAddTank}
                disabled={!canAddTank}
                style={{
                  marginTop: 10,
                  borderWidth: 1,
                  borderColor: canAddTank ? themeBorder : themeWarningBg,
                  borderRadius: 8,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: canAddTank
                    ? themeCardBgAlt
                    : themeWarningSoftBg,
                  opacity: canAddTank ? 1 : 0.7,
                }}>
                <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>{t('addTank')}</Text>
              </Pressable>
              <Text
                style={{
                  color: themeTextSecondary,
                  marginTop: 8,
                  fontSize: 12,
                }}>
                {tankLimitUsageText}
              </Text>
              {isOverTankLimit ? (
                <View
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: themeWarningBg,
                    borderRadius: 8,
                    padding: 10,
                    backgroundColor: themeWarningSoftBg,
                  }}>
                  <Text
                    style={{
                      color: themeWarningText,
                      fontSize: 12,
                      fontWeight: '700',
                    }}>
                    {t('subscriptionTankLimitOver', {
                      plan: currentSubscriptionTierLabel,
                      current: currentTankCount,
                      limit: tankLimit,
                    })}
                  </Text>
                  <Text
                    style={{
                      color: themeTextPrimary,
                      marginTop: 4,
                      fontSize: 12,
                    }}>
                    {t('subscriptionTankLimitUpgradeHint')}
                  </Text>
                </View>
              ) : !canAddTank ? (
                <Text
                  style={{
                    color: themeWarningText,
                    marginTop: 8,
                    fontSize: 12,
                  }}>
                  {t('subscriptionTankLimitUpgradeHint')}
                </Text>
              ) : null}
            </>
          )}

          {isTankSection && (
            <View
              style={{
                borderWidth: 1,
                borderColor: themeBorder,
                borderRadius: 10,
                padding: 12,
                marginBottom: 18,
                backgroundColor: themeCardBg,
              }}>
              <Text
                style={{
                  color: themeTextPrimary,
                  fontWeight: '700',
                  fontSize: 16,
                  marginBottom: 8,
                }}>
                {t('addMeasurementsCard')}
              </Text>
              <Text style={{ color: themeTextSecondary }}>
                {selectedTank
                  ? t('activeTankWithValue', {
                      name: selectedTank.name,
                      liters: formatLiters(selectedTank.liters),
                    })
                  : t('addAndSelectTankInMenu')}
              </Text>
            </View>
          )}

          {isTankInfoSection && (
            <>
              {!selectedTank ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 18,
                    padding: 18,
                    marginBottom: 18,
                    backgroundColor: themeCardBg,
                    shadowColor: '#000',
                    shadowOpacity: isLightTheme ? 0.06 : 0,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: isLightTheme ? 2 : 0,
                  }}>
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      borderWidth: 1,
                      borderColor: themeAccent,
                      borderRadius: 999,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      backgroundColor: themeAccentSoftBg,
                      marginBottom: 12,
                    }}>
                    <Text
                      style={{
                        color: themeAccentText,
                        fontSize: 12,
                        fontWeight: '700',
                      }}>
                      {t('sectionInfo')}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: themeTextPrimary,
                      fontWeight: '800',
                      fontSize: 24,
                      lineHeight: 30,
                    }}>
                    {t('noActiveTank')}
                  </Text>
                  <Text
                    style={{
                      color: themeTextSecondary,
                      marginTop: 8,
                      fontSize: 14,
                      lineHeight: 21,
                    }}>
                    Wybierz aktywne akwarium, a tutaj pokazemy jego profil,
                    oswietlenie i sprzet w bardziej czytelnym widoku.
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: themeAccent,
                    borderRadius: 22,
                    padding: 18,
                    marginBottom: 14,
                    backgroundColor: themeAccentSoftBg,
                    shadowColor: '#000',
                    shadowOpacity: isLightTheme ? 0.08 : 0,
                    shadowRadius: 18,
                    shadowOffset: { width: 0, height: 10 },
                    elevation: isLightTheme ? 2 : 0,
                  }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 14,
                    }}>
                    <View style={{ flex: 1 }}>
                      <View
                        style={{
                          alignSelf: 'flex-start',
                          borderWidth: 1,
                          borderColor: themeAccent,
                          borderRadius: 999,
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          backgroundColor: themeCardBg,
                          marginBottom: 12,
                        }}>
                        <Text
                          style={{
                            color: themeAccentText,
                            fontSize: 12,
                            fontWeight: '700',
                          }}>
                          Aktywne akwarium
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: themeTextPrimary,
                          fontWeight: '800',
                          fontSize: 26,
                          lineHeight: 31,
                        }}>
                        {selectedTank.name ?? t('noDataCaps')}
                      </Text>
                      <Text
                        style={{
                          color: themeTextSecondary,
                          marginTop: 8,
                          fontSize: 14,
                          lineHeight: 21,
                        }}>
                        Szybki profil zbiornika i jego ustawien w jednym miejscu.
                      </Text>
                    </View>

                    <View
                      style={{
                        minWidth: 86,
                        borderWidth: 1,
                        borderColor: themeAccent,
                        borderRadius: 18,
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        backgroundColor: themeCardBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Text
                        style={{
                          color: themeAccentText,
                          fontSize: 28,
                          fontWeight: '800',
                          lineHeight: 30,
                        }}>
                        {Math.max(0, Math.round(Number(selectedTank.liters) || 0))}
                      </Text>
                      <Text
                        style={{
                          color: themeTextSecondary,
                          fontSize: 12,
                          fontWeight: '700',
                          marginTop: 4,
                        }}>
                        litrow
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 10,
                      marginTop: 16,
                    }}>
                    {[
                      {
                        label: t('aquariumTypeLabel'),
                        value: selectedTankAquariumTypeLabel,
                      },
                      {
                        label: t('substrate'),
                        value: selectedTankSubstrateLabel,
                      },
                      {
                        label: t('lightIntensity'),
                        value: selectedTankLightLabel,
                      },
                      {
                        label: t('lightHoursLabel'),
                        value: selectedTankLightHoursLabel,
                      },
                    ].map((item) => (
                      <View
                        key={`tank-info-metric-${item.label}`}
                        style={{
                          flexGrow: 1,
                          flexBasis: '47%',
                          minWidth: 140,
                          borderWidth: 1,
                          borderColor: themeBorder,
                          borderRadius: 16,
                          padding: 12,
                          backgroundColor: themeCardBg,
                        }}>
                        <Text
                          style={{
                            color: themeTextMuted,
                            fontSize: 11,
                            fontWeight: '700',
                            textTransform: 'uppercase',
                            letterSpacing: 0.4,
                          }}>
                          {item.label}
                        </Text>
                        <Text
                          style={{
                            color: themeTextPrimary,
                            fontSize: 15,
                            fontWeight: '700',
                            marginTop: 6,
                            lineHeight: 20,
                          }}>
                          {item.value}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <Pressable
                    onPress={handleStartEditTank}
                    style={{
                      marginTop: 16,
                      borderWidth: 1,
                      borderColor: themeAccent,
                      borderRadius: 14,
                      paddingVertical: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: themeAccent,
                    }}>
                    <Text
                      style={{
                        color: themeAccentOnStrong,
                        fontWeight: '700',
                        fontSize: 14,
                      }}>
                      {t('editTank')}
                    </Text>
                  </Pressable>
                </View>
              )}

              {selectedTank && (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 22,
                    padding: 16,
                    marginBottom: 18,
                    backgroundColor: themeCardBg,
                    shadowColor: '#000',
                    shadowOpacity: isLightTheme ? 0.05 : 0,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: isLightTheme ? 1 : 0,
                  }}>
                  <View
                    style={{
                      marginBottom: 4,
                    }}>
                    <Text
                      style={{
                        color: themeTextPrimary,
                        fontWeight: '800',
                        fontSize: 20,
                        lineHeight: 24,
                      }}>
                      Sprzet i gotowosc
                    </Text>
                    <Text
                      style={{
                        color: themeTextSecondary,
                        marginTop: 6,
                        fontSize: 13,
                        lineHeight: 19,
                      }}>
                      Szybko sprawdzisz, czy filtr i grzalka sa przypisane oraz
                      czy wymagaja poprawy.
                    </Text>
                  </View>
                  {[
                    {
                      key: 'heater',
                      title: 'Grzalka',
                      data: tankEquipmentAssessment.heater,
                      actionLabel: 'Dodaj grzalke z katalogu',
                    },
                    {
                      key: 'filter',
                      title: 'Filtr',
                      data: tankEquipmentAssessment.filter,
                      actionLabel: 'Dodaj filtr z katalogu',
                    },
                  ].map((entry) => {
                    const equipmentItems = Array.isArray(entry.data.equipments)
                      ? entry.data.equipments
                      : entry.data.equipment
                        ? [entry.data.equipment]
                        : [];
                    const assessmentStatus = entry.data.status;
                    const statusColor =
                      assessmentStatus === 'ok'
                        ? isLightTheme
                          ? '#1f7a3a'
                          : '#9be7a3'
                        : assessmentStatus === 'critical' || assessmentStatus === 'none'
                          ? isLightTheme
                            ? '#c92a2a'
                            : '#ffb3b3'
                          : isLightTheme
                            ? '#8a5a12'
                            : '#ffdd99';
                    const statusBg =
                      assessmentStatus === 'ok'
                        ? isLightTheme
                          ? '#e8f8eb'
                          : '#143220'
                        : assessmentStatus === 'critical' || assessmentStatus === 'none'
                          ? isLightTheme
                            ? '#fdecec'
                            : '#3a1414'
                          : isLightTheme
                            ? '#fff7e6'
                            : '#3a2a14';
                    const statusLabel =
                      assessmentStatus === 'ok'
                        ? 'Gotowe'
                        : assessmentStatus === 'none'
                          ? 'Brak'
                          : 'Do poprawy';

                    return (
                      <View
                        key={`tank-equipment-${entry.key}`}
                        style={{
                          borderWidth: 1,
                          borderColor: themeBorder,
                          borderRadius: 18,
                          padding: 14,
                          marginTop: 12,
                          backgroundColor: themeCardBgAlt,
                        }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: 12,
                          }}>
                          <View style={{ flex: 1 }}>
                            <View
                              style={{
                                alignSelf: 'flex-start',
                                borderWidth: 1,
                                borderColor: statusColor,
                                borderRadius: 999,
                                paddingVertical: 5,
                                paddingHorizontal: 10,
                                backgroundColor: statusBg,
                                marginBottom: 10,
                              }}>
                              <Text
                                style={{
                                  color: statusColor,
                                  fontSize: 11,
                                  fontWeight: '700',
                                }}>
                                {statusLabel}
                              </Text>
                            </View>
                            <Text
                              style={{
                                color: themeTextPrimary,
                                fontWeight: '800',
                                fontSize: 18,
                                lineHeight: 22,
                              }}>
                              {entry.title}
                            </Text>
                            <Text
                              style={{
                                color: themeTextSecondary,
                                marginTop: 6,
                                fontSize: 13,
                                lineHeight: 19,
                              }}>
                              {entry.data.details}
                            </Text>
                          </View>
                          <View
                            style={{
                              minWidth: 72,
                              borderWidth: 1,
                              borderColor: themeBorder,
                              borderRadius: 14,
                              paddingVertical: 10,
                              paddingHorizontal: 10,
                              backgroundColor: themeCardBg,
                              alignItems: 'center',
                            }}>
                            <Text
                              style={{
                                color: themeTextPrimary,
                                fontSize: 22,
                                fontWeight: '800',
                                lineHeight: 24,
                              }}>
                              {equipmentItems.length}
                            </Text>
                            <Text
                              style={{
                                color: themeTextMuted,
                                fontSize: 11,
                                fontWeight: '700',
                                marginTop: 3,
                              }}>
                              szt.
                            </Text>
                          </View>
                        </View>
                        {equipmentItems.length === 0 ? (
                          <View
                            style={{
                              marginTop: 12,
                              borderWidth: 1,
                              borderColor: themeBorder,
                              borderRadius: 14,
                              padding: 12,
                              backgroundColor: themeCardBg,
                            }}>
                            <Text
                              style={{
                                color: themeTextSecondary,
                                fontSize: 13,
                                lineHeight: 19,
                              }}>
                              Brak przypisanego sprzetu. Dodaj model z katalogu,
                              aby aplikacja mogla lepiej oceniac gotowosc zbiornika.
                            </Text>
                          </View>
                        ) : (
                          <View style={{ marginTop: 12, gap: 8 }}>
                            {equipmentItems.map((equipmentItem, itemIndex) => {
                              const equipmentName = `${equipmentItem.brand ?? ''} ${
                                equipmentItem.model ?? ''
                              }`.trim();

                              return (
                                <View
                                  key={`tank-equipment-entry-${entry.key}-${equipmentItem.assignmentId ?? equipmentItem.id ?? itemIndex}`}
                                  style={{
                                    borderWidth: 1,
                                    borderColor: themeBorder,
                                    borderRadius: 14,
                                    padding: 12,
                                    backgroundColor: themeCardBg,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 10,
                                  }}>
                                  <View style={{ flex: 1 }}>
                                    <Text
                                      style={{
                                        color: themeTextPrimary,
                                        fontWeight: '700',
                                        fontSize: 14,
                                        lineHeight: 18,
                                      }}>
                                      {equipmentName || `Pozycja ${itemIndex + 1}`}
                                    </Text>
                                    <Text
                                      style={{
                                        color: themeTextMuted,
                                        fontSize: 11,
                                        marginTop: 4,
                                      }}>
                                      Przypisany do akwarium
                                    </Text>
                                  </View>
                                  {hasEquipmentSaveAccess ? (
                                    <Pressable
                                      onPress={() =>
                                        handleRemoveTankEquipment(
                                          entry.key,
                                          equipmentItem,
                                          itemIndex
                                        )
                                      }
                                      disabled={equipmentSavingBusy}
                                      style={{
                                        borderWidth: 1,
                                        borderColor: themeBorderStrong,
                                        borderRadius: 10,
                                        paddingVertical: 6,
                                        paddingHorizontal: 10,
                                        backgroundColor: themeChipBg,
                                        opacity: equipmentSavingBusy ? 0.6 : 1,
                                      }}>
                                      <Text
                                        style={{
                                          color: themeChipText,
                                          fontSize: 11,
                                          fontWeight: '700',
                                        }}>
                                        Usun
                                      </Text>
                                    </Pressable>
                                  ) : null}
                                </View>
                              );
                            })}
                          </View>
                        )}
                        {hasEquipmentSaveAccess ? (
                          <Pressable
                            onPress={() => handleOpenEquipmentCatalog(entry.key)}
                            style={{
                              marginTop: 12,
                              borderWidth: 1,
                              borderColor: themeAccent,
                              borderRadius: 12,
                              paddingVertical: 10,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: themeAccent,
                            }}>
                            <Text
                              style={{
                                color: themeAccentOnStrong,
                                fontWeight: '700',
                                fontSize: 13,
                              }}>
                              {entry.actionLabel}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {(isFishSection || isPlantSection) && (
            <View
              style={{
                marginBottom: 18,
              }}>

            {!selectedTank ? (
              <Text style={{ color: themeTextSecondary }}>
                {t('chooseActiveTankToManageStock')}
              </Text>
            ) : (
              <>
                {isFishSection ? (
                  <>
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: !fishStockingSummary.hasFish || !fishStockingSummary.hasTankLiters
                          ? themeBorder
                          : fishStockingSummary.ratio > 1.2
                            ? themeDangerBg
                            : fishStockingSummary.isOverstocked
                              ? themeWarningBg
                              : themeSuccessBg,
                        borderRadius: 14,
                        padding: 14,
                        marginBottom: 10,
                        backgroundColor: !fishStockingSummary.hasFish || !fishStockingSummary.hasTankLiters
                          ? themeCardBgAlt
                          : fishStockingSummary.ratio > 1.2
                            ? themeDangerSoftBg
                            : fishStockingSummary.isOverstocked
                              ? themeWarningSoftBg
                              : themeSuccessSoftBg,
                      }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              color: themeTextPrimary,
                              fontWeight: '700',
                              fontSize: 15,
                            }}>
                            {t('overstocking', {
                              value: fishStockingSummary.isOverstocked
                                ? t('yes')
                                : t('no'),
                            })}
                          </Text>
                          <Text
                            style={{
                              color:
                                !fishStockingSummary.hasFish || !fishStockingSummary.hasTankLiters
                                  ? themeTextSecondary
                                  : fishStockingSummary.ratio > 1.2
                                    ? themeDangerText
                                    : fishStockingSummary.isOverstocked
                                      ? themeWarningText
                                      : themeSuccessText,
                              fontSize: 12,
                              fontWeight: '700',
                              marginTop: 4,
                            }}>
                            {!fishStockingSummary.hasFish || !fishStockingSummary.hasTankLiters
                              ? 'Ocena obsady wymaga danych'
                              : fishStockingSummary.ratio > 1.2
                                ? 'Stan krytyczny: obsada wyraźnie ponad bezpieczny poziom'
                                : fishStockingSummary.isOverstocked
                                  ? 'Stan ostrzegawczy: obsada zaczyna przekraczać limit'
                                  : 'Obsada wygląda bezpiecznie dla tego litrażu'}
                          </Text>
                        </View>
                        <View
                          style={{
                            minWidth: 88,
                            borderWidth: 1,
                            borderColor:
                              !fishStockingSummary.hasFish || !fishStockingSummary.hasTankLiters
                                ? themeBorderStrong
                                : fishStockingSummary.ratio > 1.2
                                  ? themeDangerBg
                                  : fishStockingSummary.isOverstocked
                                    ? themeWarningBg
                                    : themeSuccessBg,
                            borderRadius: 12,
                            paddingVertical: 8,
                            paddingHorizontal: 10,
                            backgroundColor: themeCardBg,
                            alignItems: 'center',
                          }}>
                          <Text
                            style={{
                              color: themeTextSecondary,
                              fontSize: 10,
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              letterSpacing: 0.3,
                            }}>
                            Obciążenie
                          </Text>
                          <Text
                            style={{
                              color:
                                !fishStockingSummary.hasFish || !fishStockingSummary.hasTankLiters
                                  ? themeTextPrimary
                                  : fishStockingSummary.ratio > 1.2
                                    ? themeDangerText
                                    : fishStockingSummary.isOverstocked
                                      ? themeWarningText
                                      : themeSuccessText,
                              fontWeight: '700',
                              fontSize: 20,
                              marginTop: 2,
                            }}>
                            {fishStockingSummary.hasFish && fishStockingSummary.hasTankLiters
                              ? `${Math.round(fishStockingSummary.ratio * 100)}%`
                              : '--'}
                          </Text>
                        </View>
                      </View>

                      <View style={{ marginTop: 8 }}>
                        {!fishStockingSummary.hasFish ? (
                          <Text style={{ color: themeTextSecondary }}>
                            {t('noFishOverstockRisk')}
                          </Text>
                        ) : !fishStockingSummary.hasTankLiters ? (
                          <Text style={{ color: themeTextSecondary }}>
                            {t('setTankLitersForOverstock')}
                          </Text>
                        ) : (
                          <>
                            <View
                              style={{
                                flexDirection: 'row',
                                flexWrap: 'wrap',
                                gap: 8,
                                marginTop: 2,
                                marginBottom: 8,
                              }}>
                              <View
                                style={{
                                  borderWidth: 1,
                                  borderColor: themeBorder,
                                  borderRadius: 999,
                                  paddingVertical: 6,
                                  paddingHorizontal: 10,
                                  backgroundColor: themeCardBg,
                                }}>
                                <Text style={{ color: themeTextPrimary, fontSize: 12, fontWeight: '700' }}>
                                  Szacowane minimum: {Math.round(fishStockingSummary.estimatedLiters)} l
                                </Text>
                              </View>
                              <View
                                style={{
                                  borderWidth: 1,
                                  borderColor: themeBorder,
                                  borderRadius: 999,
                                  paddingVertical: 6,
                                  paddingHorizontal: 10,
                                  backgroundColor: themeCardBg,
                                }}>
                                <Text style={{ color: themeTextPrimary, fontSize: 12, fontWeight: '700' }}>
                                  Akwarium: {fishStockingSummary.tankLiters} l
                                </Text>
                              </View>
                            </View>
                            <Text
                              style={{
                                color: themeTextSecondary,
                                marginTop: 6,
                                fontSize: 12,
                              }}>
                              {fishStockingSummary.ratio > 1
                                ? `Szacunkowo brakuje ok. ${Math.max(
                                    1,
                                    Math.round(
                                      fishStockingSummary.estimatedLiters -
                                        fishStockingSummary.tankLiters
                                    )
                                  )} l zapasu.`
                                : `Szacunkowo zostaje ok. ${Math.max(
                                    1,
                                    Math.round(
                                      fishStockingSummary.tankLiters -
                                        fishStockingSummary.estimatedLiters
                                    )
                                  )} l zapasu.`}
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                  </>
                ) : null}

                {isFishSection ? (
                  <>
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: themeBorder,
                        borderRadius: 8,
                        padding: 10,
                        marginBottom: 10,
                        backgroundColor: themeCardBgAlt,
                      }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}>
                        <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>
                          {t('currentFishStock')}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Pressable
                            onPress={() => setIsEditingFish(true)}
                            style={{
                              width: 28,
                              height: 28,
                              borderWidth: 1,
                              borderColor: themeAccentText,
                              borderRadius: 8,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: themeAccentText,
                            }}>
                            <Text
                              style={{
                                color: themeAccentOnStrong,
                                fontWeight: '700',
                                fontSize: 16,
                              }}>
                              +
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      {stockLoading ? (
                        <Text style={{ color: themeTextSecondary, marginTop: 8 }}>
                          {t('loadingStock')}
                        </Text>
                      ) : fishInTank.length === 0 ? (
                        <Text style={{ color: themeTextSecondary, marginTop: 8 }}>
                          {t('noFishInTank')}
                        </Text>
                      ) : (
                        <View style={{ marginTop: 10 }}>
                          {fishInTank.map((item) => {
                            const itemQuantity = Math.max(1, Number(item.quantity) || 1);
                            const itemDraft =
                              fishQuantityDrafts[item.id] ?? String(itemQuantity);
                            const isExpanded = editingFishItemId === item.id;
                            const itemWarnings = fishWarningsByItemId.get(item.id) ?? [];
                            const hasCriticalWarning = itemWarnings.some(
                              (warningItem) => warningItem.severity === 'critical'
                            );

                            return (
                              <View
                                key={`fish-current-${item.id}`}
                                style={{
                                  borderWidth: 1,
                                  borderColor: isExpanded ? themeAccent : themeBorder,
                                  borderRadius: 8,
                                  padding: 10,
                                  marginBottom: 8,
                                  backgroundColor: themeCardBgAlt,
                                }}>
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 8,
                                  }}>
                                  {itemWarnings.length > 0 ? (
                                    <View
                                      style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: 999,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderWidth: 1,
                                        borderColor: hasCriticalWarning
                                          ? themeDanger
                                          : themeWarningBg,
                                        backgroundColor: hasCriticalWarning
                                          ? themeDangerSoftBg
                                          : themeWarningSoftBg,
                                      }}>
                                      <Text
                                        style={{
                                          color: hasCriticalWarning
                                            ? themeDangerText
                                            : themeWarningText,
                                          fontWeight: '700',
                                          fontSize: 13,
                                        }}>
                                        !
                                      </Text>
                                    </View>
                                  ) : null}
                                  <Pressable
                                    onPress={() => {
                                      setFishQuantityDrafts((prev) => ({
                                        ...prev,
                                        [item.id]: itemDraft,
                                      }));
                                      setEditingFishItemId((prev) =>
                                        prev === item.id ? null : item.id
                                      );
                                    }}
                                    style={{
                                      flex: 1,
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      gap: 10,
                                    }}>
                                    <Pressable
                                      onPress={() => handleOpenFishImageModal(item)}
                                      hitSlop={6}>
                                      <Image
                                        source={getFishPreviewImageSource(item, {
                                          allowRemote: true,
                                        })}
                                        onError={() => handleFishPreviewImageError(item)}
                                        resizeMode="cover"
                                        style={{
                                          width: 46,
                                          height: 46,
                                          borderRadius: 12,
                                          borderWidth: 1,
                                          borderColor: themeBorder,
                                          backgroundColor: themeCardBg,
                                        }}
                                      />
                                    </Pressable>
                                    <View style={{ flex: 1, paddingRight: 10 }}>
                                      <Text
                                        style={{
                                          color: themeNameText,
                                          fontWeight: '700',
                                        }}>
                                        {item.commonName ?? item.name}
                                        {item.latinName ? ` (${item.latinName})` : ''}
                                      </Text>
                                      <Text style={{ color: themeTextSecondary, marginTop: 4 }}>
                                        {t('quantityPieces', { value: itemQuantity })}
                                      </Text>
                                    </View>
                                  </Pressable>
                                </View>

                                {!isExpanded ? null : (
                                  <View style={{ marginTop: 10 }}>
                                    <View
                                      style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 8,
                                      }}>
                                      <Pressable
                                        onPress={() => {
                                          const current = Number(
                                            fishQuantityDrafts[item.id] ?? itemQuantity
                                          );
                                          const safeCurrent = Number.isFinite(current)
                                            ? current
                                            : itemQuantity;
                                          const nextValue = Math.max(
                                            0,
                                            Math.round(safeCurrent) - 1
                                          );
                                          setFishQuantityDrafts((prev) => ({
                                            ...prev,
                                            [item.id]: String(nextValue),
                                          }));
                                        }}
                                        style={{
                                          width: 34,
                                          height: 34,
                                          borderWidth: 1,
                                          borderColor: themeBorderStrong,
                                          borderRadius: 8,
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}>
                                        <Text style={{ color: themeTextPrimary, fontSize: 18 }}>-</Text>
                                      </Pressable>

                                      <TextInput
                                        placeholder={t('quantity')}
                                        placeholderTextColor={themePlaceholder}
                                        value={fishQuantityDrafts[item.id] ?? itemDraft}
                                        onChangeText={(value) =>
                                          setFishQuantityDrafts((prev) => ({
                                            ...prev,
                                            [item.id]: value,
                                          }))
                                        }
                                        keyboardType="numeric"
                                        style={{
                                          flex: 1,
                                          borderWidth: 1,
                                          borderColor: themeInputBorder,
                                          color: themeInputText,
                                          padding: 10,
                                        }}
                                      />

                                      <Pressable
                                        onPress={() => {
                                          const current = Number(
                                            fishQuantityDrafts[item.id] ?? itemQuantity
                                          );
                                          const safeCurrent = Number.isFinite(current)
                                            ? current
                                            : itemQuantity;
                                          const nextValue = Math.max(
                                            0,
                                            Math.round(safeCurrent) + 1
                                          );
                                          setFishQuantityDrafts((prev) => ({
                                            ...prev,
                                            [item.id]: String(nextValue),
                                          }));
                                        }}
                                        style={{
                                          width: 34,
                                          height: 34,
                                          borderWidth: 1,
                                          borderColor: themeBorderStrong,
                                          borderRadius: 8,
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}>
                                        <Text style={{ color: themeTextPrimary, fontSize: 18 }}>+</Text>
                                      </Pressable>
                                    </View>

                                    <Text style={{ color: themeTextSecondary, fontSize: 12, marginTop: 6 }}>
                                      {t('setZeroToRemoveFish')}
                                    </Text>

                                    {itemWarnings.length > 0 ? (
                                      <View
                                        style={{
                                          marginTop: 8,
                                          borderWidth: 1,
                                          borderColor: hasCriticalWarning
                                            ? themeDanger
                                            : themeWarningBg,
                                          borderRadius: 8,
                                          padding: 8,
                                          backgroundColor: hasCriticalWarning
                                            ? themeDangerSoftBg
                                            : themeWarningSoftBg,
                                        }}>
                                        {itemWarnings.map((warningItem, warningIndex) => (
                                          <Text
                                            key={`fish-warning-${item.id}-${warningIndex}`}
                                            style={{
                                              color: hasCriticalWarning
                                                ? themeDangerText
                                                : themeWarningText,
                                              fontSize: 12,
                                              lineHeight: 17,
                                              marginTop: warningIndex === 0 ? 0 : 3,
                                            }}>
                                            - {warningItem.text}
                                          </Text>
                                        ))}
                                      </View>
                                    ) : null}

                                    <Pressable
                                      onPress={async () => {
                                        const ok = await handleUpdateFishQuantity(item.id);
                                        if (ok) {
                                          setEditingFishItemId(null);
                                        }
                                      }}
                                      style={{
                                        backgroundColor: themeAccentText,
                                        padding: 10,
                                        borderRadius: 8,
                                        marginTop: 8,
                                        opacity: stockBusy ? 0.7 : 1,
                                      }}>
                                      <Text
                                        style={{
                                          color: themeAccentOnStrong,
                                          textAlign: 'center',
                                          fontWeight: '700',
                                        }}>
                                        {t('saveQuantity')}
                                      </Text>
                                    </Pressable>
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                    )}
                    </View>

                  </>
                ) : (
                  <>
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: themeBorder,
                        borderRadius: 8,
                        padding: 10,
                        marginBottom: 10,
                        backgroundColor: themeCardBgAlt,
                      }}>
                      <Pressable
                        onPress={() =>
                          setIsPlantFertilizationExpanded((prev) => !prev)
                        }
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}>
                        <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>
                          {t('plantFertilizationSectionTitle')}
                        </Text>
                        <Text style={{ color: themeTextSecondary, fontWeight: '700' }}>
                          {isPlantFertilizationExpanded ? t('collapseSection') : t('expandSection')}
                        </Text>
                      </Pressable>

                      {!isPlantFertilizationExpanded ? null : (
                        <>
                          <Text
                            style={{
                              color: themeTextSecondary,
                              marginTop: 6,
                              fontSize: 12,
                              lineHeight: 17,
                            }}>
                            {t('plantFertilizationSectionHint')}
                          </Text>

                          <View
                            style={{
                              flexDirection: 'row',
                              flexWrap: 'wrap',
                              gap: 8,
                              marginTop: 8,
                            }}>
                            <View
                              style={{
                                borderWidth: 1,
                                borderColor: themeBorder,
                                borderRadius: 999,
                                paddingVertical: 5,
                                paddingHorizontal: 10,
                                backgroundColor: themeCardBg,
                              }}>
                              <Text style={{ color: themeTextPrimary, fontSize: 12, fontWeight: '700' }}>
                                {t('plantFertilizationRootTabsActive', {
                                  count: selectedTankPlantFertilizationSummary.rootTabsActiveCount,
                                })}
                              </Text>
                            </View>
                            <View
                              style={{
                                borderWidth: 1,
                                borderColor:
                                  selectedTankPlantFertilizationSummary.rootTabsDueSoonCount > 0
                                    ? themeWarningBg
                                    : themeBorder,
                                borderRadius: 999,
                                paddingVertical: 5,
                                paddingHorizontal: 10,
                                backgroundColor:
                                  selectedTankPlantFertilizationSummary.rootTabsDueSoonCount > 0
                                    ? themeWarningSoftBg
                                    : themeCardBg,
                              }}>
                              <Text
                                style={{
                                  color:
                                    selectedTankPlantFertilizationSummary.rootTabsDueSoonCount > 0
                                      ? themeWarningText
                                      : themeTextPrimary,
                                  fontSize: 12,
                                  fontWeight: '700',
                                }}>
                                {t('plantFertilizationRootTabsDueSoon', {
                                  count: selectedTankPlantFertilizationSummary.rootTabsDueSoonCount,
                                })}
                              </Text>
                            </View>
                          </View>

                          <Text
                            style={{
                              color: themeTextSecondary,
                              marginTop: 6,
                              fontSize: 12,
                              lineHeight: 17,
                            }}>
                            {t('plantFertilizationTypeHintRootTabs')}
                          </Text>

                          {selectedTankPlantFertilizationEntries.length === 0 ? (
                            <Text style={{ color: themeTextSecondary, marginTop: 8 }}>
                              {t('plantFertilizationNoEntries')}
                            </Text>
                          ) : (
                            <View style={{ marginTop: 10 }}>
                              {selectedTankPlantFertilizationEntries.map((entry) => {
                                const rootTabsStatus = resolveRootTabsEntryStatus(entry);
                                const addedAtText = formatDateOnly(entry.createdAt);
                                const endAtText = rootTabsStatus
                                  ? formatDateOnly(rootTabsStatus.endAtMs)
                                  : null;
                                const rootTabsStatusText =
                                  rootTabsStatus?.status === 'expired'
                                    ? t('plantFertilizationStatusExpired')
                                    : rootTabsStatus?.status === 'due_soon'
                                      ? t('plantFertilizationStatusDueSoon', {
                                          days: Math.max(0, rootTabsStatus.daysLeft),
                                        })
                                      : rootTabsStatus?.status === 'active'
                                        ? t('plantFertilizationStatusActive', {
                                            days: Math.max(0, rootTabsStatus.daysLeft),
                                          })
                                        : null;
                                const isEditingEntry =
                                  editingPlantFertilizationEntryId === entry.id;

                                return (
                                  <View
                                    key={`plant-fertilization-entry-${entry.id}`}
                                    style={{
                                      borderWidth: 1,
                                      borderColor: themeBorder,
                                      borderRadius: 8,
                                      padding: 9,
                                      marginBottom: 8,
                                      backgroundColor: themeCardBg,
                                    }}>
                                    <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>
                                      {entry.productName}
                                    </Text>
                                    <Text style={{ color: themeTextSecondary, marginTop: 4, fontSize: 12 }}>
                                      {t('plantFertilizationTypeRootTabs')}
                                    </Text>
                                    <Text style={{ color: themeTextSecondary, marginTop: 2, fontSize: 12 }}>
                                      {t('plantFertilizationQuantityLabel', { count: entry.quantity })}
                                    </Text>
                                    <Text style={{ color: themeTextSecondary, marginTop: 2, fontSize: 12 }}>
                                      {t('addedAt', { date: addedAtText })}
                                    </Text>
                                    {rootTabsStatus ? (
                                      <>
                                        <Text
                                          style={{
                                            color: themeTextSecondary,
                                            marginTop: 2,
                                            fontSize: 12,
                                          }}>
                                          {t('plantFertilizationEstimatedEnd', { date: endAtText })}
                                        </Text>
                                        <Text
                                          style={{
                                            color:
                                              rootTabsStatus.status === 'expired'
                                                ? themeDangerText
                                                : rootTabsStatus.status === 'due_soon'
                                                  ? themeWarningText
                                                  : themeSuccessText,
                                            marginTop: 3,
                                            fontSize: 12,
                                            fontWeight: '700',
                                          }}>
                                          {rootTabsStatusText}
                                        </Text>
                                      </>
                                    ) : null}
                                    {entry.note ? (
                                      <Text
                                        style={{
                                          color: themeTextSecondary,
                                          marginTop: 6,
                                          fontSize: 12,
                                        }}>
                                        {entry.note}
                                      </Text>
                                    ) : null}

                                    {!isEditingEntry ? (
                                      <Pressable
                                        onPress={() => handleStartEditPlantFertilizationEntry(entry)}
                                        style={{
                                          marginTop: 8,
                                          borderWidth: 1,
                                          borderColor: themeBorderStrong,
                                          borderRadius: 8,
                                          paddingVertical: 8,
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          backgroundColor: themeCardBgAlt,
                                          opacity: plantFertilizationBusy ? 0.7 : 1,
                                        }}>
                                        <Text
                                          style={{
                                            color: themeTextPrimary,
                                            fontWeight: '700',
                                            fontSize: 12,
                                          }}>
                                          {t('plantFertilizationEditEntry')}
                                        </Text>
                                      </Pressable>
                                    ) : (
                                      <View style={{ marginTop: 8 }}>
                                        <TextInput
                                          placeholder={t('plantFertilizationProductPlaceholder')}
                                          placeholderTextColor={themePlaceholder}
                                          value={editingPlantFertilizerName}
                                          onChangeText={setEditingPlantFertilizerName}
                                          style={{
                                            borderWidth: 1,
                                            borderColor: themeInputBorder,
                                            color: themeInputText,
                                            padding: 10,
                                            backgroundColor: themeInputBg,
                                          }}
                                        />
                                        <TextInput
                                          placeholder={t('plantFertilizationQuantityPlaceholder')}
                                          placeholderTextColor={themePlaceholder}
                                          value={editingPlantFertilizerQuantityInput}
                                          onChangeText={setEditingPlantFertilizerQuantityInput}
                                          keyboardType="numeric"
                                          style={{
                                            marginTop: 8,
                                            borderWidth: 1,
                                            borderColor: themeInputBorder,
                                            color: themeInputText,
                                            padding: 10,
                                            backgroundColor: themeInputBg,
                                          }}
                                        />
                                        <TextInput
                                          placeholder={t('plantFertilizationDurationPlaceholder')}
                                          placeholderTextColor={themePlaceholder}
                                          value={editingRootTabsDurationDaysInput}
                                          onChangeText={setEditingRootTabsDurationDaysInput}
                                          keyboardType="numeric"
                                          style={{
                                            marginTop: 8,
                                            borderWidth: 1,
                                            borderColor: themeInputBorder,
                                            color: themeInputText,
                                            padding: 10,
                                            backgroundColor: themeInputBg,
                                          }}
                                        />
                                        <TextInput
                                          placeholder={t('plantFertilizationNotePlaceholder')}
                                          placeholderTextColor={themePlaceholder}
                                          value={editingPlantFertilizerNote}
                                          onChangeText={setEditingPlantFertilizerNote}
                                          multiline
                                          style={{
                                            marginTop: 8,
                                            borderWidth: 1,
                                            borderColor: themeInputBorder,
                                            color: themeInputText,
                                            padding: 10,
                                            minHeight: 62,
                                            textAlignVertical: 'top',
                                            backgroundColor: themeInputBg,
                                          }}
                                        />
                                        <Pressable
                                          onPress={handleSaveEditedPlantFertilizationEntry}
                                          style={{
                                            marginTop: 8,
                                            borderWidth: 1,
                                            borderColor: themeSuccessBg,
                                            borderRadius: 8,
                                            paddingVertical: 8,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            backgroundColor: themeSuccessBg,
                                            opacity: plantFertilizationBusy ? 0.7 : 1,
                                          }}>
                                          <Text
                                            style={{
                                              color: themeAccentOnStrong,
                                              fontWeight: '700',
                                              fontSize: 12,
                                            }}>
                                            {t('plantFertilizationSaveEntry')}
                                          </Text>
                                        </Pressable>
                                        <Pressable
                                          onPress={handleCancelEditPlantFertilizationEntry}
                                          style={{
                                            marginTop: 8,
                                            borderWidth: 1,
                                            borderColor: themeBorderStrong,
                                            borderRadius: 8,
                                            paddingVertical: 8,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            backgroundColor: themeCardBgAlt,
                                            opacity: plantFertilizationBusy ? 0.7 : 1,
                                          }}>
                                          <Text
                                            style={{
                                              color: themeTextPrimary,
                                              fontWeight: '700',
                                              fontSize: 12,
                                            }}>
                                            {t('plantFertilizationCancelEdit')}
                                          </Text>
                                        </Pressable>
                                      </View>
                                    )}

                                    <Pressable
                                      onPress={() => handleDeletePlantFertilizationEntry(entry.id)}
                                      style={{
                                        marginTop: 8,
                                        borderWidth: 1,
                                        borderColor: themeDangerBg,
                                        borderRadius: 8,
                                        paddingVertical: 8,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: themeDangerSoftBg,
                                        opacity: plantFertilizationBusy ? 0.7 : 1,
                                      }}>
                                      <Text
                                        style={{
                                          color: themeDangerText,
                                          fontWeight: '700',
                                          fontSize: 12,
                                        }}>
                                        {t('plantFertilizationDeleteEntry')}
                                      </Text>
                                    </Pressable>
                                  </View>
                                );
                              })}
                            </View>
                          )}

                          <Pressable
                            onPress={() =>
                              setIsPlantFertilizationAddFormVisible((prev) => !prev)
                            }
                            style={{
                              marginTop: 8,
                              borderWidth: 1,
                              borderColor: themeAccentText,
                              borderRadius: 8,
                              paddingVertical: 10,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: themeCardBg,
                            }}>
                            <Text
                              style={{
                                color: themeTextPrimary,
                                fontWeight: '700',
                                fontSize: 13,
                              }}>
                              {isPlantFertilizationAddFormVisible
                                ? t('plantFertilizationHideAddForm')
                                : t('plantFertilizationShowAddForm')}
                            </Text>
                          </Pressable>

                          {isPlantFertilizationAddFormVisible ? (
                            <View style={{ marginTop: 8 }}>
                              <TextInput
                                placeholder={t('plantFertilizationProductPlaceholder')}
                                placeholderTextColor={themePlaceholder}
                                value={plantFertilizerName}
                                onChangeText={setPlantFertilizerName}
                                style={{
                                  borderWidth: 1,
                                  borderColor: themeInputBorder,
                                  color: themeInputText,
                                  padding: 10,
                                  backgroundColor: themeInputBg,
                                }}
                              />
                              <TextInput
                                placeholder={t('plantFertilizationQuantityPlaceholder')}
                                placeholderTextColor={themePlaceholder}
                                value={plantFertilizerQuantityInput}
                                onChangeText={setPlantFertilizerQuantityInput}
                                keyboardType="numeric"
                                style={{
                                  marginTop: 8,
                                  borderWidth: 1,
                                  borderColor: themeInputBorder,
                                  color: themeInputText,
                                  padding: 10,
                                  backgroundColor: themeInputBg,
                                }}
                              />
                              <TextInput
                                placeholder={t('plantFertilizationDurationPlaceholder')}
                                placeholderTextColor={themePlaceholder}
                                value={rootTabsDurationDaysInput}
                                onChangeText={setRootTabsDurationDaysInput}
                                keyboardType="numeric"
                                style={{
                                  marginTop: 8,
                                  borderWidth: 1,
                                  borderColor: themeInputBorder,
                                  color: themeInputText,
                                  padding: 10,
                                  backgroundColor: themeInputBg,
                                }}
                              />
                              <Text
                                style={{
                                  color: themeTextSecondary,
                                  marginTop: 6,
                                  fontSize: 12,
                                  lineHeight: 17,
                                }}>
                                {t('plantFertilizationDurationHint', {
                                  defaultDays: ROOT_TABS_DEFAULT_DURATION_DAYS,
                                  dueSoonDays: ROOT_TABS_DUE_SOON_DAYS,
                                })}
                              </Text>
                              <TextInput
                                placeholder={t('plantFertilizationNotePlaceholder')}
                                placeholderTextColor={themePlaceholder}
                                value={plantFertilizerNote}
                                onChangeText={setPlantFertilizerNote}
                                multiline
                                style={{
                                  marginTop: 8,
                                  borderWidth: 1,
                                  borderColor: themeInputBorder,
                                  color: themeInputText,
                                  padding: 10,
                                  minHeight: 62,
                                  textAlignVertical: 'top',
                                  backgroundColor: themeInputBg,
                                }}
                              />
                              <Pressable
                                onPress={handleAddPlantFertilizationEntry}
                                style={{
                                  marginTop: 8,
                                  borderWidth: 1,
                                  borderColor: themeSuccessBg,
                                  borderRadius: 8,
                                  paddingVertical: 10,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: themeSuccessBg,
                                  opacity: plantFertilizationBusy ? 0.7 : 1,
                                }}>
                                <Text
                                  style={{
                                    color: themeAccentOnStrong,
                                    fontWeight: '700',
                                    fontSize: 13,
                                  }}>
                                  {plantFertilizationBusy
                                    ? t('plantFertilizationSaving')
                                    : t('plantFertilizationAddEntry')}
                                </Text>
                              </Pressable>
                            </View>
                          ) : null}
                        </>
                      )}
                    </View>

                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: themeBorder,
                        borderRadius: 8,
                        padding: 10,
                        marginBottom: 10,
                        backgroundColor: themeCardBgAlt,
                      }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}>
                        <Pressable
                          onPress={() => setIsPlantStockExpanded((prev) => !prev)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                          <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>
                            {t('currentPlantStock')}
                          </Text>
                          <Text style={{ color: themeTextSecondary, fontWeight: '700' }}>
                            {isPlantStockExpanded ? t('collapseSection') : t('expandSection')}
                          </Text>
                        </Pressable>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Pressable
                            onPress={() => setIsEditingPlant(true)}
                            style={{
                              width: 28,
                              height: 28,
                              borderWidth: 1,
                              borderColor: themeAccentText,
                              borderRadius: 8,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: themeAccentText,
                            }}>
                            <Text
                              style={{
                                color: themeAccentOnStrong,
                                fontWeight: '700',
                                fontSize: 16,
                              }}>
                              +
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      {!isPlantStockExpanded ? null : (
                        <>
                          {stockLoading ? (
                        <Text style={{ color: themeTextSecondary, marginTop: 8 }}>
                          {t('loadingStock')}
                        </Text>
                      ) : plantsInTank.length === 0 ? (
                        <Text style={{ color: themeTextSecondary, marginTop: 8 }}>
                          {t('noPlantsInTank')}
                        </Text>
                      ) : (
                        <View style={{ marginTop: 10 }}>
                          {plantsInTank.map((item) => {
                            const itemWarnings = plantWarningsByItemId.get(item.id) ?? [];
                            const hasCriticalWarning = itemWarnings.some(
                              (warningItem) => warningItem.severity === 'critical'
                            );
                            const isExpanded = editingPlantItemId === item.id;

                            return (
                              <View
                                key={`plant-current-${item.id}`}
                                style={{
                                  borderWidth: 1,
                                  borderColor: isExpanded ? themeAccent : themeBorder,
                                  borderRadius: 8,
                                  padding: 10,
                                  marginBottom: 8,
                                  backgroundColor: themeCardBgAlt,
                                }}>
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 8,
                                  }}>
                                  {itemWarnings.length > 0 ? (
                                    <View
                                      style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: 999,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderWidth: 1,
                                        borderColor: hasCriticalWarning
                                          ? themeDanger
                                          : themeWarningBg,
                                        backgroundColor: hasCriticalWarning
                                          ? themeDangerSoftBg
                                          : themeWarningSoftBg,
                                      }}>
                                      <Text
                                        style={{
                                          color: hasCriticalWarning
                                            ? themeDangerText
                                            : themeWarningText,
                                          fontWeight: '700',
                                          fontSize: 13,
                                        }}>
                                        !
                                      </Text>
                                    </View>
                                  ) : null}

                                  <Pressable
                                    onPress={() =>
                                      setEditingPlantItemId((prev) =>
                                        prev === item.id ? null : item.id
                                      )
                                    }
                                    style={{ flex: 1 }}>
                                    <View style={{ flex: 1, paddingRight: 10 }}>
                                      <Text
                                        style={{
                                          color: themeNameText,
                                          fontWeight: '700',
                                        }}>
                                        {item.commonName ?? item.name}
                                        {item.latinName ? ` (${item.latinName})` : ''}
                                      </Text>
                                      <Text
                                        style={{
                                          color: themeTextSecondary,
                                          marginTop: 4,
                                          fontSize: 12,
                                        }}>
                                        pH {formatRange(item.phMin, item.phMax)} | GH{' '}
                                        {formatRange(item.ghMin, item.ghMax)} | T{' '}
                                        {formatRange(item.tempMin, item.tempMax, 'C')}
                                      </Text>
                                    </View>
                                  </Pressable>
                                </View>

                                {!isExpanded ? null : (
                                  <View style={{ marginTop: 10 }}>
                                    {itemWarnings.length > 0 ? (
                                      <View
                                        style={{
                                          borderWidth: 1,
                                          borderColor: hasCriticalWarning
                                            ? themeDanger
                                            : themeWarningBg,
                                          borderRadius: 8,
                                          padding: 8,
                                          backgroundColor: hasCriticalWarning
                                            ? themeDangerSoftBg
                                            : themeWarningSoftBg,
                                        }}>
                                        {itemWarnings.map((warningItem, warningIndex) => (
                                          <Text
                                            key={`plant-warning-${item.id}-${warningIndex}`}
                                            style={{
                                              color: hasCriticalWarning
                                                ? themeDangerText
                                                : themeWarningText,
                                              fontSize: 12,
                                              lineHeight: 17,
                                              marginTop: warningIndex === 0 ? 0 : 3,
                                            }}>
                                            - {warningItem.text}
                                          </Text>
                                        ))}
                                      </View>
                                    ) : null}

                                    <Pressable
                                      onPress={() => handleDeleteStockItem(item.id, 'plant')}
                                      style={{
                                        marginTop: itemWarnings.length > 0 ? 8 : 0,
                                        borderWidth: 1,
                                        borderColor: themeDangerBg,
                                        borderRadius: 8,
                                        paddingVertical: 10,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        opacity: stockBusy ? 0.7 : 1,
                                        backgroundColor: themeDangerSoftBg,
                                      }}>
                                      <Text
                                        style={{
                                          color: themeDangerText,
                                          fontWeight: '700',
                                          fontSize: 13,
                                        }}>
                                        Usun rosline
                                      </Text>
                                    </Pressable>
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      )}
                        </>
                      )}
                    </View>
                  </>
                )}

                {((isFishSection && isEditingFish) ||
                  (isPlantSection && isEditingPlant)) && (
                  <>
                    {isFishSection ? (
                      <BottomSheetModal
                        visible={isEditingFish}
                        onClose={handleCloseFishAddModal}
                        title={t('addFish')}
                        themeCardBg={themeCardBg}
                        themeBorder={themeBorder}
                        themeTextPrimary={themeTextPrimary}
                        themeCardBgAlt={themeCardBgAlt}
                        themeOverlay={themeOverlay}
                        themeDragHandle={themeDragHandle}
                        isLightTheme={isLightTheme}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
                        <View
                          style={{
                            paddingHorizontal: 16,
                            paddingTop: 12,
                            paddingBottom: 10,
                            borderBottomWidth: 1,
                            borderBottomColor: themeBorder,
                          }}>
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  marginBottom: 8,
                                  gap: 8,
                                }}>
                                <TextInput
                                  placeholder={t('searchFishPlaceholder')}
                                  placeholderTextColor={themePlaceholder}
                                  value={stockFishSearch}
                                  onChangeText={setStockFishSearch}
                                  style={{
                                    flex: 1,
                                    borderWidth: 1,
                                    borderColor: themeInputBorder,
                                    color: themeInputText,
                                    padding: 10,
                                    backgroundColor: themeInputBg,
                                  }}
                                />
                                <TextInput
                                  placeholder={t('quantity')}
                                  placeholderTextColor={themePlaceholder}
                                  value={fishQuantity}
                                  onChangeText={setFishQuantity}
                                  keyboardType="numeric"
                                  style={{
                                    width: 92,
                                    borderWidth: 1,
                                    borderColor: themeInputBorder,
                                    color: themeInputText,
                                    padding: 10,
                                    backgroundColor: themeInputBg,
                                  }}
                                />
                              </View>

                              <Pressable
                                onPress={handleAddStockItem}
                                style={{
                                  backgroundColor: themeSuccessBg,
                                  padding: 12,
                                  borderRadius: 8,
                                  opacity: stockBusy ? 0.7 : 1,
                                  marginBottom: 8,
                                }}>
                                <Text
                                  style={{
                                    color: themeAccentOnStrong,
                                    textAlign: 'center',
                                    fontWeight: '700',
                                  }}>
                                  {stockBusy
                                    ? t('addItemInProgress')
                                    : t('addFishFromCatalog')}
                                </Text>
                              </Pressable>

                              

                        </View>

                        <ScrollView
                          style={{ flex: 1 }}
                          keyboardShouldPersistTaps="handled"
                          keyboardDismissMode="on-drag"
                          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>

                          {fishCatalogLoading ? (
                            <Text style={{ color: themeTextSecondary, marginBottom: 10 }}>
                              {t('loadingFishCatalog')}
                            </Text>
                          ) : visibleFilteredFishCatalog.length === 0 ? (
                            <Text style={{ color: themeTextSecondary, marginBottom: 10 }}>
                              {t('noFishResults')}
                            </Text>
                          ) : (
                            <View style={{ marginBottom: 10 }}>
                              {ENABLE_FISH_IMAGES &&
                              IS_IOS_EXPO_GO &&
                              String(stockFishSearch ?? '').trim().length === 0 &&
                              filteredFishCatalog.length > visibleFilteredFishCatalog.length ? (
                                <Text
                                  style={{
                                    color: themeTextSecondary,
                                    fontSize: 12,
                                    marginBottom: 10,
                                  }}>
                                  Dla szybszego dzialania na iPhonie w Expo Go pokazuje teraz
                                  pierwsze {visibleFilteredFishCatalog.length} pozycji. Wpisz nazwe,
                                  aby zawezic wyniki.
                                </Text>
                              ) : null}
                              {visibleFilteredFishCatalog.map((fish) => (
                                (() => {
                                  const isSelectedCatalogFish = selectedCatalogFishId === fish.id;
                                  const fishIssues =
                                    fishCatalogCompatibilityById.get(fish.id) ?? [];
                                  const nonMeasurementIssue = fishIssues.find(
                                    (issue) => !issue.startsWith('Brak pomiaru -')
                                  );

                                  return (
                                    <View
                                      key={fish.id}
                                      style={{
                                        borderWidth: 1,
                                        borderColor: isSelectedCatalogFish
                                          ? themeSuccessBg
                                          : themeBorder,
                                        borderRadius: 8,
                                        padding: 10,
                                        marginBottom: 6,
                                        backgroundColor: isSelectedCatalogFish
                                          ? themeSuccessSoftBg
                                          : themeCardBgAlt,
                                      }}>
                                      <View
                                        style={{
                                          flexDirection: 'row',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          gap: 10,
                                        }}>
                                        <Pressable
                                          onPress={() => {
                                            setSelectedCatalogFishId((prev) =>
                                              prev === fish.id ? null : fish.id
                                            );
                                          }}
                                          style={{
                                            flex: 1,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 10,
                                          }}>
                                          <Pressable
                                            onPress={() => handleOpenFishImageModal(fish)}
                                            hitSlop={6}>
                                            <Image
                                              source={getFishPreviewImageSource(fish, {
                                                allowRemote: true,
                                              })}
                                              onError={() => handleFishPreviewImageError(fish)}
                                              resizeMode="cover"
                                              style={{
                                                width: 46,
                                                height: 46,
                                                borderRadius: 12,
                                                borderWidth: 1,
                                                borderColor: themeBorder,
                                                backgroundColor: themeCardBg,
                                              }}
                                            />
                                          </Pressable>
                                          <View style={{ flex: 1 }}>
                                            <Text
                                              style={{
                                                color: themeTextPrimary,
                                                fontWeight: '700',
                                              }}>
                                              {fish.commonName}
                                            </Text>
                                            <Text
                                              style={{
                                                color: themeTextSecondary,
                                                fontSize: 12,
                                                marginTop: 2,
                                              }}>
                                              {fish.latinName}
                                            </Text>
                                          </View>
                                        </Pressable>
                                      </View>
                                      <Pressable
                                        onPress={() => {
                                          setSelectedCatalogFishId((prev) =>
                                            prev === fish.id ? null : fish.id
                                          );
                                        }}>
                                        <Text
                                          style={{
                                            color: themeTextSecondary,
                                            fontSize: 12,
                                            marginTop: 6,
                                          }}>
                                          pH {formatRange(fish.phMin, fish.phMax)} | GH{' '}
                                          {formatRange(fish.ghMin, fish.ghMax)} | T{' '}
                                          {formatRange(fish.tempMin, fish.tempMax, 'C')}
                                        </Text>
                                        {isSelectedCatalogFish ? (
                                          <View style={{ marginTop: 6 }}>
                                            {!currentMeasurement && !nonMeasurementIssue ? (
                                              <Text
                                                style={{
                                                  color: themeTextSecondary,
                                                  fontSize: 12,
                                                }}>
                                                {t('suggestionAddMeasurement')}
                                              </Text>
                                            ) : !currentMeasurement && nonMeasurementIssue ? (
                                              <Text
                                                style={{
                                                  color: themeWarning,
                                                  fontSize: 12,
                                                }}>
                                                {t('suggestionPrefix', {
                                                  value: nonMeasurementIssue,
                                                })}
                                              </Text>
                                            ) : fishIssues.length === 0 ? (
                                              <Text
                                                style={{
                                                  color: themeSuccess,
                                                  fontSize: 12,
                                                }}>
                                                {t('suggestionFitsCurrent')}
                                              </Text>
                                            ) : (
                                              <View>
                                                {fishIssues.slice(0, 2).map((issue, index) => (
                                                  <Text
                                                    key={`selected-fish-issue-inline-${fish.id}-${index}`}
                                                    style={{
                                                      color: themeWarning,
                                                      fontSize: 12,
                                                      marginTop: index === 0 ? 0 : 2,
                                                    }}>
                                                    - {issue}
                                                  </Text>
                                                ))}
                                              </View>
                                            )}

                                            {selectedCatalogFish &&
                                            selectedCatalogFish.id === fish.id &&
                                            selectedCatalogFishAggressionConflicts.length > 0 ? (
                                              <View
                                                style={{
                                                  marginTop: 8,
                                                  borderWidth: 1,
                                                  borderColor: themeDangerBg,
                                                  borderRadius: 8,
                                                  padding: 8,
                                                  backgroundColor:
                                                    themeDangerSoftBg ?? themeCardBgAlt,
                                                }}>
                                                <Text
                                                  style={{
                                                    color: themeDangerText,
                                                    fontSize: 12,
                                                    fontWeight: '700',
                                                  }}>
                                                  {t('fishAggressionWarning')}
                                                </Text>
                                                {selectedCatalogFishAggressionConflicts
                                                  .slice(0, 3)
                                                  .map((entry, index) => (
                                                    <Text
                                                      key={`selected-fish-aggression-inline-${entry.item.id ?? index}`}
                                                      style={{
                                                        color: themeDangerText,
                                                        fontSize: 12,
                                                        marginTop: 4,
                                                      }}>
                                                      -{' '}
                                                      {t('fishAggressionConflictWith', {
                                                        value:
                                                          entry.item.commonName ??
                                                          entry.item.name ??
                                                          entry.item.latinName,
                                                      })}
                                                    </Text>
                                                  ))}
                                              </View>
                                            ) : null}

                                            {selectedCatalogFishSchoolingWarning &&
                                            selectedCatalogFish &&
                                            selectedCatalogFish.id === fish.id ? (
                                              <View
                                                style={{
                                                  marginTop: 8,
                                                  borderWidth: 1,
                                                  borderColor: themeWarningBg,
                                                  borderRadius: 8,
                                                  padding: 8,
                                                  backgroundColor: themeWarningSoftBg,
                                                }}>
                                                <Text
                                                  style={{
                                                    color: themeWarning,
                                                    fontSize: 12,
                                                    fontWeight: '700',
                                                  }}>
                                                  {t('schoolingFishWarning', {
                                                    value:
                                                      selectedCatalogFishSchoolingWarning.minGroupSize,
                                                  })}
                                                </Text>
                                              </View>
                                            ) : null}
                                          </View>
                                        ) : null}
                                      </Pressable>
                                    </View>
                                  );
                                })()
                              ))}
                            </View>
                          )}

                          
                        </ScrollView>
                      </BottomSheetModal>
                    ) : (
                      <BottomSheetModal
                        visible={isEditingPlant}
                        onClose={handleClosePlantAddModal}
                        title={t('addPlants')}
                        themeCardBg={themeCardBg}
                        themeBorder={themeBorder}
                        themeTextPrimary={themeTextPrimary}
                        themeCardBgAlt={themeCardBgAlt}
                        themeOverlay={themeOverlay}
                        themeDragHandle={themeDragHandle}
                        isLightTheme={isLightTheme}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
                        <ScrollView
                          style={{ flex: 1 }}
                          keyboardShouldPersistTaps="handled"
                          keyboardDismissMode="on-drag"
                          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
                      <>
                        <View style={{ marginBottom: 10 }}>
                          <TextInput
                            placeholder={t('searchPlantPlaceholder')}
                            placeholderTextColor={themePlaceholder}
                            value={stockPlantSearch}
                            onChangeText={setStockPlantSearch}
                            style={{
                              borderWidth: 1,
                              borderColor: themeInputBorder,
                              color: themeInputText,
                              padding: 10,
                              marginBottom: 8,
                              backgroundColor: themeInputBg,
                            }}
                          />
                          <Pressable
                            onPress={handleAddStockItem}
                            style={{
                              backgroundColor: themeSuccessBg,
                              padding: 12,
                              borderRadius: 8,
                              opacity: stockBusy ? 0.7 : 1,
                            }}>
                            <Text
                              style={{
                                color: themeAccentOnStrong,
                                textAlign: 'center',
                                fontWeight: '700',
                              }}>
                              {stockBusy ? t('addItemInProgress') : t('addPlantToStock')}
                            </Text>
                          </Pressable>
                        </View>

                    {plantCatalogLoading ? (
                      <Text style={{ color: themeTextSecondary, marginBottom: 10 }}>
                        {t('loadingPlantCatalog')}
                      </Text>
                    ) : visibleFilteredPlantCatalog.length === 0 ? (
                      <Text style={{ color: themeTextSecondary, marginBottom: 10 }}>
                        {t('noPlantResults')}
                      </Text>
                    ) : (
                      <View style={{ marginBottom: 10 }}>
                        {ENABLE_PLANT_IMAGES &&
                        IS_IOS_EXPO_GO &&
                        String(stockPlantSearch ?? '').trim().length === 0 &&
                        filteredPlantCatalog.length > visibleFilteredPlantCatalog.length ? (
                          <Text
                            style={{
                              color: themeTextSecondary,
                              fontSize: 12,
                              marginBottom: 10,
                            }}>
                            Dla szybszego dzialania na iPhonie w Expo Go pokazuje teraz pierwsze{' '}
                            {visibleFilteredPlantCatalog.length} pozycji. Wpisz nazwe, aby zawezic
                            wyniki.
                          </Text>
                        ) : null}
                        {visibleFilteredPlantCatalog.map((plant) => {
                          const isSelectedCatalogPlant = selectedCatalogPlantId === plant.id;
                          const plantIssues = plantCatalogCompatibilityById.get(plant.id) ?? [];
                          const nonMeasurementIssue = plantIssues.find(
                            (issue) => !issue.startsWith('Brak pomiaru -')
                          );

                          return (
                            <View
                              key={plant.id}
                              style={{
                                borderWidth: 1,
                                borderColor: isSelectedCatalogPlant ? themeSuccessBg : themeBorder,
                                borderRadius: 8,
                                padding: 10,
                                marginBottom: 6,
                                backgroundColor: isSelectedCatalogPlant
                                  ? themeSuccessSoftBg
                                  : themeCardBgAlt,
                              }}>
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 10,
                                }}>
                                <Pressable
                                  onPress={() => {
                                    setSelectedCatalogPlantId((prev) =>
                                      prev === plant.id ? null : plant.id
                                    );
                                  }}
                                  style={{ flex: 1 }}>
                                  <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>
                                    {plant.commonName}
                                  </Text>
                                  <Text
                                    style={{
                                      color: themeTextSecondary,
                                      fontSize: 12,
                                      marginTop: 2,
                                    }}>
                                    {plant.latinName}
                                  </Text>
                                </Pressable>
                              </View>

                              <Pressable
                                onPress={() => {
                                  setSelectedCatalogPlantId((prev) =>
                                    prev === plant.id ? null : plant.id
                                  );
                                }}>
                                <Text
                                  style={{
                                    color: themeTextSecondary,
                                    fontSize: 12,
                                    marginTop: 6,
                                  }}>
                                  pH {formatRange(plant.phMin, plant.phMax)} | GH{' '}
                                  {formatRange(plant.ghMin, plant.ghMax)} | T{' '}
                                  {formatRange(plant.tempMin, plant.tempMax, 'C')}
                                </Text>
                                {isSelectedCatalogPlant ? (
                                  <View style={{ marginTop: 6 }}>
                                    {!currentMeasurement && !nonMeasurementIssue ? (
                                      <Text
                                        style={{
                                          color: themeTextSecondary,
                                          fontSize: 12,
                                        }}>
                                        {t('suggestionAddMeasurement')}
                                      </Text>
                                    ) : !currentMeasurement && nonMeasurementIssue ? (
                                      <Text
                                        style={{
                                          color: themeWarning,
                                          fontSize: 12,
                                        }}>
                                        {t('suggestionPrefix', {
                                          value: nonMeasurementIssue,
                                        })}
                                      </Text>
                                    ) : plantIssues.length === 0 ? (
                                      <Text
                                        style={{
                                          color: themeSuccess,
                                          fontSize: 12,
                                        }}>
                                        {t('suggestionPlantFitsCurrent')}
                                      </Text>
                                    ) : (
                                      <View>
                                        {plantIssues.slice(0, 2).map((issue, index) => (
                                          <Text
                                            key={`selected-plant-issue-inline-${plant.id}-${index}`}
                                            style={{
                                              color: themeWarning,
                                              fontSize: 12,
                                              marginTop: index === 0 ? 0 : 2,
                                            }}>
                                            - {issue}
                                          </Text>
                                        ))}
                                      </View>
                                    )}
                                  </View>
                                ) : null}
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    

                    

                      </>
                        </ScrollView>
                      </BottomSheetModal>
                    )}
                  </>
                )}

              </>
            )}
            </View>
          )}

          {isHealthSection && (
            <>
          {isFishDiseaseCatalogMode && (
                <>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: themeBorder,
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 18,
                  backgroundColor: themeCardBg,
                }}>
                <Text
                  style={{
                    color: themeTextPrimary,
                    fontWeight: '700',
                    fontSize: 16,
                    marginBottom: 8,
                  }}>
                  Rybie choroby i objawy
                </Text>
                <Text style={{ color: themeTextSecondary, fontSize: 12, marginBottom: 8 }}>
                  Sekcja edukacyjna. Pokazuje mozliwe scenariusze, ale nie daje
                  pewnej diagnozy.
                </Text>
                <Text style={{ color: themeWarningText, fontSize: 12 }}>
                  Zabezpieczenie: decyzje o leczeniu podejmujesz samodzielnie.
                  Przy ciezkich objawach skontaktuj sie ze specjalista
                  (weterynarz/ichtiopatolog).
                </Text>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  marginBottom: 12,
                }}>
                <Pressable
                  onPress={() => {
                    setDiseaseMode('catalog');
                    setIsDiseaseSymptomsDropdownOpen(false);
                  }}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor:
                      diseaseMode === 'catalog' ? themeAccent : themeBorderStrong,
                    backgroundColor:
                      diseaseMode === 'catalog' ? themeAccentStrongBg : themeChipBg,
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                  }}>
                  <Text
                    style={{
                      color:
                        diseaseMode === 'catalog'
                          ? themeAccentOnStrong
                          : themeChipText,
                      textAlign: 'center',
                      fontWeight: diseaseMode === 'catalog' ? '700' : '400',
                    }}>
                    Katalog rybich chorob
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setDiseaseMode('symptoms');
                  }}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor:
                      diseaseMode === 'symptoms' ? themeAccent : themeBorderStrong,
                    backgroundColor:
                      diseaseMode === 'symptoms' ? themeAccentStrongBg : themeChipBg,
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                  }}>
                  <Text
                    style={{
                      color:
                        diseaseMode === 'symptoms'
                          ? themeAccentOnStrong
                          : themeChipText,
                      textAlign: 'center',
                      fontWeight: diseaseMode === 'symptoms' ? '700' : '400',
                    }}>
                    Objawy i podejrzenia
                  </Text>
                </Pressable>
              </View>

              {diseaseMode === 'catalog' ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 18,
                    backgroundColor: themeCardBgAlt,
                  }}>
                  {DISEASE_CATALOG.map((disease) => {
                    const isExpanded = expandedDiseaseCatalogId === disease.id;
                    const diseasePreviewImagePrimaryUri = String(
                      disease.imagePreviewUrl ?? disease.imageUrl ?? ''
                    ).trim();
                    const diseasePreviewImageFallbackUri = String(
                      disease.imageFallbackPreviewUrl ??
                        disease.imageFallbackUrl ??
                        disease.imageUrl ??
                        ''
                    ).trim();
                    const previewLoadStage = Number(
                      diseasePreviewLoadStageById[disease.id] ?? 0
                    );
                    const diseasePreviewImageUri =
                      previewLoadStage <= 0
                        ? diseasePreviewImagePrimaryUri || diseasePreviewImageFallbackUri
                        : previewLoadStage === 1
                          ? diseasePreviewImageFallbackUri ||
                            diseasePreviewImagePrimaryUri
                          : '';
                    const useLocalDiseasePreviewImage =
                      previewLoadStage >= 2 || !diseasePreviewImageUri;
                    const diseasePreviewImageSource = useLocalDiseasePreviewImage
                      ? DISEASE_IMAGE_PLACEHOLDER_SOURCE
                      : getDiseaseRemoteImageSource(diseasePreviewImageUri);
                    const symptomSummary = disease.symptoms
                      .map(
                        (symptomId) =>
                          DISEASE_SYMPTOMS.find((item) => item.id === symptomId)?.label ??
                          symptomId
                      )
                      .join(', ');

                    return (
                      <View
                        key={disease.id}
                        style={{
                          borderWidth: 1,
                          borderColor: themeBorder,
                          borderRadius: 8,
                          padding: 10,
                          marginBottom: 8,
                          backgroundColor: themeCardBg,
                        }}>
                        <Pressable
                          onPress={() =>
                            setExpandedDiseaseCatalogId((prev) =>
                              prev === disease.id ? null : disease.id
                            )
                          }
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                          }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>
                              {disease.name}
                            </Text>
                            <Text
                              style={{
                                color: themeTextMuted,
                                marginTop: 6,
                                fontSize: 12,
                              }}>
                              Objawy: {symptomSummary}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'center', gap: 4 }}>
                            <Pressable
                              onPress={() => handleOpenDiseaseImageModal(disease)}
                              style={{
                                borderRadius: 8,
                                overflow: 'hidden',
                                borderWidth: 1,
                                borderColor: themeBorder,
                              }}>
                              <Image
                                source={diseasePreviewImageSource}
                                style={{
                                  width: 58,
                                  height: 58,
                                  backgroundColor: themeCardBgAlt,
                                }}
                                resizeMode="cover"
                                onError={
                                  useLocalDiseasePreviewImage
                                    ? undefined
                                    : ({ nativeEvent }) =>
                                        handleDiseasePreviewImageError(
                                          disease.id,
                                          String(nativeEvent?.error ?? '').trim(),
                                          previewLoadStage
                                        )
                                }
                              />
                            </Pressable>
                            <Text
                              style={{
                                color: themeTextSecondary,
                                fontSize: 12,
                                fontWeight: '700',
                              }}>
                              {isExpanded ? '^' : 'v'}
                            </Text>
                          </View>
                        </Pressable>

                        {!isExpanded ? null : (
                          <View
                            style={{
                              marginTop: 10,
                              borderTopWidth: 1,
                              borderTopColor: themeBorder,
                              paddingTop: 10,
                            }}>
                            <Text style={{ color: themeTextSecondary, marginTop: 4 }}>
                              {disease.summary}
                            </Text>
                            {!disease.imageSourceLabel ? null : (
                              <Text
                                style={{
                                  color: themeTextMuted,
                                  marginTop: 4,
                                  fontSize: 11,
                                }}>
                                Zdjecie pogladowe: {disease.imageSourceLabel}
                              </Text>
                            )}
                            <Text style={{ color: themeSuccessText, marginTop: 8, fontSize: 12 }}>
                              Proponowany srodek: {disease.suggestedRemedy ?? 'brak'}
                            </Text>
                            <Text style={{ color: themeSuccessText, marginTop: 6, fontSize: 12 }}>
                              Leczenie (orientacyjnie):
                            </Text>
                            {disease.treatment.slice(0, 4).map((step, index) => (
                              <Text
                                key={`${disease.id}-catalog-step-${index}`}
                                style={{ color: themeAccentText, fontSize: 12, marginTop: 2 }}>
                                - {step}
                              </Text>
                            ))}
                            <Text style={{ color: themeWarningText, marginTop: 6, fontSize: 12 }}>
                              Uwaga: {disease.caution}
                            </Text>
                            <Pressable
                              onPress={() => handleAddDiseaseToAquarium(disease)}
                              style={{
                                borderWidth: 1,
                                borderColor: themeAccent,
                                borderRadius: 8,
                                paddingVertical: 8,
                                paddingHorizontal: 10,
                                marginTop: 8,
                                backgroundColor: themeAccent,
                                opacity: diseaseCaseBusy ? 0.7 : 1,
                              }}>
                              <Text
                                style={{
                                  color: themeAccentOnStrong,
                                  textAlign: 'center',
                                  fontWeight: '700',
                                  fontSize: 12,
                                }}>
                                {diseaseCaseBusy ? 'Dodawanie...' : 'Dodaj do akwarium'}
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 18,
                    backgroundColor: themeCardBgAlt,
                  }}>
                  <Text style={{ color: themeTextPrimary, fontWeight: '700', marginBottom: 6 }}>
                    Zaznacz objawy
                  </Text>
                  <Text style={{ color: themeTextSecondary, fontSize: 12, marginBottom: 10 }}>
                    Im wiecej trafnych objawow wybierzesz, tym sensowniejsza bedzie
                    podpowiedz.
                  </Text>

                  <Pressable
                    onPress={() =>
                      setIsDiseaseSymptomsDropdownOpen((prev) => !prev)
                    }
                    style={{
                      borderWidth: 1,
                      borderColor: themeBorderStrong,
                      borderRadius: 8,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      marginBottom: 8,
                      backgroundColor: themeCardBg,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: themeTextPrimary, fontWeight: '700', fontSize: 13 }}>
                        Lista objawow
                      </Text>
                      <Text style={{ color: themeTextSecondary, fontSize: 12, marginTop: 2 }}>
                        {selectedDiseaseSymptomIds.length === 0
                          ? 'Wybierz objawy'
                          : `Wybrane: ${selectedDiseaseSymptomIds.length}`}
                      </Text>
                    </View>
                    <Text style={{ color: themeTextPrimary, fontSize: 12, fontWeight: '700' }}>
                      {isDiseaseSymptomsDropdownOpen ? '^' : 'v'}
                    </Text>
                  </Pressable>

                  {selectedDiseaseSymptomLabels.length > 0 && !isDiseaseSymptomsDropdownOpen && (
                    <Text
                      style={{
                        color: themeTextSecondary,
                        fontSize: 12,
                        marginBottom: 8,
                      }}>
                      {selectedDiseaseSymptomLabels.join(', ')}
                    </Text>
                  )}

                  {isDiseaseSymptomsDropdownOpen && (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: themeBorder,
                        borderRadius: 8,
                        padding: 8,
                        marginBottom: 10,
                        backgroundColor: themeCardBg,
                      }}>
                      {DISEASE_SYMPTOMS.map((symptom) => {
                        const isChecked = Boolean(selectedDiseaseSymptoms[symptom.id]);

                        return (
                          <Pressable
                            key={symptom.id}
                            onPress={() => toggleDiseaseSymptom(symptom.id)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              borderWidth: 1,
                              borderColor: isChecked ? themeSuccessBg : themeBorder,
                              borderRadius: 8,
                              padding: 10,
                              marginBottom: 8,
                              backgroundColor: isChecked ? themeSuccessSoftBg : themeCardBg,
                            }}>
                            <View
                              style={{
                                width: 18,
                                height: 18,
                                borderWidth: 1,
                                borderColor: isChecked ? themeSuccess : themeBorderStrong,
                                borderRadius: 4,
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginRight: 10,
                                backgroundColor: isChecked ? themeSuccessBg : 'transparent',
                              }}>
                              <Text style={{ color: themeAccentOnStrong, fontSize: 11 }}>
                                {isChecked ? 'X' : ''}
                              </Text>
                            </View>
                            <Text style={{ color: themeTextPrimary, flex: 1 }}>
                              {symptom.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                    <Pressable
                      onPress={() => {
                        setSelectedDiseaseSymptoms({});
                        setIsDiseaseSymptomsDropdownOpen(false);
                      }}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: themeBorderStrong,
                        borderRadius: 8,
                        padding: 10,
                        backgroundColor: themeChipBg,
                      }}>
                      <Text style={{ color: themeChipText, textAlign: 'center' }}>
                        Wyczysc objawy
                      </Text>
                    </Pressable>
                    <View
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: themeBorder,
                        borderRadius: 8,
                        padding: 10,
                        backgroundColor: themeCardBg,
                        justifyContent: 'center',
                      }}>
                      <Text
                        style={{
                          color: themeTextSecondary,
                          textAlign: 'center',
                          fontSize: 12,
                        }}>
                        Zaznaczone: {selectedDiseaseSymptomIds.length}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={() => setDiseaseSafetyConfirmed((prev) => !prev)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor:
                        diseaseSafetyConfirmed ? themeSuccessBg : themeDangerBg,
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 10,
                      backgroundColor:
                        diseaseSafetyConfirmed
                          ? themeSuccessSoftBg
                          : themeDangerSoftBg,
                    }}>
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderWidth: 1,
                        borderColor: themeBorder,
                        borderRadius: 4,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 10,
                      }}>
                      <Text style={{ color: themeTextPrimary, fontSize: 11 }}>
                        {diseaseSafetyConfirmed ? 'X' : ''}
                      </Text>
                    </View>
                    <Text style={{ color: themeTextPrimary, flex: 1, fontSize: 12 }}>
                      Rozumiem, ze to nie jest diagnoza medyczna i nie gwarantuje
                      skutecznosci leczenia.
                    </Text>
                  </Pressable>

                  {hasDiseaseEmergencySignal && (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: themeDangerBg,
                        borderRadius: 8,
                        padding: 10,
                        marginBottom: 10,
                        backgroundColor: themeDangerSoftBg,
                      }}>
                      <Text style={{ color: themeDangerText, fontWeight: '700' }}>
                        Alert: objawy alarmowe
                      </Text>
                      <Text style={{ color: themeDangerText, marginTop: 4, fontSize: 12 }}>
                        Przy dusznosci lub naglych padach wykonaj natychmiastowa
                        podmiane wody, mocne napowietrzanie i pilna konsultacje ze
                        specjalista.
                      </Text>
                    </View>
                  )}

                  {!diseaseSafetyConfirmed ? (
                    <Text style={{ color: themeWarningText, fontSize: 12 }}>
                      Najpierw zaznacz potwierdzenie bezpieczenstwa, aby zobaczyc
                      sugestie.
                    </Text>
                  ) : selectedDiseaseSymptomIds.length < 2 ? (
                    <Text style={{ color: themeTextSecondary, fontSize: 12 }}>
                      Zaznacz minimum 2 objawy, aby uruchomic analize.
                    </Text>
                  ) : diseaseSuggestions.length === 0 ? (
                    <Text style={{ color: themeTextSecondary, fontSize: 12 }}>
                      Brak jednoznacznego dopasowania. Sprawdz parametry, obserwuj
                      24h i rozwaz konsultacje specjalistyczna.
                    </Text>
                  ) : (
                    <View style={{ marginTop: 4 }}>
                      <Text
                        style={{
                          color: themeTextPrimary,
                          fontWeight: '700',
                          marginBottom: 6,
                        }}>
                        Najbardziej prawdopodobne podejrzenia
                      </Text>
                      {diseaseSuggestions.map((item) => (
                        <View
                          key={`disease-suggestion-${item.id}`}
                          style={{
                            borderWidth: 1,
                            borderColor: themeBorder,
                            borderRadius: 8,
                            padding: 10,
                            marginBottom: 8,
                            backgroundColor: themeCardBg,
                          }}>
                          <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>
                            {item.name}
                          </Text>
                          <Text
                            style={{
                              color: themeTextSecondary,
                              marginTop: 4,
                              fontSize: 12,
                            }}>
                            Pasujace objawy:{' '}
                            {item.matches
                              .map(
                                (symptomId) =>
                                  DISEASE_SYMPTOMS.find(
                                    (symptom) => symptom.id === symptomId
                                  )?.label ?? symptomId
                              )
                              .join(', ')}
                          </Text>
                          <Text
                            style={{
                              color: themeSuccessText,
                              marginTop: 6,
                              fontSize: 12,
                            }}>
                            Propozycja dzialan (ostroznych):
                          </Text>
                          {item.treatment.slice(0, 3).map((step, index) => (
                            <Text
                              key={`${item.id}-suggestion-step-${index}`}
                              style={{
                                color: themeAccentText,
                                marginTop: 2,
                                fontSize: 12,
                              }}>
                              - {step}
                            </Text>
                          ))}
                          <Text
                            style={{
                              color: themeWarningText,
                              marginTop: 6,
                              fontSize: 12,
                            }}>
                            Uwaga: {item.caution}
                          </Text>
                          <Pressable
                            onPress={() => handleAddDiseaseToAquarium(item)}
                            style={{
                              borderWidth: 1,
                              borderColor: themeAccent,
                              borderRadius: 8,
                              paddingVertical: 8,
                              paddingHorizontal: 10,
                              marginTop: 8,
                              backgroundColor: themeAccent,
                              opacity: diseaseCaseBusy ? 0.7 : 1,
                            }}>
                            <Text
                              style={{
                                color: themeAccentOnStrong,
                                textAlign: 'center',
                                fontWeight: '700',
                                fontSize: 12,
                              }}>
                              {diseaseCaseBusy
                                ? 'Dodawanie...'
                                : 'Dodaj do akwarium'}
                            </Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
                </>
              )}

          {isPlantDiseaseCatalogMode && (
                <>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: themeBorder,
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 18,
                  backgroundColor: themeCardBg,
                }}>
                <Text
                  style={{
                    color: themeTextPrimary,
                    fontWeight: '700',
                    fontSize: 16,
                    marginBottom: 8,
                  }}>
                  Choroby roslin i objawy
                </Text>
                <Text style={{ color: themeTextSecondary, fontSize: 12, marginBottom: 8 }}>
                  Sekcja edukacyjna. Pomaga rozpoznac najczestsze problemy roslin.
                </Text>
                <Text style={{ color: themeWarningText, fontSize: 12 }}>
                  Zabezpieczenie: to nie jest pewna diagnoza. Wprowadzaj zmiany
                  stopniowo i obserwuj reakcje zbiornika.
                </Text>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  marginBottom: 12,
                }}>
                <Pressable
                  onPress={() => {
                    setPlantDiseaseMode('catalog');
                    setIsPlantDiseaseSymptomsDropdownOpen(false);
                  }}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor:
                      plantDiseaseMode === 'catalog'
                        ? themeAccent
                        : themeBorderStrong,
                    backgroundColor:
                      plantDiseaseMode === 'catalog'
                        ? themeAccentStrongBg
                        : themeChipBg,
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                  }}>
                  <Text
                    style={{
                      color:
                        plantDiseaseMode === 'catalog'
                          ? themeAccentOnStrong
                          : themeChipText,
                      textAlign: 'center',
                      fontWeight: plantDiseaseMode === 'catalog' ? '700' : '400',
                    }}>
                    Katalog chorob roslin
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setPlantDiseaseMode('symptoms');
                    setExpandedPlantDiseaseCatalogId(null);
                  }}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor:
                      plantDiseaseMode === 'symptoms'
                        ? themeAccent
                        : themeBorderStrong,
                    backgroundColor:
                      plantDiseaseMode === 'symptoms'
                        ? themeAccentStrongBg
                        : themeChipBg,
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                  }}>
                  <Text
                    style={{
                      color:
                        plantDiseaseMode === 'symptoms'
                          ? themeAccentOnStrong
                          : themeChipText,
                      textAlign: 'center',
                      fontWeight: plantDiseaseMode === 'symptoms' ? '700' : '400',
                    }}>
                    Objawy i podejrzenia
                  </Text>
                </Pressable>
              </View>

              {plantDiseaseMode === 'catalog' ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 18,
                    backgroundColor: themeCardBgAlt,
                  }}>
                  {PLANT_DISEASE_CATALOG.map((disease) => {
                    const isExpanded = expandedPlantDiseaseCatalogId === disease.id;
                    const diseasePreviewImagePrimaryUri = String(
                      disease.imagePreviewUrl ?? disease.imageUrl ?? ''
                    ).trim();
                    const diseasePreviewImageFallbackUri = String(
                      disease.imageFallbackPreviewUrl ??
                        disease.imageFallbackUrl ??
                        disease.imageUrl ??
                        ''
                    ).trim();
                    const previewLoadStage = Number(
                      diseasePreviewLoadStageById[disease.id] ?? 0
                    );
                    const diseasePreviewImageUri =
                      previewLoadStage <= 0
                        ? diseasePreviewImagePrimaryUri || diseasePreviewImageFallbackUri
                        : previewLoadStage === 1
                          ? diseasePreviewImageFallbackUri ||
                            diseasePreviewImagePrimaryUri
                          : '';
                    const useLocalDiseasePreviewImage =
                      previewLoadStage >= 2 || !diseasePreviewImageUri;
                    const diseasePreviewImageSource = useLocalDiseasePreviewImage
                      ? DISEASE_IMAGE_PLACEHOLDER_SOURCE
                      : getDiseaseRemoteImageSource(diseasePreviewImageUri);
                    const symptomSummary = disease.symptoms
                      .map(
                        (symptomId) =>
                          PLANT_DISEASE_SYMPTOMS.find((item) => item.id === symptomId)
                            ?.label ?? symptomId
                      )
                      .join(', ');

                    return (
                      <View
                        key={disease.id}
                        style={{
                          borderWidth: 1,
                          borderColor: themeBorder,
                          borderRadius: 8,
                          padding: 10,
                          marginBottom: 8,
                          backgroundColor: themeCardBg,
                        }}>
                        <Pressable
                          onPress={() =>
                            setExpandedPlantDiseaseCatalogId((prev) =>
                              prev === disease.id ? null : disease.id
                            )
                          }
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                          }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>
                              {disease.name}
                            </Text>
                            <Text
                              style={{
                                color: themeTextMuted,
                                marginTop: 6,
                                fontSize: 12,
                              }}>
                              Objawy: {symptomSummary}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'center', gap: 4 }}>
                            <Pressable
                              onPress={() => handleOpenDiseaseImageModal(disease)}
                              style={{
                                borderRadius: 8,
                                overflow: 'hidden',
                                borderWidth: 1,
                                borderColor: themeBorder,
                              }}>
                              <Image
                                source={diseasePreviewImageSource}
                                style={{
                                  width: 58,
                                  height: 58,
                                  backgroundColor: themeCardBgAlt,
                                }}
                                resizeMode="cover"
                                onError={
                                  useLocalDiseasePreviewImage
                                    ? undefined
                                    : ({ nativeEvent }) =>
                                        handleDiseasePreviewImageError(
                                          disease.id,
                                          String(nativeEvent?.error ?? '').trim(),
                                          previewLoadStage
                                        )
                                }
                              />
                            </Pressable>
                            <Text
                              style={{
                                color: themeTextSecondary,
                                fontSize: 12,
                                fontWeight: '700',
                              }}>
                              {isExpanded ? '^' : 'v'}
                            </Text>
                          </View>
                        </Pressable>

                        {!isExpanded ? null : (
                          <View
                            style={{
                              marginTop: 10,
                              borderTopWidth: 1,
                              borderTopColor: themeBorder,
                              paddingTop: 10,
                            }}>
                            <Text style={{ color: themeTextSecondary, marginTop: 4 }}>
                              {disease.summary}
                            </Text>
                            {!disease.imageSourceLabel ? null : (
                              <Text
                                style={{
                                  color: themeTextMuted,
                                  marginTop: 4,
                                  fontSize: 11,
                                }}>
                                Zdjecie pogladowe: {disease.imageSourceLabel}
                              </Text>
                            )}
                            <Text style={{ color: themeSuccessText, marginTop: 8, fontSize: 12 }}>
                              Proponowany srodek: {disease.suggestedRemedy ?? 'brak'}
                            </Text>
                            <Text style={{ color: themeSuccessText, marginTop: 6, fontSize: 12 }}>
                              Leczenie (orientacyjnie):
                            </Text>
                            {disease.treatment.slice(0, 4).map((step, index) => (
                              <Text
                                key={`${disease.id}-catalog-step-${index}`}
                                style={{ color: themeAccentText, fontSize: 12, marginTop: 2 }}>
                                - {step}
                              </Text>
                            ))}
                            <Text style={{ color: themeWarningText, marginTop: 6, fontSize: 12 }}>
                              Uwaga: {disease.caution}
                            </Text>
                            <Pressable
                              onPress={() => handleAddPlantDiseaseToAquarium(disease)}
                              style={{
                                borderWidth: 1,
                                borderColor: themeAccent,
                                borderRadius: 8,
                                paddingVertical: 8,
                                paddingHorizontal: 10,
                                marginTop: 8,
                                backgroundColor: themeAccent,
                                opacity: diseaseCaseBusy ? 0.7 : 1,
                              }}>
                              <Text
                                style={{
                                  color: themeAccentOnStrong,
                                  textAlign: 'center',
                                  fontWeight: '700',
                                  fontSize: 12,
                                }}>
                                {diseaseCaseBusy ? 'Dodawanie...' : 'Dodaj do akwarium'}
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 18,
                    backgroundColor: themeCardBgAlt,
                  }}>
                  <Text style={{ color: themeTextPrimary, fontWeight: '700', marginBottom: 6 }}>
                    Zaznacz objawy roslin
                  </Text>
                  <Text style={{ color: themeTextSecondary, fontSize: 12, marginBottom: 10 }}>
                    Zaznacz to, co obserwujesz. Otrzymasz liste najbardziej
                    prawdopodobnych problemow i sugestie.
                  </Text>

                  <Pressable
                    onPress={() =>
                      setIsPlantDiseaseSymptomsDropdownOpen((prev) => !prev)
                    }
                    style={{
                      borderWidth: 1,
                      borderColor: themeBorderStrong,
                      borderRadius: 8,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      marginBottom: 8,
                      backgroundColor: themeCardBg,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: themeTextPrimary, fontWeight: '700', fontSize: 13 }}>
                        Lista objawow roslin
                      </Text>
                      <Text style={{ color: themeTextSecondary, fontSize: 12, marginTop: 2 }}>
                        {selectedPlantDiseaseSymptomIds.length === 0
                          ? 'Wybierz objawy'
                          : `Wybrane: ${selectedPlantDiseaseSymptomIds.length}`}
                      </Text>
                    </View>
                    <Text style={{ color: themeTextPrimary, fontSize: 12, fontWeight: '700' }}>
                      {isPlantDiseaseSymptomsDropdownOpen ? '^' : 'v'}
                    </Text>
                  </Pressable>

                  {selectedPlantDiseaseSymptomLabels.length > 0 &&
                    !isPlantDiseaseSymptomsDropdownOpen && (
                      <Text
                        style={{
                          color: themeTextSecondary,
                          fontSize: 12,
                          marginBottom: 8,
                        }}>
                        {selectedPlantDiseaseSymptomLabels.join(', ')}
                      </Text>
                    )}

                  {isPlantDiseaseSymptomsDropdownOpen && (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: themeBorder,
                        borderRadius: 8,
                        padding: 8,
                        marginBottom: 10,
                        backgroundColor: themeCardBg,
                      }}>
                      {PLANT_DISEASE_SYMPTOMS.map((symptom) => {
                        const isChecked = Boolean(selectedPlantDiseaseSymptoms[symptom.id]);

                        return (
                          <Pressable
                            key={symptom.id}
                            onPress={() => togglePlantDiseaseSymptom(symptom.id)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              borderWidth: 1,
                              borderColor: isChecked ? themeSuccessBg : themeBorder,
                              borderRadius: 8,
                              padding: 10,
                              marginBottom: 8,
                              backgroundColor: isChecked ? themeSuccessSoftBg : themeCardBg,
                            }}>
                            <View
                              style={{
                                width: 18,
                                height: 18,
                                borderWidth: 1,
                                borderColor: isChecked ? themeSuccess : themeBorderStrong,
                                borderRadius: 4,
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginRight: 10,
                                backgroundColor: isChecked ? themeSuccessBg : 'transparent',
                              }}>
                              <Text style={{ color: themeAccentOnStrong, fontSize: 11 }}>
                                {isChecked ? 'X' : ''}
                              </Text>
                            </View>
                            <Text style={{ color: themeTextPrimary, flex: 1 }}>
                              {symptom.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                    <Pressable
                      onPress={() => {
                        setSelectedPlantDiseaseSymptoms({});
                        setIsPlantDiseaseSymptomsDropdownOpen(false);
                      }}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: themeBorderStrong,
                        borderRadius: 8,
                        padding: 10,
                        backgroundColor: themeChipBg,
                      }}>
                      <Text style={{ color: themeChipText, textAlign: 'center' }}>
                        Wyczysc objawy
                      </Text>
                    </Pressable>
                    <View
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: themeBorder,
                        borderRadius: 8,
                        padding: 10,
                        backgroundColor: themeCardBg,
                        justifyContent: 'center',
                      }}>
                      <Text
                        style={{
                          color: themeTextSecondary,
                          textAlign: 'center',
                          fontSize: 12,
                        }}>
                        Zaznaczone: {selectedPlantDiseaseSymptomIds.length}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={() => setPlantDiseaseSafetyConfirmed((prev) => !prev)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor:
                        plantDiseaseSafetyConfirmed ? themeSuccessBg : themeDangerBg,
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 10,
                      backgroundColor:
                        plantDiseaseSafetyConfirmed
                          ? themeSuccessSoftBg
                          : themeDangerSoftBg,
                    }}>
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderWidth: 1,
                        borderColor: themeBorder,
                        borderRadius: 4,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 10,
                      }}>
                      <Text style={{ color: themeTextPrimary, fontSize: 11 }}>
                        {plantDiseaseSafetyConfirmed ? 'X' : ''}
                      </Text>
                    </View>
                    <Text style={{ color: themeTextPrimary, flex: 1, fontSize: 12 }}>
                      Rozumiem, ze to nie jest pewna diagnoza i wymaga ostroznej
                      korekty warunkow.
                    </Text>
                  </Pressable>

                  {!plantDiseaseSafetyConfirmed ? (
                    <Text style={{ color: themeWarningText, fontSize: 12 }}>
                      Najpierw zaznacz potwierdzenie bezpieczenstwa, aby zobaczyc
                      sugestie.
                    </Text>
                  ) : selectedPlantDiseaseSymptomIds.length < 2 ? (
                    <Text style={{ color: themeTextSecondary, fontSize: 12 }}>
                      Zaznacz minimum 2 objawy, aby uruchomic analize.
                    </Text>
                  ) : plantDiseaseSuggestions.length === 0 ? (
                    <Text style={{ color: themeTextSecondary, fontSize: 12 }}>
                      Brak jednoznacznego dopasowania. Wprowadzaj zmiany etapami i
                      obserwuj nowe przyrosty przez 7-14 dni.
                    </Text>
                  ) : (
                    <View style={{ marginTop: 4 }}>
                      <Text
                        style={{
                          color: themeTextPrimary,
                          fontWeight: '700',
                          marginBottom: 6,
                        }}>
                        Najbardziej prawdopodobne problemy roslin
                      </Text>
                      {plantDiseaseSuggestions.map((item) => (
                        <View
                          key={`plant-disease-suggestion-${item.id}`}
                          style={{
                            borderWidth: 1,
                            borderColor: themeBorder,
                            borderRadius: 8,
                            padding: 10,
                            marginBottom: 8,
                            backgroundColor: themeCardBg,
                          }}>
                          <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>
                            {item.name}
                          </Text>
                          <Text
                            style={{
                              color: themeTextSecondary,
                              marginTop: 4,
                              fontSize: 12,
                            }}>
                            Pasujace objawy:{' '}
                            {item.matches
                              .map(
                                (symptomId) =>
                                  PLANT_DISEASE_SYMPTOMS.find(
                                    (symptom) => symptom.id === symptomId
                                  )?.label ?? symptomId
                              )
                              .join(', ')}
                          </Text>
                          <Text
                            style={{
                              color: themeSuccessText,
                              marginTop: 6,
                              fontSize: 12,
                            }}>
                            Propozycja dzialan:
                          </Text>
                          {item.treatment.slice(0, 3).map((step, index) => (
                            <Text
                              key={`${item.id}-suggestion-step-${index}`}
                              style={{
                                color: themeAccentText,
                                marginTop: 2,
                                fontSize: 12,
                              }}>
                              - {step}
                            </Text>
                          ))}
                          <Text
                            style={{
                              color: themeWarningText,
                              marginTop: 6,
                              fontSize: 12,
                            }}>
                            Uwaga: {item.caution}
                          </Text>
                          <Pressable
                            onPress={() => handleAddPlantDiseaseToAquarium(item)}
                            style={{
                              borderWidth: 1,
                              borderColor: themeAccent,
                              borderRadius: 8,
                              paddingVertical: 8,
                              paddingHorizontal: 10,
                              marginTop: 8,
                              backgroundColor: themeAccent,
                              opacity: diseaseCaseBusy ? 0.7 : 1,
                            }}>
                            <Text
                              style={{
                                color: themeAccentOnStrong,
                                textAlign: 'center',
                                fontWeight: '700',
                                fontSize: 12,
                              }}>
                              {diseaseCaseBusy
                                ? 'Dodawanie...'
                                : 'Dodaj do akwarium'}
                            </Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
                </>
              )}

          {isAlgaeCatalogMode && (
                <>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: themeBorder,
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 18,
                  backgroundColor: themeCardBg,
                }}>
                <Text
                  style={{
                    color: themeTextPrimary,
                    fontWeight: '700',
                    fontSize: 16,
                    marginBottom: 8,
                  }}>
                  Glony i rozrost
                </Text>
                <Text style={{ color: themeTextSecondary, fontSize: 12, marginBottom: 8 }}>
                  Sprawdz rodzaj glonow, przyczyne i plan: usuniecie + prewencja
                  nawrotu.
                </Text>
                <Text style={{ color: themeWarningText, fontSize: 12 }}>
                  Zabezpieczenie: to wskazowki operacyjne, nie gwarancja efektu.
                  Dzialaj stopniowo i obserwuj ryby.
                </Text>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  marginBottom: 12,
                }}>
                <Pressable
                  onPress={() => {
                    setAlgaeMode('catalog');
                    setExpandedAlgaeCatalogId(null);
                    setIsAlgaeSymptomsDropdownOpen(false);
                  }}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor:
                      algaeMode === 'catalog' ? themeAccent : themeBorderStrong,
                    backgroundColor:
                      algaeMode === 'catalog' ? themeAccentStrongBg : themeChipBg,
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                  }}>
                  <Text
                    style={{
                      color:
                        algaeMode === 'catalog'
                          ? themeAccentOnStrong
                          : themeChipText,
                      textAlign: 'center',
                      fontWeight: algaeMode === 'catalog' ? '700' : '400',
                    }}>
                    Katalog glonow
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setAlgaeMode('symptoms');
                    setExpandedAlgaeCatalogId(null);
                  }}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor:
                      algaeMode === 'symptoms' ? themeAccent : themeBorderStrong,
                    backgroundColor:
                      algaeMode === 'symptoms' ? themeAccentStrongBg : themeChipBg,
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                  }}>
                  <Text
                    style={{
                      color:
                        algaeMode === 'symptoms'
                          ? themeAccentOnStrong
                          : themeChipText,
                      textAlign: 'center',
                      fontWeight: algaeMode === 'symptoms' ? '700' : '400',
                    }}>
                    Objawy i przyczyny
                  </Text>
                </Pressable>
              </View>

              {algaeMode === 'catalog' ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 18,
                    backgroundColor: themeCardBgAlt,
                  }}>
                  {ALGAE_CATALOG.map((algae) => {
                    const isExpanded = expandedAlgaeCatalogId === algae.id;
                    const algaePreviewImagePrimaryUri = String(
                      algae.imagePreviewUrl ?? algae.imageUrl ?? ''
                    ).trim();
                    const algaePreviewImageFallbackUri = String(
                      algae.imageFallbackPreviewUrl ??
                        algae.imageFallbackUrl ??
                        algae.imageUrl ??
                        ''
                    ).trim();
                    const previewLoadStage = Number(
                      diseasePreviewLoadStageById[algae.id] ?? 0
                    );
                    const algaePreviewImageUri =
                      previewLoadStage <= 0
                        ? algaePreviewImagePrimaryUri || algaePreviewImageFallbackUri
                        : previewLoadStage === 1
                          ? algaePreviewImageFallbackUri || algaePreviewImagePrimaryUri
                          : '';
                    const useLocalAlgaePreviewImage =
                      previewLoadStage >= 2 || !algaePreviewImageUri;
                    const algaePreviewImageSource = useLocalAlgaePreviewImage
                      ? DISEASE_IMAGE_PLACEHOLDER_SOURCE
                      : getDiseaseRemoteImageSource(algaePreviewImageUri);
                    const symptomSummary = algae.symptoms
                      .map(
                        (symptomId) =>
                          ALGAE_SYMPTOMS.find((item) => item.id === symptomId)?.label ??
                          symptomId
                      )
                      .join(', ');

                    return (
                      <View
                        key={algae.id}
                        style={{
                          borderWidth: 1,
                          borderColor: themeBorder,
                          borderRadius: 8,
                          padding: 10,
                          marginBottom: 8,
                          backgroundColor: themeCardBg,
                        }}>
                        <Pressable
                          onPress={() =>
                            setExpandedAlgaeCatalogId((prev) =>
                              prev === algae.id ? null : algae.id
                            )
                          }
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                          }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>
                              {algae.name}
                            </Text>
                            <Text
                              style={{
                                color: themeTextMuted,
                                marginTop: 6,
                                fontSize: 12,
                              }}>
                              Objawy: {symptomSummary}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'center', gap: 4 }}>
                            <Pressable
                              onPress={() => handleOpenDiseaseImageModal(algae)}
                              style={{
                                borderRadius: 8,
                                overflow: 'hidden',
                                borderWidth: 1,
                                borderColor: themeBorder,
                              }}>
                              <Image
                                source={algaePreviewImageSource}
                                style={{
                                  width: 58,
                                  height: 58,
                                  backgroundColor: themeCardBgAlt,
                                }}
                                resizeMode="cover"
                                onError={
                                  useLocalAlgaePreviewImage
                                    ? undefined
                                    : ({ nativeEvent }) =>
                                        handleDiseasePreviewImageError(
                                          algae.id,
                                          String(nativeEvent?.error ?? '').trim(),
                                          previewLoadStage
                                        )
                                }
                              />
                            </Pressable>
                            <Text
                              style={{
                                color: themeTextSecondary,
                                fontSize: 12,
                                fontWeight: '700',
                              }}>
                              {isExpanded ? '^' : 'v'}
                            </Text>
                          </View>
                        </Pressable>

                        {!isExpanded ? null : (
                          <View
                            style={{
                              marginTop: 10,
                              borderTopWidth: 1,
                              borderTopColor: themeBorder,
                              paddingTop: 10,
                            }}>
                            <Text style={{ color: themeTextSecondary, marginTop: 4 }}>
                              {algae.summary}
                            </Text>
                            {!algae.imageSourceLabel ? null : (
                              <Text
                                style={{
                                  color: themeTextMuted,
                                  marginTop: 4,
                                  fontSize: 11,
                                }}>
                                Zdjecie pogladowe: {algae.imageSourceLabel}
                              </Text>
                            )}
                            <Text style={{ color: themeSuccessText, marginTop: 8, fontSize: 12 }}>
                              Proponowany srodek: {algae.suggestedRemedy ?? 'brak'}
                            </Text>
                            <Text style={{ color: themeTextMuted, marginTop: 6, fontSize: 12 }}>
                              Dlaczego powstaje:
                            </Text>
                            {algae.causes.slice(0, 3).map((cause, index) => (
                              <Text
                                key={`${algae.id}-cause-${index}`}
                                style={{ color: themeTextSecondary, fontSize: 12, marginTop: 2 }}>
                                - {cause}
                              </Text>
                            ))}
                            <Text style={{ color: themeSuccessText, marginTop: 6, fontSize: 12 }}>
                              Usuwanie glonow:
                            </Text>
                            {algae.removeActions.slice(0, 3).map((step, index) => (
                              <Text
                                key={`${algae.id}-remove-${index}`}
                                style={{ color: themeAccentText, fontSize: 12, marginTop: 2 }}>
                                - {step}
                              </Text>
                            ))}
                            <Text style={{ color: themeSuccessText, marginTop: 6, fontSize: 12 }}>
                              Zapobieganie nawrotowi:
                            </Text>
                            {algae.preventionActions.slice(0, 3).map((step, index) => (
                              <Text
                                key={`${algae.id}-prevent-${index}`}
                                style={{ color: themeAccentText, fontSize: 12, marginTop: 2 }}>
                                - {step}
                              </Text>
                            ))}
                            <Text style={{ color: themeWarningText, marginTop: 6, fontSize: 12 }}>
                              Uwaga: {algae.caution}
                            </Text>
                            <Pressable
                              onPress={() => handleAddAlgaeToAquarium(algae)}
                              style={{
                                borderWidth: 1,
                                borderColor: themeAccent,
                                borderRadius: 8,
                                paddingVertical: 8,
                                paddingHorizontal: 10,
                                marginTop: 8,
                                backgroundColor: themeAccent,
                                opacity: diseaseCaseBusy ? 0.7 : 1,
                              }}>
                              <Text
                                style={{
                                  color: themeAccentOnStrong,
                                  textAlign: 'center',
                                  fontWeight: '700',
                                  fontSize: 12,
                                }}>
                                {diseaseCaseBusy ? 'Dodawanie...' : 'Dodaj do akwarium'}
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 18,
                    backgroundColor: themeCardBgAlt,
                  }}>
                  <Text style={{ color: themeTextPrimary, fontWeight: '700', marginBottom: 6 }}>
                    Zaznacz objawy glonow
                  </Text>
                  <Text style={{ color: themeTextSecondary, fontSize: 12, marginBottom: 10 }}>
                    Zaznacz to, co widzisz w akwarium. Otrzymasz dopasowanie i plan
                    dzialan.
                  </Text>

                  <Pressable
                    onPress={() => setIsAlgaeSymptomsDropdownOpen((prev) => !prev)}
                    style={{
                      borderWidth: 1,
                      borderColor: themeBorderStrong,
                      borderRadius: 8,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      marginBottom: 8,
                      backgroundColor: themeCardBg,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: themeTextPrimary, fontWeight: '700', fontSize: 13 }}>
                        Lista objawow glonow
                      </Text>
                      <Text style={{ color: themeTextSecondary, fontSize: 12, marginTop: 2 }}>
                        {selectedAlgaeSymptomIds.length === 0
                          ? 'Wybierz objawy'
                          : `Wybrane: ${selectedAlgaeSymptomIds.length}`}
                      </Text>
                    </View>
                    <Text style={{ color: themeTextPrimary, fontSize: 12, fontWeight: '700' }}>
                      {isAlgaeSymptomsDropdownOpen ? '^' : 'v'}
                    </Text>
                  </Pressable>

                  {selectedAlgaeSymptomLabels.length > 0 && !isAlgaeSymptomsDropdownOpen && (
                    <Text
                      style={{
                        color: themeTextSecondary,
                        fontSize: 12,
                        marginBottom: 8,
                      }}>
                      {selectedAlgaeSymptomLabels.join(', ')}
                    </Text>
                  )}

                  {isAlgaeSymptomsDropdownOpen && (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: themeBorder,
                        borderRadius: 8,
                        padding: 8,
                        marginBottom: 10,
                        backgroundColor: themeCardBg,
                      }}>
                      {ALGAE_SYMPTOMS.map((symptom) => {
                        const isChecked = Boolean(selectedAlgaeSymptoms[symptom.id]);

                        return (
                          <Pressable
                            key={symptom.id}
                            onPress={() => toggleAlgaeSymptom(symptom.id)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              borderWidth: 1,
                              borderColor: isChecked ? themeSuccessBg : themeBorder,
                              borderRadius: 8,
                              padding: 10,
                              marginBottom: 8,
                              backgroundColor: isChecked ? themeSuccessSoftBg : themeCardBg,
                            }}>
                            <View
                              style={{
                                width: 18,
                                height: 18,
                                borderWidth: 1,
                                borderColor: isChecked ? themeSuccess : themeBorderStrong,
                                borderRadius: 4,
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginRight: 10,
                                backgroundColor: isChecked ? themeSuccessBg : 'transparent',
                              }}>
                              <Text style={{ color: themeAccentOnStrong, fontSize: 11 }}>
                                {isChecked ? 'X' : ''}
                              </Text>
                            </View>
                            <Text style={{ color: themeTextPrimary, flex: 1 }}>
                              {symptom.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                    <Pressable
                      onPress={() => {
                        setSelectedAlgaeSymptoms({});
                        setIsAlgaeSymptomsDropdownOpen(false);
                      }}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: themeBorderStrong,
                        borderRadius: 8,
                        padding: 10,
                        backgroundColor: themeChipBg,
                      }}>
                      <Text style={{ color: themeChipText, textAlign: 'center' }}>
                        Wyczysc objawy
                      </Text>
                    </Pressable>
                    <View
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: themeBorder,
                        borderRadius: 8,
                        padding: 10,
                        backgroundColor: themeCardBg,
                        justifyContent: 'center',
                      }}>
                      <Text
                        style={{
                          color: themeTextSecondary,
                          textAlign: 'center',
                          fontSize: 12,
                        }}>
                        Zaznaczone: {selectedAlgaeSymptomIds.length}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={() => setAlgaeSafetyConfirmed((prev) => !prev)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor:
                        algaeSafetyConfirmed ? themeSuccessBg : themeDangerBg,
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 10,
                      backgroundColor:
                        algaeSafetyConfirmed
                          ? themeSuccessSoftBg
                          : themeDangerSoftBg,
                    }}>
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderWidth: 1,
                        borderColor: themeBorder,
                        borderRadius: 4,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 10,
                      }}>
                      <Text style={{ color: themeTextPrimary, fontSize: 11 }}>
                        {algaeSafetyConfirmed ? 'X' : ''}
                      </Text>
                    </View>
                    <Text style={{ color: themeTextPrimary, flex: 1, fontSize: 12 }}>
                      Rozumiem, ze skutecznosc zalezy od usuniecia przyczyny i
                      utrzymania profilaktyki.
                    </Text>
                  </Pressable>

                  {!algaeSafetyConfirmed ? (
                    <Text style={{ color: themeWarningText, fontSize: 12 }}>
                      Najpierw zaznacz potwierdzenie bezpieczenstwa, aby zobaczyc
                      sugestie.
                    </Text>
                  ) : selectedAlgaeSymptomIds.length < 2 ? (
                    <Text style={{ color: themeTextSecondary, fontSize: 12 }}>
                      Zaznacz minimum 2 objawy, aby uruchomic analize.
                    </Text>
                  ) : algaeSuggestions.length === 0 ? (
                    <Text style={{ color: themeTextSecondary, fontSize: 12 }}>
                      Brak jednoznacznego dopasowania. Zrob serwis, obserwuj 7 dni i
                      kontroluj trend NO3 oraz oswietlenie.
                    </Text>
                  ) : (
                    <View style={{ marginTop: 4 }}>
                      <Text
                        style={{
                          color: themeTextPrimary,
                          fontWeight: '700',
                          marginBottom: 6,
                        }}>
                        Najbardziej prawdopodobne glony
                      </Text>
                      {algaeSuggestions.map((item) => (
                        <View
                          key={`algae-suggestion-${item.id}`}
                          style={{
                            borderWidth: 1,
                            borderColor: themeBorder,
                            borderRadius: 8,
                            padding: 10,
                            marginBottom: 8,
                            backgroundColor: themeCardBg,
                          }}>
                          <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>
                            {item.name}
                          </Text>
                          <Text
                            style={{
                              color: themeTextSecondary,
                              marginTop: 4,
                              fontSize: 12,
                            }}>
                            Pasujace objawy:{' '}
                            {item.matches
                              .map(
                                (symptomId) =>
                                  ALGAE_SYMPTOMS.find(
                                    (symptom) => symptom.id === symptomId
                                  )?.label ?? symptomId
                              )
                              .join(', ')}
                          </Text>
                          <Text
                            style={{
                              color: themeTextMuted,
                              marginTop: 6,
                              fontSize: 12,
                            }}>
                            Przyczyny:
                          </Text>
                          {item.causes.slice(0, 2).map((cause, index) => (
                            <Text
                              key={`${item.id}-cause-short-${index}`}
                              style={{
                                color: themeTextSecondary,
                                marginTop: 2,
                                fontSize: 12,
                              }}>
                              - {cause}
                            </Text>
                          ))}
                          <Text
                            style={{
                              color: themeSuccessText,
                              marginTop: 6,
                              fontSize: 12,
                            }}>
                            Usuwanie + prewencja:
                          </Text>
                          {[...item.removeActions.slice(0, 2), ...item.preventionActions.slice(0, 2)].map((step, index) => (
                            <Text
                              key={`${item.id}-plan-short-${index}`}
                              style={{
                                color: themeAccentText,
                                marginTop: 2,
                                fontSize: 12,
                              }}>
                              - {step}
                            </Text>
                          ))}
                          <Text
                            style={{
                              color: themeWarningText,
                              marginTop: 6,
                              fontSize: 12,
                            }}>
                            Uwaga: {item.caution}
                          </Text>
                          <Pressable
                            onPress={() => handleAddAlgaeToAquarium(item)}
                            style={{
                              borderWidth: 1,
                              borderColor: themeAccent,
                              borderRadius: 8,
                              paddingVertical: 8,
                              paddingHorizontal: 10,
                              marginTop: 8,
                              backgroundColor: themeAccent,
                              opacity: diseaseCaseBusy ? 0.7 : 1,
                            }}>
                            <Text
                              style={{
                                color: themeAccentOnStrong,
                                textAlign: 'center',
                                fontWeight: '700',
                                fontSize: 12,
                              }}>
                              {diseaseCaseBusy
                                ? 'Dodawanie...'
                                : 'Dodaj do akwarium'}
                            </Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
                </>
              )}
            </>
          )}

          {isSettingsSection && (
            <View
              style={{
                borderWidth: 1,
                borderColor: themeBorder,
                borderRadius: 10,
                padding: 12,
                marginBottom: 18,
                backgroundColor: isLightTheme ? '#ffffff' : '#151515',
              }}>
              <Text
                style={{
                  color: isLightTheme ? '#111' : 'white',
                  fontWeight: '700',
                  fontSize: 16,
                  marginBottom: 8,
                }}>
                {t('settingsTheme')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => handleSetThemeMode('dark')}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor:
                      appSettings.themeMode === 'dark' ? themeAccent : themeBorderStrong,
                    backgroundColor:
                      appSettings.themeMode === 'dark'
                        ? '#102235'
                        : isLightTheme
                          ? '#ffffff'
                          : '#111',
                    borderRadius: 8,
                    paddingVertical: 10,
                  }}>
                  <Text
                    style={{
                      color:
                        appSettings.themeMode === 'dark'
                          ? 'white'
                          : isLightTheme
                            ? '#111'
                            : 'white',
                      textAlign: 'center',
                    }}>
                    {t('settingsThemeDark')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleSetThemeMode('light')}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor:
                      appSettings.themeMode === 'light' ? themeAccent : themeBorderStrong,
                    backgroundColor:
                      appSettings.themeMode === 'light'
                        ? '#102235'
                        : isLightTheme
                          ? '#ffffff'
                          : '#111',
                    borderRadius: 8,
                    paddingVertical: 10,
                  }}>
                  <Text
                    style={{
                      color:
                        appSettings.themeMode === 'light'
                          ? 'white'
                          : isLightTheme
                            ? '#111'
                            : 'white',
                      textAlign: 'center',
                    }}>
                    {t('settingsThemeLight')}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {isSettingsSection && (
            <View
              style={{
                borderWidth: 1,
                borderColor: themeBorder,
                borderRadius: 10,
                padding: 12,
                marginBottom: 18,
                backgroundColor: isLightTheme ? '#ffffff' : '#151515',
              }}>
              <Pressable
                onPress={() => setIsSettingsTestsExpanded((prev) => !prev)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text
                    style={{
                      color: isLightTheme ? '#111' : 'white',
                      fontWeight: '700',
                      fontSize: 16,
                    }}>
                    {t('settingsTests')}
                  </Text>
                  <Text
                    style={{
                      color: isLightTheme ? '#5b6470' : '#9da3af',
                      fontSize: 12,
                      marginTop: 8,
                    }}>
                    {t('settingsTestsHint')}
                  </Text>
                  <Text
                    style={{
                      color: isLightTheme ? '#5b6470' : '#9da3af',
                      fontSize: 12,
                      marginTop: 6,
                    }}>
                    {t('settingsTestsSummary', {
                      enabled: enabledAllowedTestCount,
                      available: allowedTestParameterOptions.length,
                    })}
                  </Text>
                </View>
                <Text style={{ color: themeActionText, fontWeight: '700' }}>
                  {isSettingsTestsExpanded ? t('hide') : t('show')}
                </Text>
              </Pressable>

              {!isSettingsTestsExpanded ? null : (
                <View style={{ marginTop: 12 }}>
                  <Text
                    style={{
                      color: isLightTheme ? '#5b6470' : '#9da3af',
                      fontSize: 12,
                      marginBottom: 10,
                    }}>
                    {t('subscriptionParameterPlanSummary', {
                      plan: currentSubscriptionTierLabel,
                    })}
                  </Text>

                  <Pressable
                    onPress={handleToggleMeasurementPrefillFromLast}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      borderWidth: 1,
                      borderColor: appSettings.prefillMeasurementFromLast
                        ? themeSuccessBg
                        : themeBorderStrong,
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 10,
                      backgroundColor: appSettings.prefillMeasurementFromLast
                        ? '#12391f'
                        : isLightTheme
                          ? '#ffffff'
                          : '#111',
                    }}>
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderWidth: 1,
                        borderColor: appSettings.prefillMeasurementFromLast
                          ? '#9be7a3'
                          : '#666',
                        borderRadius: 4,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 10,
                        marginTop: 1,
                        backgroundColor: appSettings.prefillMeasurementFromLast
                          ? themeSuccessBg
                          : 'transparent',
                      }}>
                      <Text style={{ color: 'white', fontSize: 11 }}>
                        {appSettings.prefillMeasurementFromLast ? 'X' : ''}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: appSettings.prefillMeasurementFromLast
                            ? '#e8f5e9'
                            : isLightTheme
                              ? '#111'
                              : 'white',
                        }}>
                        {t('settingsMeasurementPrefillFromLast')}
                      </Text>
                      <Text
                        style={{
                          color: appSettings.prefillMeasurementFromLast
                            ? '#c8e6c9'
                            : isLightTheme
                              ? '#5b6470'
                              : '#9da3af',
                          fontSize: 12,
                          marginTop: 4,
                        }}>
                        {t('settingsMeasurementPrefillFromLastHint')}
                      </Text>
                    </View>
                  </Pressable>

              {allowedTestParameterOptions.map((option) => {
                const checked = Boolean(enabledTests[option.key]);

                return (
                  <Pressable
                    key={`settings-test-${option.key}`}
                    onPress={() => handleToggleEnabledTest(option.key)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      borderWidth: 1,
                      borderColor: checked ? themeSuccessBg : themeBorderStrong,
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 8,
                      backgroundColor: checked
                        ? '#12391f'
                        : isLightTheme
                          ? '#ffffff'
                          : '#111',
                    }}>
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderWidth: 1,
                        borderColor: checked ? '#9be7a3' : '#666',
                        borderRadius: 4,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 10,
                        marginTop: 1,
                        backgroundColor: checked ? themeSuccessBg : 'transparent',
                      }}>
                      <Text style={{ color: 'white', fontSize: 11 }}>
                        {checked ? 'X' : ''}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: checked
                            ? '#e8f5e9'
                            : isLightTheme
                              ? '#111'
                              : 'white',
                        }}>
                        {option.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
                </View>
              )}
            </View>
          )}

          {isSettingsSection && (
            <View
              style={{
                borderWidth: 1,
                borderColor: themeBorder,
                borderRadius: 10,
                padding: 12,
                marginBottom: 18,
                backgroundColor: isLightTheme ? '#ffffff' : '#151515',
              }}>
              <Text
                style={{
                  color: isLightTheme ? '#111' : 'white',
                  fontWeight: '700',
                  fontSize: 16,
                  marginBottom: 8,
                }}>
                {t('settingsLanguage')}
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <Pressable
                    key={`language-${option.value}`}
                    onPress={() => handleSetLanguage(option.value)}
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor:
                        appSettings.language === option.value ? themeAccent : themeBorderStrong,
                      backgroundColor:
                        appSettings.language === option.value
                          ? '#102235'
                          : isLightTheme
                            ? '#ffffff'
                            : '#111',
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                    }}>
                    <Text
                      style={{
                        color:
                          appSettings.language === option.value
                            ? 'white'
                            : isLightTheme
                              ? '#111'
                              : 'white',
                        fontSize: 12,
                      }}>
                      {t(option.labelKey)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {isSettingsSection && (
            <View
              style={{
                borderWidth: 1,
                borderColor: themeBorder,
                borderRadius: 10,
                padding: 12,
                marginBottom: 18,
                backgroundColor: themeCardBg,
              }}>
              <Pressable
                onPress={() => setIsSubscriptionExpanded((prev) => !prev)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text
                    style={{
                      color: themeTextPrimary,
                      fontWeight: '700',
                      fontSize: 16,
                    }}>
                    {t('settingsSubscription')}
                  </Text>
                  <Text style={{ color: themeTextSecondary, fontSize: 12, marginTop: 8 }}>
                    {t('settingsSubscriptionHint')}
                  </Text>
                </View>
                <Text style={{ color: themeActionText, fontWeight: '700' }}>
                  {isSubscriptionExpanded ? t('hide') : t('show')}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setIsSubscriptionExpanded((prev) => !prev)}
                style={{
                  marginTop: 12,
                  borderWidth: 1,
                  borderColor: subscriptionActive ? themeSuccessBg : themeBorder,
                  borderRadius: 12,
                  padding: 12,
                  backgroundColor: subscriptionActive
                    ? themeSuccessSoftBg
                    : themeCardBgAlt,
                }}>
                <Text style={{ color: themeTextSecondary, fontSize: 12 }}>
                  {t('settingsSubscriptionCurrentPlan')}
                </Text>
                <Text
                  style={{
                    color: themeTextPrimary,
                    fontSize: 20,
                    fontWeight: '700',
                    marginTop: 4,
                  }}>
                  {currentSubscriptionTierLabel}
                </Text>
                <Text
                  style={{
                    color: subscriptionActive ? themeSuccessText : themeTextSecondary,
                    fontSize: 12,
                    fontWeight: '700',
                    marginTop: 4,
                  }}>
                  {t('settingsSubscriptionStatus', {
                    value: subscriptionStatusLabel,
                  })}
                </Text>
                <Text style={{ color: themeTextSecondary, fontSize: 12, marginTop: 8 }}>
                  {t('settingsSubscriptionTapToCompare')}
                </Text>
                {subscriptionPlan.tier === 'free' ? (
                  <Text style={{ color: themeTextSecondary, fontSize: 12, marginTop: 8 }}>
                    {t('settingsSubscriptionProductFree')}
                  </Text>
                ) : currentSubscriptionProductId ? (
                  <Text style={{ color: themeAccentText, fontSize: 12, marginTop: 8 }}>
                    {t('settingsSubscriptionProductMapped', {
                      value: currentSubscriptionProductId,
                    })}
                  </Text>
                ) : (
                  <Text style={{ color: themeWarningText, fontSize: 12, marginTop: 8 }}>
                    {t('settingsSubscriptionProductMissing')}
                  </Text>
                )}
                {subscription.source === 'local' && (
                  <Text style={{ color: themeAccentText, fontSize: 12, marginTop: 8 }}>
                    {t('settingsSubscriptionLocalMode')}
                  </Text>
                )}
              </Pressable>

              {!canManualSwitchSubscriptionPlan ? null : (
                <View
                  style={{
                    marginTop: 10,
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 10,
                    padding: 10,
                    backgroundColor: themeCardBgAlt,
                  }}>
                  <Text style={{ color: themeTextSecondary, fontSize: 12, marginBottom: 8 }}>
                    {t('settingsSubscriptionTestingHint')}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {subscriptionPlans.map((plan) => {
                      const isCurrent = subscription.tier === plan.tier;
                      const planLabel =
                        plan.tier === 'free'
                          ? t('settingsSubscriptionTierFree')
                          : plan.tier === 'premium'
                            ? t('settingsSubscriptionTierPremium')
                            : t('settingsSubscriptionTierPro');

                      return (
                        <Pressable
                          key={`subscription-quick-switch-${plan.tier}`}
                          onPress={() =>
                            handleSubscriptionTierManualChange(plan.tier)
                          }
                          style={{
                            flex: 1,
                            borderWidth: 1,
                            borderColor: isCurrent ? themeAccent : themeBorderStrong,
                            borderRadius: 8,
                            paddingVertical: 9,
                            backgroundColor: isCurrent ? themeAccentStrongBg : themeCardBg,
                          }}>
                          <Text
                            style={{
                              color: isCurrent ? themeAccentOnStrong : themeTextPrimary,
                              textAlign: 'center',
                              fontWeight: '700',
                              fontSize: 12,
                            }}>
                            {planLabel}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {!isSubscriptionExpanded ? null : (
                <View
                  style={{
                    marginTop: 12,
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 12,
                    padding: 12,
                    backgroundColor: themeCardBgAlt,
                  }}>
                  <Text
                    style={{
                      color: themeTextPrimary,
                      fontWeight: '700',
                      fontSize: 15,
                    }}>
                    {t('settingsSubscriptionMatrixTitle')}
                  </Text>
                  <Text
                    style={{
                      color: themeTextSecondary,
                      fontSize: 12,
                      marginTop: 4,
                    }}>
                    {t('settingsSubscriptionMatrixHint')}
                  </Text>
                  <Text
                    style={{
                      color: themeTextSecondary,
                      fontSize: 12,
                      marginTop: 8,
                      marginBottom: 10,
                    }}>
                    {t('settingsSubscriptionTestingHint')}
                  </Text>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 4 }}>
                    <View>
                      <View
                        style={{
                          flexDirection: 'row',
                          borderWidth: 1,
                          borderColor: themeBorder,
                          borderRadius: 10,
                          overflow: 'hidden',
                          backgroundColor: themeCardBg,
                        }}>
                        <View
                          style={{
                            width: 160,
                            padding: 10,
                            borderRightWidth: 1,
                            borderRightColor: themeBorder,
                            backgroundColor: themeCardBgAlt,
                            justifyContent: 'center',
                          }}>
                          <Text
                            style={{
                              color: themeTextPrimary,
                              fontWeight: '700',
                              fontSize: 12,
                            }}>
                            {t('settingsSubscriptionFeatureColumn')}
                          </Text>
                        </View>
                        {subscriptionPlans.map((plan) => {
                          const isCurrent = subscription.tier === plan.tier;
                          const planLabel =
                            plan.tier === 'free'
                              ? t('settingsSubscriptionTierFree')
                              : plan.tier === 'premium'
                                ? t('settingsSubscriptionTierPremium')
                                : t('settingsSubscriptionTierPro');

                          return (
                            <Pressable
                              key={`subscription-table-header-${plan.tier}`}
                              onPress={() =>
                                handleSubscriptionTierManualChange(plan.tier)
                              }
                              disabled={!canManualSwitchSubscriptionPlan}
                              style={{
                                width: 132,
                                padding: 10,
                                borderRightWidth:
                                  plan.tier === subscriptionPlans[subscriptionPlans.length - 1].tier
                                    ? 0
                                    : 1,
                                borderRightColor: themeBorder,
                                backgroundColor: isCurrent
                                  ? themeAccentSoftBg
                                  : themeCardBg,
                                opacity: !canManualSwitchSubscriptionPlan ? 0.9 : 1,
                              }}>
                              <Text
                                style={{
                                  color: themeTextPrimary,
                                  fontWeight: '700',
                                  textAlign: 'center',
                                }}>
                                {planLabel}
                              </Text>
                              <Text
                                style={{
                                  color: isCurrent ? themeAccentText : themeTextSecondary,
                                  fontSize: 11,
                                  marginTop: 4,
                                  textAlign: 'center',
                                  fontWeight: '700',
                                }}>
                                {isCurrent
                                  ? t('settingsSubscriptionCurrentBadge')
                                  : t('settingsSubscriptionChoosePlan')}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {subscriptionCapabilityRows.map((row, rowIndex) => (
                        <View
                          key={`subscription-row-${row.key}`}
                          style={{
                            flexDirection: 'row',
                            borderWidth: 1,
                            borderTopWidth: rowIndex === 0 ? 0 : 1,
                            borderColor: themeBorder,
                            backgroundColor: themeCardBg,
                          }}>
                          <View
                            style={{
                              width: 160,
                              padding: 10,
                              borderRightWidth: 1,
                              borderRightColor: themeBorder,
                              backgroundColor: themeCardBgAlt,
                              justifyContent: 'center',
                            }}>
                            <Text
                              style={{
                                color: themeTextPrimary,
                                fontWeight: '700',
                                fontSize: 12,
                              }}>
                              {row.label}
                            </Text>
                          </View>
                          {subscriptionPlans.map((plan) => {
                            const isCurrent = subscription.tier === plan.tier;

                            return (
                              <View
                                key={`subscription-row-${row.key}-${plan.tier}`}
                                style={{
                                  width: 132,
                                  padding: 10,
                                  borderRightWidth:
                                    plan.tier === subscriptionPlans[subscriptionPlans.length - 1].tier
                                      ? 0
                                      : 1,
                                  borderRightColor: themeBorder,
                                  backgroundColor: isCurrent
                                    ? themeAccentSoftBg
                                    : themeCardBg,
                                  justifyContent: 'center',
                                }}>
                                <Text
                                  style={{
                                    color: isCurrent ? themeTextPrimary : themeTextSecondary,
                                    fontSize: 12,
                                    lineHeight: 18,
                                    textAlign: 'center',
                                    fontWeight: isCurrent ? '700' : '400',
                                  }}>
                                  {row.values[plan.tier]}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                  <View
                    style={{
                      marginTop: 10,
                      borderWidth: 1,
                      borderColor: themeBorder,
                      borderRadius: 10,
                      padding: 10,
                      backgroundColor: themeCardBg,
                    }}>
                    <Text
                      style={{
                        color: themeTextSecondary,
                        fontSize: 12,
                        marginBottom: 8,
                      }}>
                      {t('settingsSubscriptionProductMapTitle')}
                    </Text>
                    {subscriptionPlans.map((plan) => {
                      const planLabel =
                        plan.tier === 'free'
                          ? t('settingsSubscriptionTierFree')
                          : plan.tier === 'premium'
                            ? t('settingsSubscriptionTierPremium')
                            : t('settingsSubscriptionTierPro');
                      const mappedProductId =
                        subscriptionPlatformProductIdByTier[plan.tier] ?? null;

                      return (
                        <Text
                          key={`subscription-product-id-${plan.tier}`}
                          style={{
                            color: mappedProductId ? themeTextPrimary : themeWarningText,
                            fontSize: 12,
                            marginTop: 4,
                          }}>
                          {mappedProductId
                            ? t('settingsSubscriptionProductMapRow', {
                                plan: planLabel,
                                productId: mappedProductId,
                              })
                            : t('settingsSubscriptionProductMapMissingRow', {
                                plan: planLabel,
                              })}
                        </Text>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          )}

          {isSettingsSection && (
            <View
              style={{
                borderWidth: 1,
                borderColor: themeDangerBg,
                borderRadius: 10,
                padding: 12,
                marginBottom: 18,
                backgroundColor: themeDangerSoftBg,
              }}>
              <Text
                style={{
                  color: themeDangerText,
                  fontWeight: '700',
                  fontSize: 16,
                }}>
                {t('settingsDeleteAccount')}
              </Text>
              <Text
                style={{
                  color: themeTextSecondary,
                  fontSize: 12,
                  marginTop: 8,
                }}>
                {t('settingsDeleteAccountHint')}
              </Text>
              <Pressable
                onPress={handleDeleteAccount}
                disabled={deleteAccountBusy}
                style={{
                  marginTop: 12,
                  borderWidth: 1,
                  borderColor: themeDanger,
                  borderRadius: 8,
                  paddingVertical: 10,
                  backgroundColor: themeDangerBg,
                  opacity: deleteAccountBusy ? 0.7 : 1,
                }}>
                <Text
                  style={{
                    color: themeDangerText,
                    textAlign: 'center',
                    fontWeight: '700',
                  }}>
                  {deleteAccountBusy
                    ? t('settingsDeleteAccountDeleting')
                    : t('settingsDeleteAccountCta')}
                </Text>
              </Pressable>
            </View>
          )}

          {isIssuesSection && isHealthTankMode && (
            <View
              style={{
                borderWidth: 1,
                borderColor: themeBorder,
                borderRadius: 10,
                padding: 12,
                marginBottom: 18,
                backgroundColor: themeCardBg,
              }}>
              <Pressable
                onPress={() => setIsTankDiseasesExpanded((prev) => !prev)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                <Text style={{ color: themeTextPrimary, fontWeight: '700', fontSize: 16 }}>
                  {t('diseaseInTank')}
                </Text>
                <Text style={{ color: issueAccentText, fontWeight: '700' }}>
                  {isTankDiseasesExpanded
                    ? t('hide')
                    : t('showWithCount', { count: activeDiseaseCases.length })}
                </Text>
              </Pressable>

              {!isTankDiseasesExpanded ? null : !selectedTank ? (
                <Text style={{ color: themeTextSecondary, marginTop: 8 }}>
                  {t('chooseTankForDiseases')}
                </Text>
              ) : activeDiseaseCases.length === 0 ? (
                <Text style={{ color: themeTextSecondary, marginTop: 8 }}>
                  {t('noActiveDiseases')}
                </Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {activeDiseaseCases.map((caseItem) => {
                    const isExpanded = expandedDiseaseCaseId === caseItem.id;
                    const schedule = [...(caseItem.schedule ?? [])].sort(
                      (a, b) => getCreatedAtMs(a?.dueAt) - getCreatedAtMs(b?.dueAt)
                    );

                    return (
                      <View
                        key={`disease-case-${caseItem.id}`}
                        style={{
                          borderWidth: 1,
                          borderColor: themeBorder,
                          borderRadius: 8,
                          padding: 10,
                          marginBottom: 8,
                          backgroundColor: themeCardBgAlt,
                        }}>
                        <Pressable
                          onPress={() =>
                            setExpandedDiseaseCaseId((prev) =>
                              prev === caseItem.id ? null : caseItem.id
                            )
                          }
                          style={{
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                          }}>
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>
                              {caseItem.issueName ?? t('diseaseDefaultName')}
                            </Text>
                            <Text style={{ color: themeTextSecondary, fontSize: 12, marginTop: 2 }}>
                              {t('addedAt', {
                                date: formatDateOnly(caseItem.createdAt),
                              })}
                            </Text>
                          </View>
                        </Pressable>

                        {!isExpanded ? null : (
                          <View
                            style={{
                              marginTop: 8,
                              borderTopWidth: 1,
                              borderTopColor: issueDivider,
                              paddingTop: 8,
                            }}>
                            <Text style={{ color: themeTextPrimary, fontSize: issueBodyTextSize }}>
                              {caseItem.diseaseSummary ?? t('noDescription')}
                            </Text>
                            {!hasTaskReminderAccess ? (
                              <Text style={{ color: themeTextSecondary, marginTop: 8, fontSize: 12 }}>
                                {t('subscriptionTasksLocked')}
                              </Text>
                            ) : !hasTaskChecklistAccess ? (
                              <>
                                {schedule[0] ? (
                                  <>
                                    <Text
                                      style={{
                                        color: issueSuccessText,
                                        marginTop: 8,
                                        fontWeight: '700',
                                        fontSize: 12,
                                      }}>
                                      {t('nextReminder')}
                                    </Text>
                                    <Text
                                      style={{ color: issueScheduleText, marginTop: 2, fontSize: issueBodyTextSize }}>
                                      {formatDateOnly(schedule[0].dueAt)} - {schedule[0].action}
                                    </Text>
                                  </>
                                ) : (
                                  <Text style={{ color: themeTextSecondary, marginTop: 8, fontSize: issueBodyTextSize }}>
                                    {t('subscriptionTasksReminders')}
                                  </Text>
                                )}
                                <Text style={{ color: themeTextSecondary, marginTop: 6, fontSize: issueBodyTextSize }}>
                                  {t('subscriptionTasksPlanLocked')}
                                </Text>
                              </>
                            ) : (
                              <>
                                <Text
                                  style={{
                                    color: issueSuccessText,
                                    marginTop: 8,
                                    fontWeight: '700',
                                    fontSize: 12,
                                  }}>
                                  {t('treatment')}
                                </Text>
                                {(caseItem.treatmentPlan ?? []).length === 0 ? (
                                  <Text style={{ color: issueMetaText, marginTop: 2, fontSize: issueBodyTextSize }}>
                                    {t('noTreatmentPlan')}
                                  </Text>
                                ) : (
                                  (caseItem.treatmentPlan ?? []).slice(0, 6).map((step, index) => (
                                    <Text
                                      key={`disease-plan-${caseItem.id}-${index}`}
                                      style={{ color: issueAccentText, marginTop: 2, fontSize: issueBodyTextSize }}>
                                      - {step}
                                    </Text>
                                  ))
                                )}

                                {schedule.length > 0 && (
                                  <>
                                    <Text
                                      style={{
                                        color: issueMetaText,
                                        marginTop: 8,
                                        fontWeight: '700',
                                        fontSize: issueBodyTextSize,
                                      }}>
                                      {t('schedule')}
                                    </Text>
                                    {schedule.slice(0, 6).map((task, index) => (
                                      <Text
                                        key={`disease-schedule-${caseItem.id}-${index}`}
                                        style={{ color: issueScheduleText, marginTop: 2, fontSize: issueBodyTextSize }}>
                                        {formatDateOnly(task.dueAt)} - {task.action}
                                      </Text>
                                    ))}
                                  </>
                                )}
                              </>
                            )}

                            <Text style={{ color: issueWarningText, marginTop: 8, fontSize: issueBodyTextSize }}>
                              {t('cautionWithValue', {
                                value: caseItem.caution ?? t('noExtraNotes'),
                              })}
                            </Text>

                            <Pressable
                              onPress={() => handleCloseTankIssueCase(caseItem)}
                              disabled={diseaseCaseBusy}
                              style={{
                                marginTop: 10,
                                borderWidth: 1,
                                borderColor: '#7a1e1e',
                                borderRadius: 8,
                                paddingVertical: 8,
                                backgroundColor: '#2a1212',
                                opacity: diseaseCaseBusy ? 0.7 : 1,
                              }}>
                              <Text
                                style={{
                                  color: issueDangerText,
                                  textAlign: 'center',
                                  fontWeight: '700',
                                  fontSize: issueBodyTextSize,
                                }}>
                                {diseaseCaseBusy
                                  ? t('saving')
                                  : t('markAsCured')}
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {isIssuesSection && isHealthTankMode && (
            <View
              style={{
                borderWidth: 1,
                borderColor: themeBorder,
                borderRadius: 10,
                padding: 12,
                marginBottom: 18,
                backgroundColor: themeCardBg,
              }}>
              <Pressable
                onPress={() => setIsTankPlantDiseasesExpanded((prev) => !prev)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                <Text style={{ color: themeTextPrimary, fontWeight: '700', fontSize: 16 }}>
                  {t('plantDiseaseInTank')}
                </Text>
                <Text style={{ color: issueAccentText, fontWeight: '700' }}>
                  {isTankPlantDiseasesExpanded
                    ? t('hide')
                    : t('showWithCount', { count: activePlantDiseaseCases.length })}
                </Text>
              </Pressable>

              {!isTankPlantDiseasesExpanded ? null : !selectedTank ? (
                <Text style={{ color: themeTextSecondary, marginTop: 8 }}>
                  {t('chooseTankForPlantDiseases')}
                </Text>
              ) : activePlantDiseaseCases.length === 0 ? (
                <Text style={{ color: themeTextSecondary, marginTop: 8 }}>
                  {t('noActivePlantDiseases')}
                </Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {activePlantDiseaseCases.map((caseItem) => {
                    const isExpanded = expandedPlantDiseaseCaseId === caseItem.id;
                    const schedule = [...(caseItem.schedule ?? [])].sort(
                      (a, b) => getCreatedAtMs(a?.dueAt) - getCreatedAtMs(b?.dueAt)
                    );

                    return (
                      <View
                        key={`plant-disease-case-${caseItem.id}`}
                        style={{
                          borderWidth: 1,
                          borderColor: themeBorder,
                          borderRadius: 8,
                          padding: 10,
                          marginBottom: 8,
                          backgroundColor: themeCardBgAlt,
                        }}>
                        <Pressable
                          onPress={() =>
                            setExpandedPlantDiseaseCaseId((prev) =>
                              prev === caseItem.id ? null : caseItem.id
                            )
                          }
                          style={{
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                          }}>
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>
                              {caseItem.issueName ?? t('diseaseDefaultName')}
                            </Text>
                            <Text style={{ color: themeTextSecondary, fontSize: issueBodyTextSize, marginTop: 2 }}>
                              {t('addedAt', {
                                date: formatDateOnly(caseItem.createdAt),
                              })}
                            </Text>
                          </View>
                        </Pressable>

                        {!isExpanded ? null : (
                          <View
                            style={{
                              marginTop: 8,
                              borderTopWidth: 1,
                              borderTopColor: issueDivider,
                              paddingTop: 8,
                            }}>
                            <Text style={{ color: themeTextPrimary, fontSize: issueBodyTextSize }}>
                              {caseItem.diseaseSummary ?? t('noDescription')}
                            </Text>
                            {!hasTaskReminderAccess ? (
                              <Text style={{ color: themeTextSecondary, marginTop: 8, fontSize: issueBodyTextSize }}>
                                {t('subscriptionTasksLocked')}
                              </Text>
                            ) : !hasTaskChecklistAccess ? (
                              <>
                                {schedule[0] ? (
                                  <>
                                    <Text
                                      style={{
                                        color: issueSuccessText,
                                        marginTop: 8,
                                        fontWeight: '700',
                                        fontSize: issueBodyTextSize,
                                      }}>
                                      {t('nextReminder')}
                                    </Text>
                                    <Text
                                      style={{ color: issueScheduleText, marginTop: 2, fontSize: issueBodyTextSize }}>
                                      {formatDateOnly(schedule[0].dueAt)} - {schedule[0].action}
                                    </Text>
                                  </>
                                ) : (
                                  <Text style={{ color: themeTextSecondary, marginTop: 8, fontSize: issueBodyTextSize }}>
                                    {t('subscriptionTasksReminders')}
                                  </Text>
                                )}
                                <Text style={{ color: themeTextSecondary, marginTop: 6, fontSize: issueBodyTextSize }}>
                                  {t('subscriptionTasksPlanLocked')}
                                </Text>
                              </>
                            ) : (
                              <>
                                <Text
                                  style={{
                                    color: issueSuccessText,
                                    marginTop: 8,
                                    fontWeight: '700',
                                    fontSize: issueBodyTextSize,
                                  }}>
                                  {t('treatment')}
                                </Text>
                                {(caseItem.treatmentPlan ?? []).length === 0 ? (
                                  <Text style={{ color: issueMetaText, marginTop: 2, fontSize: issueBodyTextSize }}>
                                    {t('noTreatmentPlan')}
                                  </Text>
                                ) : (
                                  (caseItem.treatmentPlan ?? []).slice(0, 6).map((step, index) => (
                                    <Text
                                      key={`plant-disease-plan-${caseItem.id}-${index}`}
                                      style={{ color: issueAccentText, marginTop: 2, fontSize: issueBodyTextSize }}>
                                      - {step}
                                    </Text>
                                  ))
                                )}

                                {schedule.length > 0 && (
                                  <>
                                    <Text
                                      style={{
                                        color: issueMetaText,
                                        marginTop: 8,
                                        fontWeight: '700',
                                        fontSize: issueBodyTextSize,
                                      }}>
                                      {t('schedule')}
                                    </Text>
                                    {schedule.slice(0, 6).map((task, index) => (
                                      <Text
                                        key={`plant-disease-schedule-${caseItem.id}-${index}`}
                                        style={{ color: issueScheduleText, marginTop: 2, fontSize: issueBodyTextSize }}>
                                        {formatDateOnly(task.dueAt)} - {task.action}
                                      </Text>
                                    ))}
                                  </>
                                )}
                              </>
                            )}

                            <Text style={{ color: issueWarningText, marginTop: 8, fontSize: issueBodyTextSize }}>
                              {t('cautionWithValue', {
                                value: caseItem.caution ?? t('noExtraNotes'),
                              })}
                            </Text>

                            <Pressable
                              onPress={() => handleCloseTankIssueCase(caseItem)}
                              disabled={diseaseCaseBusy}
                              style={{
                                marginTop: 10,
                                borderWidth: 1,
                                borderColor: '#7a1e1e',
                                borderRadius: 8,
                                paddingVertical: 8,
                                backgroundColor: '#2a1212',
                                opacity: diseaseCaseBusy ? 0.7 : 1,
                              }}>
                              <Text
                                style={{
                                  color: issueDangerText,
                                  textAlign: 'center',
                                  fontWeight: '700',
                                  fontSize: issueBodyTextSize,
                                }}>
                                {diseaseCaseBusy
                                  ? t('saving')
                                  : t('markAsCured')}
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {isIssuesSection && isHealthTankMode && (
            <View
              style={{
                borderWidth: 1,
                borderColor: themeBorder,
                borderRadius: 10,
                padding: 12,
                marginBottom: 18,
                backgroundColor: themeCardBg,
              }}>
              <Pressable
                onPress={() => setIsTankAlgaeExpanded((prev) => !prev)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                <Text style={{ color: themeTextPrimary, fontWeight: '700', fontSize: 16 }}>
                  {t('algaeInTank')}
                </Text>
                <Text style={{ color: issueAccentText, fontWeight: '700' }}>
                  {isTankAlgaeExpanded
                    ? t('hide')
                    : t('showWithCount', { count: activeAlgaeCases.length })}
                </Text>
              </Pressable>

              {!isTankAlgaeExpanded ? null : !selectedTank ? (
                <Text style={{ color: themeTextSecondary, marginTop: 8 }}>
                  {t('chooseTankForAlgae')}
                </Text>
              ) : activeAlgaeCases.length === 0 ? (
                <Text style={{ color: themeTextSecondary, marginTop: 8 }}>
                  {t('noActiveAlgae')}
                </Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {activeAlgaeCases.map((caseItem) => {
                    const isExpanded = expandedAlgaeCaseId === caseItem.id;
                    const schedule = [...(caseItem.schedule ?? [])].sort(
                      (a, b) => getCreatedAtMs(a?.dueAt) - getCreatedAtMs(b?.dueAt)
                    );

                    return (
                      <View
                        key={`algae-case-${caseItem.id}`}
                        style={{
                          borderWidth: 1,
                          borderColor: themeBorder,
                          borderRadius: 8,
                          padding: 10,
                          marginBottom: 8,
                          backgroundColor: themeCardBgAlt,
                        }}>
                        <Pressable
                          onPress={() =>
                            setExpandedAlgaeCaseId((prev) =>
                              prev === caseItem.id ? null : caseItem.id
                            )
                          }
                          style={{
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                          }}>
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>
                              {caseItem.issueName ?? t('algaeDefaultName')}
                            </Text>
                            <Text style={{ color: themeTextSecondary, fontSize: issueBodyTextSize, marginTop: 2 }}>
                              {t('addedAt', {
                                date: formatDateOnly(caseItem.createdAt),
                              })}
                            </Text>
                          </View>
                        </Pressable>

                        {!isExpanded ? null : (
                          <View
                            style={{
                              marginTop: 8,
                              borderTopWidth: 1,
                              borderTopColor: issueDivider,
                              paddingTop: 8,
                            }}>
                            <Text style={{ color: themeTextPrimary, fontSize: issueBodyTextSize }}>
                              {caseItem.diseaseSummary ?? t('noDescription')}
                            </Text>

                            {Array.isArray(caseItem.causes) && caseItem.causes.length > 0 && (
                              <>
                                <Text
                                  style={{
                                    color: issueMetaText,
                                    marginTop: 8,
                                    fontWeight: '700',
                                    fontSize: issueBodyTextSize,
                                  }}>
                                  {t('causes')}
                                </Text>
                                {caseItem.causes.slice(0, 5).map((cause, index) => (
                                  <Text
                                    key={`algae-cause-${caseItem.id}-${index}`}
                                    style={{ color: issueMutedText, marginTop: 2, fontSize: issueBodyTextSize }}>
                                    - {cause}
                                  </Text>
                                ))}
                              </>
                            )}

                            <Text
                              style={{
                                color: issueSuccessText,
                                marginTop: 8,
                                fontWeight: '700',
                                fontSize: issueBodyTextSize,
                              }}>
                              {t('removalAndPrevention')}
                            </Text>
                            {!hasTaskReminderAccess ? (
                              <Text style={{ color: themeTextSecondary, marginTop: 8, fontSize: issueBodyTextSize }}>
                                {t('subscriptionTasksLocked')}
                              </Text>
                            ) : !hasTaskChecklistAccess ? (
                              <>
                                {schedule[0] ? (
                                  <>
                                    <Text
                                      style={{
                                        color: issueSuccessText,
                                        marginTop: 8,
                                        fontWeight: '700',
                                        fontSize: issueBodyTextSize,
                                      }}>
                                      {t('nextReminder')}
                                    </Text>
                                    <Text
                                      style={{ color: issueScheduleText, marginTop: 2, fontSize: issueBodyTextSize }}>
                                      {formatDateOnly(schedule[0].dueAt)} - {schedule[0].action}
                                    </Text>
                                  </>
                                ) : (
                                  <Text style={{ color: themeTextSecondary, marginTop: 8, fontSize: issueBodyTextSize }}>
                                    {t('subscriptionTasksReminders')}
                                  </Text>
                                )}
                                <Text style={{ color: themeTextSecondary, marginTop: 6, fontSize: issueBodyTextSize }}>
                                  {t('subscriptionTasksPlanLocked')}
                                </Text>
                              </>
                            ) : (
                              <>
                                {(caseItem.treatmentPlan ?? []).length === 0 ? (
                                  <Text style={{ color: issueMetaText, marginTop: 2, fontSize: issueBodyTextSize }}>
                                    {t('noActionPlan')}
                                  </Text>
                                ) : (
                                  (caseItem.treatmentPlan ?? []).slice(0, 6).map((step, index) => (
                                    <Text
                                      key={`algae-plan-${caseItem.id}-${index}`}
                                      style={{ color: issueAccentText, marginTop: 2, fontSize: issueBodyTextSize }}>
                                      - {step}
                                    </Text>
                                  ))
                                )}

                                {schedule.length > 0 && (
                                  <>
                                    <Text
                                      style={{
                                        color: issueMetaText,
                                        marginTop: 8,
                                        fontWeight: '700',
                                        fontSize: issueBodyTextSize,
                                      }}>
                                      {t('schedule')}
                                    </Text>
                                    {schedule.slice(0, 6).map((task, index) => (
                                      <Text
                                        key={`algae-schedule-${caseItem.id}-${index}`}
                                        style={{ color: issueScheduleText, marginTop: 2, fontSize: issueBodyTextSize }}>
                                        {formatDateOnly(task.dueAt)} - {task.action}
                                      </Text>
                                    ))}
                                  </>
                                )}
                              </>
                            )}

                            <Text style={{ color: issueWarningText, marginTop: 8, fontSize: issueBodyTextSize }}>
                              {t('cautionWithValue', {
                                value: caseItem.caution ?? t('noExtraNotes'),
                              })}
                            </Text>

                            <Pressable
                              onPress={() => handleCloseTankIssueCase(caseItem)}
                              disabled={diseaseCaseBusy}
                              style={{
                                marginTop: 10,
                                borderWidth: 1,
                                borderColor: '#7a1e1e',
                                borderRadius: 8,
                                paddingVertical: 8,
                                backgroundColor: '#2a1212',
                                opacity: diseaseCaseBusy ? 0.7 : 1,
                              }}>
                              <Text
                                style={{
                                  color: issueDangerText,
                                  textAlign: 'center',
                                  fontWeight: '700',
                                  fontSize: issueBodyTextSize,
                                }}>
                                {diseaseCaseBusy
                                  ? t('saving')
                                  : t('markAsRemoved')}
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {isReviewSection && !selectedTank && (
            <View
              style={{
                borderWidth: 1,
                borderColor: themeBorder,
                borderRadius: 10,
                padding: 12,
                marginBottom: 18,
                backgroundColor: themeCardBg,
              }}>
              <Text style={{ color: '#9da3af', marginBottom: 10 }}>
                {t('noTankAddFirst')}
              </Text>

              <TextInput
                placeholder={t('tankNamePlaceholder')}
                placeholderTextColor={themePlaceholder}
                value={tankName}
                onChangeText={setTankName}
                style={{
                  borderWidth: 1,
                  borderColor: themeInputBorder,
                  color: themeInputText,
                  padding: 10,
                  marginBottom: 10,
                }}
              />
              <TextInput
                placeholder={t('tankLitersPlaceholder')}
                placeholderTextColor={themePlaceholder}
                value={tankLiters}
                onChangeText={setTankLiters}
                keyboardType="numeric"
                style={{
                  borderWidth: 1,
                  borderColor: themeInputBorder,
                  color: themeInputText,
                  padding: 10,
                  marginBottom: 10,
                }}
              />
              <Text
                style={{
                  color: '#9da3af',
                  marginBottom: 6,
                  fontSize: 12,
                }}>
                {t('aquariumTypeLabel')}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 10,
                }}>
                {AQUARIUM_TYPE_OPTIONS.map((option) => (
                  <Pressable
                    key={`add-type-inline-${option.value}`}
                    onPress={() => setTankAquariumType(option.value)}
                    style={{
                      borderWidth: 1,
                      borderColor:
                        tankAquariumType === option.value ? themeAccent : themeBorderStrong,
                      backgroundColor:
                        tankAquariumType === option.value
                          ? '#102235'
                          : isLightTheme
                            ? '#ffffff'
                            : '#111',
                      borderRadius: 999,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                    }}>
                    <Text
                      style={{
                        color:
                          tankAquariumType === option.value
                            ? 'white'
                            : themeTextPrimary,
                        fontSize: 12,
                      }}>
                      {t(option.labelKey)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text
                style={{
                  color: '#9da3af',
                  marginBottom: 6,
                  fontSize: 12,
                }}>
                Start akwarium
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 10,
                }}>
                {ONBOARDING_START_OPTIONS.map((option) => (
                  <Pressable
                    key={`add-onboarding-inline-${option.value}`}
                    onPress={() => setTankOnboardingMode(option.value)}
                    style={{
                      borderWidth: 1,
                      borderColor:
                        tankOnboardingMode === option.value ? themeAccent : themeBorderStrong,
                      backgroundColor:
                        tankOnboardingMode === option.value
                          ? '#102235'
                          : isLightTheme
                            ? '#ffffff'
                            : '#111',
                      borderRadius: 999,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                    }}>
                    <Text
                      style={{
                        color:
                          tankOnboardingMode === option.value
                            ? 'white'
                            : themeTextPrimary,
                        fontSize: 12,
                      }}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text
                style={{
                  color: '#9da3af',
                  marginBottom: 6,
                  fontSize: 12,
                }}>
                {t('substrate')}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 10,
                }}>
                {SUBSTRATE_OPTIONS.map((option) => (
                  <Pressable
                    key={`add-substrate-${option.value}`}
                    onPress={() => setTankSubstrateType(option.value)}
                    style={{
                      borderWidth: 1,
                      borderColor:
                        tankSubstrateType === option.value ? themeAccent : themeBorderStrong,
                      backgroundColor:
                        tankSubstrateType === option.value
                          ? '#102235'
                          : isLightTheme
                            ? '#ffffff'
                            : '#111',
                      borderRadius: 999,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                    }}>
                    <Text
                      style={{
                        color:
                          tankSubstrateType === option.value
                            ? 'white'
                            : themeTextPrimary,
                        fontSize: 12,
                      }}>
                      {t(option.labelKey)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text
                style={{
                  color: '#9da3af',
                  marginBottom: 6,
                  fontSize: 12,
                }}>
                {t('lightIntensity')}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 10,
                }}>
                {LIGHT_INTENSITY_OPTIONS.map((option) => (
                  <Pressable
                    key={`add-light-${option.value}`}
                    onPress={() => setTankLightIntensity(option.value)}
                    style={{
                      borderWidth: 1,
                      borderColor:
                        tankLightIntensity === option.value ? themeAccent : themeBorderStrong,
                      backgroundColor:
                        tankLightIntensity === option.value
                          ? '#102235'
                          : isLightTheme
                            ? '#ffffff'
                            : '#111',
                      borderRadius: 999,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                    }}>
                    <Text
                      style={{
                        color:
                          tankLightIntensity === option.value
                            ? 'white'
                            : themeTextPrimary,
                        fontSize: 12,
                      }}>
                      {t(option.labelKey)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                placeholder={t('lightHoursPlaceholder')}
                placeholderTextColor={themePlaceholder}
                value={tankLightHours}
                onChangeText={setTankLightHours}
                keyboardType="numeric"
                style={{
                  borderWidth: 1,
                  borderColor: themeInputBorder,
                  color: themeInputText,
                  padding: 10,
                  marginBottom: 10,
                }}
              />
              <Pressable
                onPress={handleSaveTank}
                style={{
                  backgroundColor: themeSuccessBg,
                  padding: 12,
                  borderRadius: 8,
                  opacity: addTankBusy ? 0.7 : 1,
                }}>
                <Text
                  style={{
                    color: 'white',
                    textAlign: 'center',
                    fontWeight: '700',
                  }}>
                  {addTankBusy ? t('adding') : t('addTank')}
                </Text>
              </Pressable>
            </View>
          )}

          {isAddingTankModalVisible && (
            <Modal
              visible
              animationType="slide"
              presentationStyle="fullScreen"
              onRequestClose={handleCancelAddTank}>
              <SafeAreaView style={{ flex: 1, backgroundColor: themeModalBg }}>
                <KeyboardAvoidingView
                  style={{ flex: 1 }}
                  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                  keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      paddingTop: Math.max(insets.top + 8, 20),
                      paddingBottom: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: '#222',
                    }}>
                    <Text
                      style={{
                        color: themeTextPrimary,
                        fontSize: 18,
                        fontWeight: '700',
                      }}>
                      {t('addTank')}
                    </Text>
                    <Pressable
                      onPress={handleCancelAddTank}
                      style={{
                        width: 34,
                        height: 34,
                        borderWidth: 1,
                        borderColor: '#666',
                        borderRadius: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Text style={{ color: themeTextPrimary, fontSize: 18 }}>X</Text>
                    </Pressable>
                  </View>

                  <ScrollView
                    style={{ flex: 1 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
                    <TextInput
                      placeholder={t('tankNamePlaceholder')}
                      placeholderTextColor={themePlaceholder}
                      value={tankName}
                      onChangeText={setTankName}
                      style={{
                        borderWidth: 1,
                        borderColor: themeInputBorder,
                        color: themeInputText,
                        padding: 10,
                        marginBottom: 10,
                      }}
                    />
                    <TextInput
                      placeholder={t('tankLitersPlaceholder')}
                      placeholderTextColor={themePlaceholder}
                      value={tankLiters}
                      onChangeText={setTankLiters}
                      keyboardType="numeric"
                      style={{
                        borderWidth: 1,
                        borderColor: themeInputBorder,
                        color: themeInputText,
                        padding: 10,
                        marginBottom: 10,
                      }}
                    />
                    <Text
                      style={{
                        color: '#9da3af',
                        marginBottom: 6,
                        fontSize: 12,
                      }}>
                      {t('aquariumTypeLabel')}
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginBottom: 10,
                      }}>
                      {AQUARIUM_TYPE_OPTIONS.map((option) => (
                        <Pressable
                          key={`add-type-modal-${option.value}`}
                          onPress={() => setTankAquariumType(option.value)}
                          style={{
                            borderWidth: 1,
                            borderColor:
                              tankAquariumType === option.value ? themeAccent : themeBorderStrong,
                            backgroundColor:
                              tankAquariumType === option.value
                                ? '#102235'
                                : isLightTheme
                                  ? '#ffffff'
                                  : '#111',
                            borderRadius: 999,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                          }}>
                          <Text
                            style={{
                              color:
                                tankAquariumType === option.value
                                  ? 'white'
                                  : themeTextPrimary,
                              fontSize: 12,
                            }}>
                            {t(option.labelKey)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text
                      style={{
                        color: '#9da3af',
                        marginBottom: 6,
                        fontSize: 12,
                      }}>
                      Start akwarium
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginBottom: 10,
                      }}>
                      {ONBOARDING_START_OPTIONS.map((option) => (
                        <Pressable
                          key={`add-onboarding-modal-${option.value}`}
                          onPress={() => setTankOnboardingMode(option.value)}
                          style={{
                            borderWidth: 1,
                            borderColor:
                              tankOnboardingMode === option.value ? themeAccent : themeBorderStrong,
                            backgroundColor:
                              tankOnboardingMode === option.value
                                ? '#102235'
                                : isLightTheme
                                  ? '#ffffff'
                                  : '#111',
                            borderRadius: 999,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                          }}>
                          <Text
                            style={{
                              color:
                                tankOnboardingMode === option.value
                                  ? 'white'
                                  : themeTextPrimary,
                              fontSize: 12,
                            }}>
                            {option.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text
                      style={{
                        color: '#9da3af',
                        marginBottom: 6,
                        fontSize: 12,
                      }}>
                      {t('substrate')}
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginBottom: 10,
                      }}>
                      {SUBSTRATE_OPTIONS.map((option) => (
                        <Pressable
                          key={`add-modal-substrate-${option.value}`}
                          onPress={() => setTankSubstrateType(option.value)}
                          style={{
                            borderWidth: 1,
                            borderColor:
                              tankSubstrateType === option.value ? themeAccent : themeBorderStrong,
                            backgroundColor:
                              tankSubstrateType === option.value
                                ? '#102235'
                                : isLightTheme
                                  ? '#ffffff'
                                  : '#111',
                            borderRadius: 999,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                          }}>
                          <Text
                            style={{
                              color:
                                tankSubstrateType === option.value
                                  ? 'white'
                                  : themeTextPrimary,
                              fontSize: 12,
                            }}>
                            {t(option.labelKey)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text
                      style={{
                        color: '#9da3af',
                        marginBottom: 6,
                        fontSize: 12,
                      }}>
                      {t('lightIntensity')}
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginBottom: 10,
                      }}>
                      {LIGHT_INTENSITY_OPTIONS.map((option) => (
                        <Pressable
                          key={`add-modal-light-${option.value}`}
                          onPress={() => setTankLightIntensity(option.value)}
                          style={{
                            borderWidth: 1,
                            borderColor:
                              tankLightIntensity === option.value ? themeAccent : themeBorderStrong,
                            backgroundColor:
                              tankLightIntensity === option.value
                                ? '#102235'
                                : isLightTheme
                                  ? '#ffffff'
                                  : '#111',
                            borderRadius: 999,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                          }}>
                          <Text
                            style={{
                              color:
                                tankLightIntensity === option.value
                                  ? 'white'
                                  : themeTextPrimary,
                              fontSize: 12,
                            }}>
                            {t(option.labelKey)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <TextInput
                      placeholder={t('lightHoursPlaceholder')}
                      placeholderTextColor={themePlaceholder}
                      value={tankLightHours}
                      onChangeText={setTankLightHours}
                      keyboardType="numeric"
                      style={{
                        borderWidth: 1,
                        borderColor: themeInputBorder,
                        color: themeInputText,
                        padding: 10,
                        marginBottom: 10,
                      }}
                    />

                    <Pressable
                      onPress={handleSaveTank}
                      style={{
                        backgroundColor: themeSuccessBg,
                        padding: 12,
                        borderRadius: 8,
                        opacity: addTankBusy ? 0.7 : 1,
                      }}>
                      <Text
                        style={{
                          color: 'white',
                          textAlign: 'center',
                          fontWeight: '700',
                        }}>
                        {addTankBusy ? t('adding') : t('addTank')}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={handleCancelAddTank}
                      style={{
                        borderWidth: 1,
                        borderColor: '#666',
                        padding: 10,
                        borderRadius: 8,
                        marginTop: 8,
                      }}>
                      <Text style={{ color: themeTextPrimary, textAlign: 'center' }}>
                        {t('cancel')}
                      </Text>
                    </Pressable>
                  </ScrollView>
                </KeyboardAvoidingView>
              </SafeAreaView>
            </Modal>
          )}

          {isEquipmentCatalogModalVisible && (
            <Modal
              visible
              animationType="slide"
              presentationStyle="fullScreen"
              onRequestClose={handleCloseEquipmentCatalog}>
              <SafeAreaView style={{ flex: 1, backgroundColor: themeModalBg }}>
                <KeyboardAvoidingView
                  style={{ flex: 1 }}
                  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                  keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      paddingTop: Math.max(insets.top + 10, 24),
                      paddingBottom: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: themeBorder,
                    }}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text
                        style={{
                          color: themeTextPrimary,
                          fontSize: 18,
                          fontWeight: '700',
                        }}>
                        {equipmentCatalogType === 'heater'
                          ? 'Katalog grzalek'
                          : 'Katalog filtrow'}
                      </Text>
                      <Text
                        style={{
                          color: themeTextSecondary,
                          fontSize: 12,
                          marginTop: 4,
                        }}>
                        {equipmentCatalogType === 'heater'
                          ? 'Porownaj modele po mocy i zalecanym litrazu.'
                          : 'Porownaj modele po wydajnosci, litrazu i sile przeplywu.'}
                      </Text>
                    </View>
                    <Pressable
                      onPress={handleCloseEquipmentCatalog}
                      hitSlop={10}
                      style={{
                        width: 34,
                        height: 34,
                        borderWidth: 1,
                        borderColor: themeBorderStrong,
                        borderRadius: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Text style={{ color: themeTextPrimary, fontSize: 18 }}>X</Text>
                    </Pressable>
                  </View>

                  <ScrollView
                    style={{ flex: 1 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: themeBorder,
                        borderRadius: 14,
                        padding: 12,
                        marginBottom: 12,
                        backgroundColor: themeCardBgAlt,
                      }}>
                      <Text
                        style={{
                          color: themeTextPrimary,
                          fontSize: 13,
                          fontWeight: '700',
                          marginBottom: 4,
                        }}>
                        Wybierz model sprzetu
                      </Text>
                      <Text style={{ color: themeTextSecondary, fontSize: 12 }}>
                        Karty pokazują najważniejsze parametry i szybkie dopasowanie do
                        Twojego zbiornika.
                      </Text>
                    </View>
                    <TextInput
                      placeholder="Szukaj producenta lub modelu"
                      placeholderTextColor={themePlaceholder}
                      value={equipmentCatalogSearch}
                      onChangeText={setEquipmentCatalogSearch}
                      style={{
                        borderWidth: 1,
                        borderColor: themeInputBorder,
                        backgroundColor: themeInputBg,
                        color: themeInputText,
                        paddingHorizontal: 12,
                        paddingVertical: 11,
                        borderRadius: 12,
                        marginBottom: 14,
                      }}
                    />
                    {filteredEquipmentCatalog.length === 0 ? (
                      <Text style={{ color: themeTextSecondary }}>
                        Brak wynikow dla podanego wyszukiwania.
                      </Text>
                    ) : (
                      <View style={{ gap: 12 }}>
                        {filteredEquipmentCatalog.map((item) => (
                          <Pressable
                            key={`equipment-catalog-item-${item.id}`}
                            onPress={() => handleAssignEquipmentToTank(item)}
                            disabled={equipmentSavingBusy}
                            style={{
                              borderWidth: 1,
                              borderColor: item.fitsTank ? themeSuccessBg : themeBorder,
                              borderRadius: 18,
                              padding: 14,
                              backgroundColor: item.fitsTank
                                ? themeSuccessSoftBg
                                : themeCardBg,
                              opacity: equipmentSavingBusy ? 0.6 : 1,
                            }}>
                            <View
                              style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: 10,
                                marginBottom: 10,
                              }}>
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={{
                                    color: item.fitsTank ? themeSuccessText : themeAccentText,
                                    fontSize: 11,
                                    fontWeight: '700',
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.4,
                                    marginBottom: 4,
                                  }}>
                                  {item.brand}
                                </Text>
                                <Text
                                  style={{
                                    color: themeTextPrimary,
                                    fontWeight: '700',
                                    fontSize: 16,
                                  }}>
                                  {item.model}
                                </Text>
                              </View>
                              <View
                                style={{
                                  borderWidth: 1,
                                  borderColor: item.fitsTank
                                    ? themeSuccessBg
                                    : themeBorderStrong,
                                  backgroundColor: item.fitsTank
                                    ? themeSuccessBg
                                    : themeChipBg,
                                  borderRadius: 999,
                                  paddingVertical: 5,
                                  paddingHorizontal: 10,
                                }}>
                                <Text
                                  style={{
                                    color: item.fitsTank
                                      ? themeAccentOnStrong
                                      : themeChipText,
                                    fontSize: 11,
                                    fontWeight: '700',
                                  }}>
                                  {item.fitsTank ? 'Pasuje' : 'Sprawdz'}
                                </Text>
                              </View>
                            </View>

                            <Text
                              style={{
                                color: themeTextSecondary,
                                fontSize: 13,
                                lineHeight: 18,
                                marginBottom: 12,
                              }}>
                              {item.description}
                            </Text>

                            <View
                              style={{
                                flexDirection: 'row',
                                flexWrap: 'wrap',
                                gap: 8,
                                marginBottom: 12,
                              }}>
                              {item.type === 'heater' ? (
                                <View
                                  style={{
                                    borderRadius: 999,
                                    paddingVertical: 6,
                                    paddingHorizontal: 10,
                                    backgroundColor: themeAccentSoftBg,
                                  }}>
                                  <Text
                                    style={{
                                      color: themeAccentText,
                                      fontSize: 12,
                                      fontWeight: '700',
                                    }}>
                                    {item.powerW} W
                                  </Text>
                                </View>
                              ) : (
                                <View
                                  style={{
                                    borderRadius: 999,
                                    paddingVertical: 6,
                                    paddingHorizontal: 10,
                                    backgroundColor: themeAccentSoftBg,
                                  }}>
                                  <Text
                                    style={{
                                      color: themeAccentText,
                                      fontSize: 12,
                                      fontWeight: '700',
                                    }}>
                                    {item.flowLh} l/h
                                  </Text>
                                </View>
                              )}
                              <View
                                style={{
                                  borderRadius: 999,
                                  paddingVertical: 6,
                                  paddingHorizontal: 10,
                                  backgroundColor: themeChipBg,
                                  borderWidth: 1,
                                  borderColor: themeBorder,
                                }}>
                                <Text
                                  style={{
                                    color: themeChipText,
                                    fontSize: 12,
                                    fontWeight: '700',
                                  }}>
                                  {formatEquipmentTankRange(item)}
                                </Text>
                              </View>
                              {item.type === 'filter' && item.flowRatio ? (
                                <View
                                  style={{
                                    borderRadius: 999,
                                    paddingVertical: 6,
                                    paddingHorizontal: 10,
                                    backgroundColor: themeChipBg,
                                    borderWidth: 1,
                                    borderColor: themeBorder,
                                  }}>
                                  <Text
                                    style={{
                                      color: themeChipText,
                                      fontSize: 12,
                                      fontWeight: '700',
                                    }}>
                                    {item.flowRatio}x/h
                                  </Text>
                                </View>
                              ) : null}
                            </View>

                            <View
                              style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 12,
                              }}>
                              <Text
                                style={{
                                  flex: 1,
                                  color: item.fitsTank ? themeSuccessText : themeTextSecondary,
                                  fontSize: 12,
                                  lineHeight: 17,
                                }}>
                                {item.fitsTank
                                  ? 'Zakres litrazu wygląda sensownie dla Twojego akwarium.'
                                  : 'Model jest poza zalecanym zakresem litrazu dla tego zbiornika.'}
                              </Text>
                              <View
                                style={{
                                  borderRadius: 999,
                                  paddingVertical: 7,
                                  paddingHorizontal: 12,
                                  backgroundColor: themeAccent,
                                }}>
                                <Text
                                  style={{
                                    color: themeAccentOnStrong,
                                    fontSize: 12,
                                    fontWeight: '700',
                                  }}>
                                  Dodaj
                                </Text>
                              </View>
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </ScrollView>
                </KeyboardAvoidingView>
              </SafeAreaView>
            </Modal>
          )}

          {(isReviewSection || isTankInfoSection) &&
            selectedTank &&
            editingTankId === selectedTank.id && (
            <Modal
              visible
              animationType="slide"
              presentationStyle="fullScreen"
              onRequestClose={handleCancelEditTank}>
              <SafeAreaView style={{ flex: 1, backgroundColor: themeModalBg }}>
                <KeyboardAvoidingView
                  style={{ flex: 1 }}
                  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                  keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      paddingTop: 20,
                      paddingBottom: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: '#222',
                    }}>
                    <Text
                      style={{
                        color: themeTextPrimary,
                        fontSize: 18,
                        fontWeight: '700',
                      }}>
                      {t('editTank')}
                    </Text>
                    <Pressable
                      onPress={handleCancelEditTank}
                      style={{
                        width: 34,
                        height: 34,
                        borderWidth: 1,
                        borderColor: '#666',
                        borderRadius: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Text style={{ color: themeTextPrimary, fontSize: 18 }}>X</Text>
                    </Pressable>
                  </View>

                  <ScrollView
                    style={{ flex: 1 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
                    <TextInput
                      placeholder={t('newTankNamePlaceholder')}
                      placeholderTextColor={themePlaceholder}
                      value={tankName}
                      onChangeText={setTankName}
                style={{
                  borderWidth: 1,
                  borderColor: themeInputBorder,
                  color: themeInputText,
                  padding: 10,
                  marginBottom: 10,
                }}
                    />
                    <TextInput
                      placeholder={t('newTankLitersPlaceholder')}
                      placeholderTextColor={themePlaceholder}
                      value={tankLiters}
                      onChangeText={setTankLiters}
                      keyboardType="numeric"
                style={{
                  borderWidth: 1,
                  borderColor: themeInputBorder,
                  color: themeInputText,
                  padding: 10,
                  marginBottom: 10,
                }}
                    />
                    <Text
                      style={{
                        color: '#9da3af',
                        marginBottom: 6,
                        fontSize: 12,
                      }}>
                      {t('aquariumTypeLabel')}
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginBottom: 10,
                      }}>
                      {AQUARIUM_TYPE_OPTIONS.map((option) => (
                        <Pressable
                          key={`edit-type-${option.value}`}
                          onPress={() => setTankAquariumType(option.value)}
                          style={{
                            borderWidth: 1,
                            borderColor:
                              tankAquariumType === option.value ? themeAccent : themeBorderStrong,
                            backgroundColor:
                              tankAquariumType === option.value
                                ? '#102235'
                                : isLightTheme
                                  ? '#ffffff'
                                  : '#111',
                            borderRadius: 999,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                          }}>
                          <Text
                            style={{
                              color:
                                tankAquariumType === option.value
                                  ? 'white'
                                  : themeTextPrimary,
                              fontSize: 12,
                            }}>
                            {t(option.labelKey)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text
                      style={{
                        color: '#9da3af',
                        marginBottom: 6,
                        fontSize: 12,
                      }}>
                      {t('substrate')}
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginBottom: 10,
                      }}>
                      {SUBSTRATE_OPTIONS.map((option) => (
                        <Pressable
                          key={`edit-substrate-${option.value}`}
                          onPress={() => setTankSubstrateType(option.value)}
                          style={{
                            borderWidth: 1,
                            borderColor:
                              tankSubstrateType === option.value ? themeAccent : themeBorderStrong,
                            backgroundColor:
                              tankSubstrateType === option.value
                                ? '#102235'
                                : isLightTheme
                                  ? '#ffffff'
                                  : '#111',
                            borderRadius: 999,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                          }}>
                          <Text
                            style={{
                              color:
                                tankSubstrateType === option.value
                                  ? 'white'
                                  : themeTextPrimary,
                              fontSize: 12,
                            }}>
                            {t(option.labelKey)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text
                      style={{
                        color: '#9da3af',
                        marginBottom: 6,
                        fontSize: 12,
                      }}>
                      {t('lightIntensity')}
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginBottom: 10,
                      }}>
                      {LIGHT_INTENSITY_OPTIONS.map((option) => (
                        <Pressable
                          key={`edit-light-${option.value}`}
                          onPress={() => setTankLightIntensity(option.value)}
                          style={{
                            borderWidth: 1,
                            borderColor:
                              tankLightIntensity === option.value ? themeAccent : themeBorderStrong,
                            backgroundColor:
                              tankLightIntensity === option.value
                                ? '#102235'
                                : isLightTheme
                                  ? '#ffffff'
                                  : '#111',
                            borderRadius: 999,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                          }}>
                          <Text
                            style={{
                              color:
                                tankLightIntensity === option.value
                                  ? 'white'
                                  : themeTextPrimary,
                              fontSize: 12,
                            }}>
                            {t(option.labelKey)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <TextInput
                      placeholder={t('lightHoursPlaceholder')}
                      placeholderTextColor={themePlaceholder}
                      value={tankLightHours}
                      onChangeText={setTankLightHours}
                      keyboardType="numeric"
                      style={{
                        borderWidth: 1,
                        borderColor: themeInputBorder,
                        color: themeInputText,
                        padding: 10,
                        marginBottom: 10,
                      }}
                    />

                    <Pressable
                      onPress={handleSaveTank}
                      style={{
                        backgroundColor: themeAccent,
                        padding: 12,
                        borderRadius: 8,
                        opacity: addTankBusy ? 0.7 : 1,
                      }}>
                      <Text
                        style={{
                          color: 'white',
                          textAlign: 'center',
                          fontWeight: '700',
                        }}>
                        {addTankBusy ? t('saving') : t('saveChanges')}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={handleDeleteTank}
                      disabled={addTankBusy}
                      style={{
                        borderWidth: 1,
                        borderColor: '#7a1e1e',
                        padding: 10,
                        borderRadius: 8,
                        marginTop: 8,
                        backgroundColor: '#2a1212',
                        opacity: addTankBusy ? 0.6 : 1,
                      }}>
                      <Text
                        style={{
                          color: '#ffb3b3',
                          textAlign: 'center',
                          fontWeight: '700',
                        }}>
                        {t('deleteTankIrreversible')}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={handleCancelEditTank}
                      style={{
                        borderWidth: 1,
                        borderColor: '#666',
                        padding: 10,
                        borderRadius: 8,
                        marginTop: 8,
                      }}>
                      <Text style={{ color: themeTextPrimary, textAlign: 'center' }}>
                        {t('cancel')}
                      </Text>
                    </Pressable>
                  </ScrollView>
                </KeyboardAvoidingView>
              </SafeAreaView>
            </Modal>
          )}

          {selectedHomeScoreSummary && selectedHomeScoreAssessment ? (
            <BottomSheetModal
              visible
              onClose={handleCloseHomeScoreDetails}
              title={t('homeScoreDetailsTitle', {
                name: selectedHomeScoreSummary.tank?.name ?? '',
              })}
              themeCardBg={themeCardBg}
              themeBorder={themeBorder}
              themeTextPrimary={themeTextPrimary}
              themeCardBgAlt={themeCardBgAlt}
              themeOverlay={themeOverlay}
              themeDragHandle={themeDragHandle}
              isLightTheme={isLightTheme}
              maxWidth={620}
              heightPercent={62}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
              <ScrollView
                style={{ flex: 1 }}
                nestedScrollEnabled
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={{
                  paddingHorizontal: 14,
                  paddingTop: 14,
                  paddingBottom: Math.max(insets.bottom + 20, 20),
                }}>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 12,
                    padding: 12,
                    backgroundColor: themeCardBgAlt,
                  }}>
                  <Text style={{ color: themeTextPrimary, fontWeight: '700', fontSize: 15 }}>
                    {t('homeScoreValue', {
                      score: selectedHomeScoreAssessment.score,
                      label: selectedHomeScoreLabel,
                    })}
                  </Text>
                  <Text style={{ color: themeTextSecondary, marginTop: 6, fontSize: 12 }}>
                    {t('homeScoreAccuracyDetails', {
                      accuracy: selectedHomeScoreAssessment.accuracy,
                    })}
                  </Text>
                </View>

                <Text
                  style={{
                    color: themeTextPrimary,
                    marginTop: 12,
                    marginBottom: 8,
                    fontWeight: '700',
                  }}>
                  {t('homeScoreLoweringFactors')}
                </Text>

                {selectedHomeScoreDetails.length === 0 ? (
                  <Text style={{ color: themeTextSecondary }}>
                    {t('homeScoreNoMajorIssues')}
                  </Text>
                ) : (
                  selectedHomeScoreDetails.map((item, index) => (
                    <View
                      key={`home-score-detail-${index}`}
                      style={{
                        borderWidth: 1,
                        borderColor: themeBorder,
                        borderRadius: 10,
                        padding: 10,
                        marginBottom: 8,
                        backgroundColor: themeCardBg,
                      }}>
                      <Text style={{ color: themeTextPrimary }}>
                        - {item.text}
                      </Text>
                      <Text
                        style={{
                          color: themeWarningText,
                          marginTop: 4,
                          fontSize: 12,
                          fontWeight: '700',
                        }}>
                        -{item.points} pkt
                      </Text>
                    </View>
                  ))
                )}
              </ScrollView>
            </BottomSheetModal>
          ) : null}

          {isIssueTankPickerVisible && issueTankPickerPayload ? (
            <BottomSheetModal
              visible
              onClose={handleCloseIssueTankPicker}
              title={issueTankPickerTitle}
              themeCardBg={themeCardBg}
              themeBorder={themeBorder}
              themeTextPrimary={themeTextPrimary}
              themeCardBgAlt={themeCardBgAlt}
              themeOverlay={themeOverlay}
              themeDragHandle={themeDragHandle}
              isLightTheme={isLightTheme}
              maxWidth={560}
              heightPercent={62}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
              <ScrollView
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={{
                  paddingHorizontal: 14,
                  paddingTop: 14,
                  paddingBottom: Math.max(insets.bottom + 20, 20),
                }}>
                <Text style={{ color: themeTextSecondary, marginBottom: 10 }}>
                  {issueTankPickerHint}
                </Text>

                {issueTankPickerTanks.map((tank) => (
                  <Pressable
                    key={`issue-tank-picker-${tank.id}`}
                    onPress={() => handleSelectIssueTank(tank)}
                    style={{
                      borderWidth: 1,
                      borderColor: selectedTank?.id === tank.id ? themeAccent : themeBorder,
                      borderRadius: 10,
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      marginBottom: 8,
                      backgroundColor:
                        selectedTank?.id === tank.id ? themeAccentSoftBg : themeCardBgAlt,
                      opacity: diseaseCaseBusy ? 0.7 : 1,
                    }}>
                    <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>
                      {tank.name ?? t('noDataCaps')}
                    </Text>
                    <Text style={{ color: themeTextSecondary, marginTop: 3, fontSize: 12 }}>
                      {formatLiters(tank?.liters)}
                    </Text>
                  </Pressable>
                ))}

                <Pressable
                  onPress={handleCloseIssueTankPicker}
                  style={{
                    marginTop: 4,
                    borderWidth: 1,
                    borderColor: themeBorderStrong,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: themeCardBg,
                  }}>
                  <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>
                    {t('cancel')}
                  </Text>
                </Pressable>
              </ScrollView>
            </BottomSheetModal>
          ) : null}

          {selectedMeasurementTileDetails ? (
            <BottomSheetModal
              visible
              onClose={handleCloseMeasurementTileDetails}
              title={`${selectedMeasurementTileDetails.label} - szczegoly`}
              themeCardBg={themeCardBg}
              themeBorder={themeBorder}
              themeTextPrimary={themeTextPrimary}
              themeCardBgAlt={themeCardBgAlt}
              themeOverlay={themeOverlay}
              themeDragHandle={themeDragHandle}
              isLightTheme={isLightTheme}
              maxWidth={620}
              heightPercent={68}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
              <ScrollView
                style={{ flex: 1 }}
                nestedScrollEnabled
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={{
                  paddingHorizontal: 14,
                  paddingTop: 14,
                  paddingBottom: Math.max(insets.bottom + 20, 20),
                }}>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 12,
                    padding: 12,
                    backgroundColor: themeCardBgAlt,
                  }}>
                  <Text style={{ color: themeTextPrimary, fontWeight: '700', fontSize: 15 }}>
                    Wynik: {selectedMeasurementTileDetails.value}
                  </Text>
                  <Text
                    style={{
                      color:
                        selectedMeasurementTileDetails.severity === 'critical'
                          ? themeDangerText
                          : selectedMeasurementTileDetails.severity === 'warning'
                            ? themeWarningText
                            : themeSuccessText,
                      marginTop: 4,
                      fontWeight: '700',
                    }}>
                    Status: {SEVERITY_LABEL[selectedMeasurementTileDetails.severity]}
                  </Text>
                </View>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 12,
                    padding: 12,
                    backgroundColor: themeCardBg,
                    marginTop: 10,
                  }}>
                  <Text style={{ color: themeTextSecondary, fontWeight: '700', fontSize: 12 }}>
                    Prawidlowy zakres
                  </Text>
                  <Text style={{ color: themeTextPrimary, marginTop: 6 }}>
                    {selectedMeasurementTileDetails.range}
                  </Text>
                </View>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 12,
                    padding: 12,
                    backgroundColor: themeCardBg,
                    marginTop: 10,
                  }}>
                  <Text style={{ color: themeTextSecondary, fontWeight: '700', fontSize: 12 }}>
                    Co zrobic teraz
                  </Text>
                  <Text style={{ color: themeTextPrimary, marginTop: 6 }}>
                    {selectedMeasurementTileDetails.action}
                  </Text>
                </View>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 12,
                    padding: 12,
                    backgroundColor: themeCardBg,
                    marginTop: 10,
                  }}>
                  <Text style={{ color: themeTextSecondary, fontWeight: '700', fontSize: 12 }}>
                    Mozliwe skutki bez korekty
                  </Text>
                  <Text style={{ color: themeTextPrimary, marginTop: 6 }}>
                    {selectedMeasurementTileDetails.impact}
                  </Text>

                  {selectedMeasurementTileDetails.relatedRiskNotes?.length > 0 ? (
                    <View style={{ marginTop: 8 }}>
                      {selectedMeasurementTileDetails.relatedRiskNotes.map((item, index) => (
                        <Text
                          key={`tile-risk-note-${index}`}
                          style={{ color: themeTextSecondary, marginTop: index === 0 ? 0 : 4 }}>
                          - {item}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              </ScrollView>
            </BottomSheetModal>
          ) : null}

          {(isReviewSection || isHistorySection) && isAddMeasurementModalVisible && (
            <BottomSheetModal
              visible
              onClose={handleCloseAddMeasurementModal}
              title={editingMeasurementId ? 'Edytuj wpis pomiaru' : t('addMeasurement')}
              themeCardBg={themeCardBg}
              themeBorder={themeBorder}
              themeTextPrimary={themeTextPrimary}
              themeCardBgAlt={themeCardBgAlt}
              themeOverlay={themeOverlay}
              themeDragHandle={themeDragHandle}
              isLightTheme={isLightTheme}
              maxWidth={640}
              heightPercent={78}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
              <ScrollView
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                onScrollBeginDrag={Keyboard.dismiss}
                contentContainerStyle={{
                  paddingHorizontal: 14,
                  paddingTop: 14,
                  paddingBottom: Math.max(insets.bottom + 20, 20),
                }}>
                <View style={{ width: '100%', alignSelf: 'center', maxWidth: 580 }}>
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: themeBorder,
                      borderRadius: 14,
                      padding: 14,
                      backgroundColor: themeCardBg,
                    }}>
                    <Text style={{ color: themeTextSecondary, marginBottom: 8 }}>
                      {selectedTank
                        ? t('tankLabel', { value: selectedTank.name })
                        : t('noActiveTank')}
                    </Text>

                    <Text
                      style={{
                        color: themeTextSecondary,
                        marginBottom: 12,
                        fontSize: 12,
                      }}>
                      Widoczne pola z ustawien (zalecane):{' '}
                      {visibleMeasurementOptionLabels.join(', ') || t('noData')}
                    </Text>
                    <Text
                      style={{
                        color: themeTextSecondary,
                        marginBottom: 12,
                        fontSize: 12,
                      }}>
                      Pola sa opcjonalne. Uzupelnij tylko te parametry, ktore masz pod reka.
                    </Text>

                    {measurementInputRows.length === 0 ? (
                      <Text
                        style={{
                          color: themeWarningText,
                          marginBottom: 10,
                          fontSize: 12,
                        }}>
                        W ustawieniach wybierz pola, ktore chcesz widziec w formularzu pomiarow.
                      </Text>
                    ) : null}

                    {measurementInputRows.map((field) => (
                      <View
                        key={`measurement-row-${field.key}`}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginBottom: 10,
                          gap: 10,
                        }}>
                        <View style={{ width: 74 }}>
                          <Text
                            style={{
                              color: themeTextSecondary,
                              fontWeight: '700',
                              fontSize: 13,
                            }}>
                            {field.label}
                          </Text>
                          {field.isRecommended ? (
                            <View
                              style={{
                                alignSelf: 'flex-start',
                                marginTop: 4,
                                borderRadius: 999,
                                paddingVertical: 3,
                                paddingHorizontal: 8,
                                backgroundColor: themeAccentSoftBg,
                              }}>
                              <Text
                                style={{
                                  color: themeAccentText,
                                  fontSize: 10,
                                  fontWeight: '700',
                                }}>
                                Zalecane
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <TextInput
                          placeholder={field.label}
                          placeholderTextColor={themePlaceholder}
                          value={field.value}
                          onChangeText={field.onChangeText}
                          editable={Boolean(selectedTank)}
                          keyboardType="numeric"
                          style={{
                            flex: 1,
                            borderWidth: 1,
                            borderColor: themeInputBorder,
                            color: themeInputText,
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: 10,
                            backgroundColor: themeInputBg,
                          }}
                        />
                      </View>
                    ))}
                    {enabledTests.ph && enabledTests.kh && (
                      <View
                        style={{
                          marginBottom: 10,
                          padding: 10,
                          borderWidth: 1,
                          borderColor: themeBorder,
                          borderRadius: 10,
                          backgroundColor: themeCardBgAlt,
                        }}>
                        <Text style={{ color: themeTextSecondary, fontSize: 12 }}>
                          CO2 (auto z pH + KH)
                        </Text>
                        <Text style={{ color: themeTextPrimary, marginTop: 2, fontWeight: '700' }}>
                          {measurementDraftCo2 === null ? '-' : `${measurementDraftCo2} mg/l`}
                        </Text>
                      </View>
                    )}

                    <View style={{ marginTop: 2 }}>
                      <Text
                        style={{
                          color: themeTextSecondary,
                          fontWeight: '700',
                          fontSize: 13,
                          marginBottom: 6,
                        }}>
                        {t('note')}
                      </Text>
                      <TextInput
                        placeholder={t('measurementNotePlaceholder')}
                        placeholderTextColor={themePlaceholder}
                        value={measurementNote}
                        onChangeText={setMeasurementNote}
                        editable={Boolean(selectedTank)}
                        multiline
                        style={{
                          borderWidth: 1,
                          borderColor: themeInputBorder,
                          color: themeInputText,
                          padding: 12,
                          minHeight: 90,
                          textAlignVertical: 'top',
                          borderRadius: 10,
                          marginBottom: 14,
                          backgroundColor: isLightTheme ? '#ffffff' : '#0f0f0f',
                        }}
                      />
                    </View>

                    <Pressable
                      onPress={handleSaveMeasurement}
                      disabled={saveBusy || historyLoading || !selectedTank}
                      style={{
                        backgroundColor: selectedTank ? themeSuccessBg : '#555',
                        padding: 14,
                        borderRadius: 10,
                        opacity:
                          saveBusy || historyLoading || !selectedTank ? 0.7 : 1,
                      }}>
                      <Text
                        style={{
                          color: 'white',
                          textAlign: 'center',
                          fontWeight: '700',
                        }}>
                        {saveBusy
                          ? t('saving')
                          : selectedTank
                            ? editingMeasurementId
                              ? t('saveChanges')
                              : t('save')
                            : t('chooseTank')}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={handleCloseAddMeasurementModal}
                      style={{
                        borderWidth: 1,
                        borderColor: themeBorder,
                        padding: 12,
                        borderRadius: 10,
                        marginTop: 10,
                        backgroundColor: themeCardBgAlt,
                      }}>
                      <Text style={{ color: themeTextPrimary, textAlign: 'center' }}>
                        {t('cancel')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            </BottomSheetModal>
          )}

          {isReviewSection &&
            selectedTank &&
            tankOnboardingPlan.isActive && (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: themeBorder,
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 18,
                  backgroundColor: themeCardBg,
                }}>
                {renderReviewSectionTitle(
                  'Onboarding akwarium',
                  onboardingSectionSeverity
                )}
                <Text style={{ color: themeTextSecondary, marginTop: 6 }}>
                  {tankOnboardingPlan.statusText}
                </Text>
                {!hasTaskChecklistAccess ? (
                  <Text style={{ color: themeTextSecondary, marginTop: 8, fontSize: 12 }}>
                    {t('subscriptionTasksPlanLocked')}
                  </Text>
                ) : (
                  <>
                    <Text style={{ color: themeTextSecondary, marginTop: 4, fontSize: 12 }}>
                      Dzien {tankOnboardingPlan.dayNumber} / cel: dzien{' '}
                      {tankOnboardingPlan.targetEndDay}
                    </Text>
                    <Text style={{ color: themeTextSecondary, marginTop: 4, fontSize: 12 }}>
                      Zadanie oznacza sie jako zrobione dopiero po zaznaczeniu checkboxa.
                    </Text>

                    <View style={{ marginTop: 10 }}>
                      {visibleOnboardingRows.length === 0 ? (
                        <Text style={{ color: themeTextSecondary, fontSize: 12 }}>
                          Na dzisiaj nie ma zadan. Wroc jutro po kolejne kroki.
                        </Text>
                      ) : (
                        visibleOnboardingRows.map((row) => {
                        const isChecked = Boolean(selectedTankOnboardingTaskChecks[row.id]);
                        const isOverdue = row.status === 'overdue' && !isChecked;
                        const rowTimeLabel =
                          row.status === 'current'
                            ? 'teraz'
                            : row.status === 'overdue'
                              ? 'po terminie'
                              : 'nastepne';

                        return (
                          <View
                            key={`onboarding-row-top-${row.id}`}
                            style={{
                              borderWidth: 1,
                              borderColor: isChecked
                                ? isLightTheme
                                  ? '#86cf9d'
                                  : '#2f9e44'
                                : isOverdue
                                  ? isLightTheme
                                    ? '#e57373'
                                    : '#b02a37'
                                : row.level === 'warning'
                                  ? isLightTheme
                                    ? '#e8cb85'
                                    : '#8a6a16'
                                  : row.status === 'current'
                                    ? isLightTheme
                                      ? '#c9d9ef'
                                      : '#335'
                                    : themeBorder,
                              backgroundColor: isChecked
                                ? isLightTheme
                                  ? '#eefaf0'
                                  : '#102515'
                                : isOverdue
                                  ? isLightTheme
                                    ? '#fff1f1'
                                    : '#3a1518'
                                : row.level === 'warning'
                                  ? isLightTheme
                                    ? '#fff9ec'
                                    : '#2b2615'
                                  : row.status === 'current'
                                    ? isLightTheme
                                      ? '#eef5ff'
                                      : '#0f1e31'
                                    : themeCardBgAlt,
                              borderRadius: 8,
                              padding: 8,
                              marginTop: 8,
                            }}>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'flex-start',
                                gap: 8,
                              }}>
                              <Pressable
                                onPress={(event) => {
                                  event?.stopPropagation?.();
                                  handleToggleOnboardingTaskCheck(row.id, !isChecked);
                                }}
                                disabled={onboardingTaskBusy}
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: isChecked
                                    ? isLightTheme
                                      ? '#1f7a3a'
                                      : '#9be7a3'
                                    : themeBorderStrong,
                                  backgroundColor: isChecked
                                    ? isLightTheme
                                      ? '#e1f5e8'
                                      : '#1a3521'
                                    : themeCardBg,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  marginTop: 1,
                                  opacity: onboardingTaskBusy ? 0.7 : 1,
                                }}>
                                <Text
                                  style={{
                                    color: isChecked
                                      ? isLightTheme
                                        ? '#1f7a3a'
                                        : '#9be7a3'
                                      : 'transparent',
                                    fontWeight: '700',
                                    fontSize: 13,
                                  }}>
                                  {isChecked ? 'X' : ''}
                                </Text>
                              </Pressable>

                              <View style={{ flex: 1 }}>
                                <Text
                                  style={{
                                    color: themeTextPrimary,
                                    fontWeight: '700',
                                    fontSize: 12,
                                  }}>
                                  Dzien {row.dayStart}
                                  {row.dayEnd > row.dayStart ? `-${row.dayEnd}` : ''} |{' '}
                                  {formatDateOnly(row.dueAtMs)} |{' '}
                                  {isChecked ? 'zrobione' : rowTimeLabel}
                                </Text>
                                <Text style={{ color: themeTextSecondary, marginTop: 3 }}>
                                  {row.text}
                                </Text>
                              </View>
                            </View>
                          </View>
                        );
                      })
                      )}
                    </View>

                    {completedOnboardingRows.length > 0 && (
                      <View style={{ marginTop: 10 }}>
                        <Pressable
                          onPress={() =>
                            setIsCompletedOnboardingVisible((prev) => !prev)
                          }
                          style={{
                            borderWidth: 1,
                            borderColor: themeBorder,
                            borderRadius: 8,
                            paddingVertical: 8,
                            paddingHorizontal: 10,
                            backgroundColor: themeCardBgAlt,
                          }}>
                          <Text
                            style={{
                              color: themeTextPrimary,
                              fontSize: 12,
                              fontWeight: '700',
                            }}>
                            {isCompletedOnboardingVisible
                              ? `Ukryj zrobione (${completedOnboardingRows.length})`
                              : `Pokaz zrobione (${completedOnboardingRows.length})`}
                          </Text>
                        </Pressable>

                        {isCompletedOnboardingVisible &&
                          completedOnboardingRows.map((row) => (
                            <View
                              key={`onboarding-row-completed-${row.id}`}
                              style={{
                                borderWidth: 1,
                                borderColor: isLightTheme ? '#86cf9d' : '#2f9e44',
                                backgroundColor: isLightTheme ? '#eefaf0' : '#102515',
                                borderRadius: 8,
                                padding: 8,
                                marginTop: 8,
                              }}>
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'flex-start',
                                  gap: 8,
                                }}>
                                <Pressable
                                  onPress={(event) => {
                                    event?.stopPropagation?.();
                                    handleToggleOnboardingTaskCheck(row.id, false);
                                  }}
                                  disabled={onboardingTaskBusy}
                                  style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: 6,
                                    borderWidth: 1,
                                    borderColor: isLightTheme ? '#1f7a3a' : '#9be7a3',
                                    backgroundColor: isLightTheme ? '#e1f5e8' : '#1a3521',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginTop: 1,
                                    opacity: onboardingTaskBusy ? 0.7 : 1,
                                  }}>
                                  <Text
                                    style={{
                                      color: isLightTheme ? '#1f7a3a' : '#9be7a3',
                                      fontWeight: '700',
                                      fontSize: 13,
                                    }}>
                                  X
                                  </Text>
                                </Pressable>

                                <View style={{ flex: 1 }}>
                                  <Text
                                    style={{
                                      color: themeTextPrimary,
                                      fontWeight: '700',
                                      fontSize: 12,
                                    }}>
                                    Dzien {row.dayStart}
                                    {row.dayEnd > row.dayStart ? `-${row.dayEnd}` : ''} |{' '}
                                    {formatDateOnly(row.dueAtMs)} | zrobione
                                  </Text>
                                  <Text style={{ color: themeTextSecondary, marginTop: 3 }}>
                                    {row.text}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          ))}
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

          {isReviewSection && (
            <View
              style={{
                borderWidth: 1,
                borderColor: themeBorder,
                borderRadius: 10,
                padding: 12,
                marginBottom: 18,
                backgroundColor: themeCardBg,
              }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}>
              <Pressable
                onPress={() => setIsCurrentParametersExpanded((prev) => !prev)}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 2,
                }}>
                {renderReviewSectionTitle(
                  t('currentParameters'),
                  currentParametersSectionSeverity
                )}
                <Text
                  style={{
                    color: themeTextSecondary,
                    marginLeft: 8,
                    fontSize: 14,
                    fontWeight: '700',
                  }}>
                  {isCurrentParametersExpanded ? 'v' : '>'}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleOpenAddMeasurementModal}
                disabled={!selectedTank}
                style={{
                  width: 30,
                  height: 30,
                  borderWidth: 1,
                  borderColor: '#666',
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selectedTank
                    ? (isLightTheme ? '#e5eef9' : '#111')
                    : (isLightTheme ? '#eef1f4' : '#0b0b0b'),
                  opacity: selectedTank ? 1 : 0.5,
                }}>
                <Text style={{ color: themeTextPrimary, fontSize: 18, fontWeight: '700' }}>
                  +
                </Text>
              </Pressable>
            </View>
            {!isCurrentParametersExpanded ? null : (
              <>
                <Text style={{ color: themeTextSecondary, fontSize: 12, marginBottom: 8 }}>
                  {historyLimitUsageText}
                </Text>

                {!selectedTank ? (
                  <Text style={{ color: themeTextSecondary }}>
                    {t('selectTankToSeeCurrent')}
                  </Text>
                ) : isHistoryDisplayLimited ? (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: themeBorder,
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 10,
                      backgroundColor: themeCardBgAlt,
                    }}>
                    <Text
                      style={{
                        color: themeTextPrimary,
                        fontSize: 12,
                        fontWeight: '700',
                      }}>
                      {t('subscriptionHistoryDisplayLimited', {
                        plan: currentSubscriptionTierLabel,
                        current: currentHistoryEntryCount,
                        limit: historyEntryLimit,
                      })}
                    </Text>
                    <Text style={{ color: themeTextSecondary, marginTop: 4, fontSize: 12 }}>
                      {t('subscriptionHistoryUpgradeHint')}
                    </Text>
                  </View>
                ) : historyLoading ? (
                  <Text style={{ color: themeTextSecondary }}>{t('loading')}</Text>
                ) : !currentMeasurement ? (
                  <Text style={{ color: themeTextSecondary }}>
                    {t('noMeasurementsForActiveTank')}
                  </Text>
                ) : (
                  <View>
                <Text
                  style={{
                    color: isLightTheme ? '#49617b' : '#9da3af',
                    marginBottom: 10,
                    alignSelf: 'flex-start',
                    borderWidth: 1,
                    borderColor: isLightTheme ? '#d7e3f1' : '#2a3342',
                    borderRadius: 999,
                    paddingVertical: 4,
                    paddingHorizontal: 10,
                    backgroundColor: isLightTheme ? '#f0f6fd' : '#121a26',
                    fontSize: 12,
                  }}>
                  {formatCreatedAt(currentMeasurement.createdAt)}
                </Text>

                {currentMeasurementDetailRows.length > 0 ? (
                  <View
                    style={{
                      marginTop: 2,
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      marginHorizontal: -4,
                    }}>
                    {currentMeasurementDetailRows.map((item) => {
                      const itemSeverity =
                        currentMeasurementIssueSeverityByKey.get(
                          String(item.key ?? '')
                        ) ?? 'ok';
                      const isCritical = itemSeverity === 'critical';
                      const isWarning = itemSeverity === 'warning';
                      const tileBorderColor = isCritical
                        ? '#dc2626'
                        : isWarning
                          ? '#d97706'
                          : themeBorder;
                      const tileBackgroundColor = isCritical
                        ? isLightTheme
                          ? '#ffe2e2'
                          : '#2f1717'
                        : isWarning
                          ? isLightTheme
                            ? '#ffe8bf'
                            : '#33230f'
                          : isLightTheme
                            ? '#f7fafc'
                            : themeCardBgAlt;
                      const valueColor = isCritical
                        ? isLightTheme
                          ? '#991b1b'
                          : '#fecaca'
                        : isWarning
                          ? isLightTheme
                            ? '#92400e'
                            : '#fde68a'
                          : themeTextPrimary;
                      const labelColor =
                        isCritical || isWarning
                          ? valueColor
                          : themeTextSecondary;

                      return (
                        <View
                          key={`current-measurement-${item.label}`}
                          style={{
                            width: '33.3333%',
                            paddingHorizontal: 4,
                            marginBottom: 8,
                          }}>
                          <Pressable
                            onPress={() => handleOpenMeasurementTileDetails(item)}
                            style={{
                              borderWidth: 1,
                              borderColor: tileBorderColor,
                              borderRadius: 10,
                              paddingVertical: 10,
                              paddingHorizontal: 10,
                              backgroundColor: tileBackgroundColor,
                              minHeight: 74,
                              justifyContent: 'space-between',
                              opacity: 1,
                            }}>
                            <Text
                              style={{
                                color: labelColor,
                                fontSize: 11,
                                fontWeight: '700',
                                letterSpacing: 0.3,
                              }}>
                              {item.label}
                            </Text>
                            <Text
                              style={{
                                color: valueColor,
                                fontSize: 18,
                                fontWeight: '700',
                                marginTop: 4,
                              }}>
                              {formatLatestTrendValue(item.value)}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
                  </View>
                )}
              </>
            )}
            </View>
          )}

          {isReviewSection && selectedTank && (
            <View
              style={{
                borderWidth: 1,
                borderColor: themeBorder,
                borderRadius: 10,
                padding: 12,
                marginBottom: 18,
                backgroundColor: themeCardBg,
              }}>
              <Pressable
                onPress={() => setIsSuggestionsExpanded((prev) => !prev)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                {renderReviewSectionTitle('Co wymaga uwagi', suggestionsSectionSeverity)}
                <Text style={{ color: themeActionText, fontWeight: '700' }}>
                  {isSuggestionsExpanded ? t('hide') : t('show')}
                </Text>
              </Pressable>

              {!isSuggestionsExpanded ? null : (
              <View style={{ marginTop: 8 }}>
                {!hasGeneralRecommendationAccess ? (
                  <Text style={{ color: themeTextSecondary, fontSize: 12 }}>
                    {t('subscriptionRecommendationsLocked')}
                  </Text>
                ) : suggestionChangeItems.length === 0 ? (
                  <Text
                    style={{
                      color: isLightTheme ? '#1f7a3a' : '#9be7a3',
                      fontSize: 12,
                      fontWeight: '700',
                    }}>
                    {t('suggestionsAllGood')}
                  </Text>
                ) : (
                  suggestionChangeItems.map((item, index) => (
                    <Text
                      key={`suggestion-change-${item.id ?? index}`}
                      style={{
                        color:
                          item.severity === 'critical'
                            ? themeDangerText
                            : themeWarningText,
                        fontSize: 13,
                        lineHeight: 19,
                        fontWeight: item.severity === 'critical' ? '700' : '600',
                        marginTop: index === 0 ? 0 : 6,
                      }}>
                      - {item.text}
                    </Text>
                  ))
                )}
              </View>
              )}
            </View>
          )}

          {isReviewSection && selectedTank && (
            <View
              style={{
                borderWidth: 1,
                borderColor: themeBorder,
                borderRadius: 10,
                padding: 12,
                marginBottom: 18,
                backgroundColor: themeCardBg,
              }}>
              <Pressable
                onPress={() => setIsGuidedPlanExpanded((prev) => !prev)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                {renderReviewSectionTitle(
                  t('guidedRecommendationPlanTitle'),
                  guidedPlanSectionSeverity
                )}
                <Text style={{ color: themeActionText, fontWeight: '700' }}>
                  {isGuidedPlanExpanded ? t('hide') : t('show')}
                </Text>
              </Pressable>

              {!isGuidedPlanExpanded ? null : (
                <View style={{ marginTop: 8 }}>
                  {!hasGeneralRecommendationAccess ? (
                    <Text style={{ color: themeTextSecondary, fontSize: 12 }}>
                      {t('subscriptionRecommendationsLocked')}
                    </Text>
                  ) : !hasGuidedRecommendationAccess ? (
                    <Text style={{ color: themeTextSecondary, fontSize: 12 }}>
                      {t('subscriptionRecommendationsGuidedLocked')}
                    </Text>
                  ) : guidedRecommendationSteps.length === 0 ? (
                    <Text
                      style={{
                        color: isLightTheme ? '#1f7a3a' : '#9be7a3',
                        fontSize: 12,
                        fontWeight: '700',
                      }}>
                      Brak planu krok po kroku na ten moment.
                    </Text>
                  ) : (
                    guidedRecommendationSteps.map((step, index) => (
                      <View
                        key={`guided-recommendation-step-${step.id ?? index}`}
                        style={{ marginTop: index === 0 ? 0 : 8 }}>
                        <Pressable
                          onPress={() =>
                            setExpandedGuidedStepIds((prev) => ({
                              ...prev,
                              [step.id]: !prev[step.id],
                            }))
                          }
                          style={{
                            borderWidth: 1,
                            borderColor:
                              step.severity === 'critical'
                                ? (isLightTheme ? '#f1b0b0' : '#7a1e1e')
                                : step.severity === 'warning'
                                  ? (isLightTheme ? '#f0d79f' : '#7c5e11')
                                  : themeBorder,
                            borderRadius: 10,
                            padding: 10,
                            backgroundColor:
                              step.severity === 'critical'
                                ? (isLightTheme ? '#fff1f1' : '#2a1212')
                                : step.severity === 'warning'
                                  ? (isLightTheme ? '#fff8ea' : '#2d220f')
                                  : themeCardBgAlt,
                          }}>
                          <Text
                            style={{
                              color:
                                step.severity === 'critical'
                                  ? themeDangerText
                                  : step.severity === 'warning'
                                    ? themeWarningText
                                    : themeTextSecondary,
                              fontSize: 11,
                              fontWeight: '700',
                            }}>
                            {step.priorityLabel} - {step.area}
                          </Text>
                          <Text
                            style={{
                              color: themeTextPrimary,
                              fontSize: 13,
                              lineHeight: 19,
                              marginTop: 4,
                            }}>
                            {index + 1}. {step.text}
                          </Text>
                          <Text
                            style={{
                              color: themeActionText,
                              fontSize: 12,
                              marginTop: 6,
                              fontWeight: '700',
                            }}>
                            {expandedGuidedStepIds[step.id] ? t('hide') : t('tapForDetails')}
                          </Text>
                        </Pressable>

                        {!expandedGuidedStepIds[step.id] ||
                        !Array.isArray(step.details) ||
                        step.details.length === 0 ? null : (
                          <View
                            style={{
                              borderWidth: 1,
                              borderColor: themeBorder,
                              borderRadius: 8,
                              paddingVertical: 8,
                              paddingHorizontal: 10,
                              marginTop: 6,
                              backgroundColor: themeCardBgAlt,
                            }}>
                            {step.details.map((detail, detailIndex) => (
                              <Text
                                key={`guided-step-detail-${step.id}-${detailIndex}`}
                                style={{
                                  color: themeTextSecondary,
                                  fontSize: 12,
                                  lineHeight: 17,
                                  marginTop: detailIndex === 0 ? 0 : 4,
                                }}>
                                - {detail}
                              </Text>
                            ))}
                          </View>
                        )}
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          )}

          {isReviewSection && selectedTank && (
            <View
              style={{
                borderWidth: 1,
                borderColor: waterTestingSchedule.isOverdue
                  ? isLightTheme
                    ? '#e8a08c'
                    : '#d9480f'
                  : themeBorder,
                borderRadius: 10,
                padding: 12,
                marginBottom: 18,
                backgroundColor: waterTestingSchedule.isOverdue
                  ? isLightTheme
                    ? '#fff4f0'
                    : '#2b1410'
                  : themeCardBg,
              }}>
              <Pressable
                onPress={() => setIsWaterTestingExpanded((prev) => !prev)}
                disabled={!hasTaskReminderAccess}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  opacity: hasTaskReminderAccess ? 1 : 0.75,
                }}>
                <Text
                  style={{
                    color: themeTextPrimary,
                    fontWeight: '700',
                    fontSize: 16,
                  }}>
                  {t('waterTestingSchedule')}
                </Text>
                <Text style={{ color: themeActionText, fontWeight: '700' }}>
                  {hasTaskReminderAccess
                    ? isWaterTestingExpanded
                      ? t('hide')
                      : t('show')
                    : t('settingsSubscriptionTierPremium')}
                </Text>
              </Pressable>

              {!hasTaskReminderAccess ? (
                <Text style={{ color: themeTextSecondary, marginTop: 8, fontSize: 12 }}>
                  {t('subscriptionTasksLocked')}
                </Text>
              ) : !isWaterTestingExpanded ? null : (
                <View style={{ marginTop: 8 }}>
                  <Text
                    style={{
                      color: waterTestingSchedule.isOverdue
                        ? isLightTheme
                          ? '#b45309'
                          : '#ffdd99'
                        : isLightTheme
                          ? '#1f7a3a'
                          : '#d7f5dd',
                      fontWeight: '700',
                    }}>
                    {t('nextTestWithDate', {
                      date: formatDateOnly(waterTestingSchedule.nextTestAtMs),
                    })}
                  </Text>
                  <Text style={{ color: themeTextSecondary, marginTop: 6, fontSize: 12 }}>
                    {waterTestingSchedule.reason}
                  </Text>
                  {hasTaskChecklistAccess ? (
                    <Text style={{ color: themeTextSecondary, marginTop: 6, fontSize: 12 }}>
                      {t('subscriptionTasksChecklists')}
                    </Text>
                  ) : (
                    <Text style={{ color: themeTextSecondary, marginTop: 6, fontSize: 12 }}>
                      {t('subscriptionTasksReminders')}
                    </Text>
                  )}

                  <View style={{ marginTop: 10 }}>
                    {(waterTestingSchedule.parameters ?? []).map((plan, index) => (
                      <View
                        key={`water-plan-${plan.key}`}
                        style={{
                          borderWidth: 1,
                          borderColor:
                            plan.level === 'problem'
                              ? isLightTheme
                                ? '#e8a08c'
                                : '#7a1e1e'
                              : plan.level === 'warning'
                                ? isLightTheme
                                  ? '#e8cb85'
                                  : '#8a6a16'
                                : isLightTheme
                                  ? '#a7d6b2'
                                  : '#2f9e44',
                          backgroundColor:
                            plan.level === 'problem'
                              ? isLightTheme
                                ? '#fff4f0'
                                : '#2a1212'
                              : plan.level === 'warning'
                                ? isLightTheme
                                  ? '#fff9ec'
                                  : '#2b2615'
                                : isLightTheme
                                  ? '#eefaf0'
                                  : '#102515',
                          borderRadius: 8,
                          padding: 8,
                          paddingTop: 8,
                          marginTop: index === 0 ? 0 : 8,
                        }}>
                        <Text
                          style={{
                            color:
                              plan.level === 'problem'
                                ? isLightTheme
                                  ? '#b45309'
                                  : '#ffb3b3'
                                : plan.level === 'warning'
                                  ? isLightTheme
                                    ? '#8a5a12'
                                    : '#ffdd99'
                                  : isLightTheme
                                    ? '#1f7a3a'
                                    : '#9be7a3',
                            fontWeight: '700',
                          }}>
                          {plan.label}
                        </Text>
                        <Text style={{ color: themeTextSecondary, fontSize: 12, marginTop: 2 }}>
                          {t('nextTestWithDate', {
                            date: formatDateOnly(plan.nextTestAtMs),
                          })}
                        </Text>
                        <Text style={{ color: themeTextSecondary, fontSize: 12, marginTop: 2 }}>
                          {plan.reason}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {waterTestingSchedule.requiresPostWaterChangeTest && (
                    <Text
                      style={{
                        color: isLightTheme ? '#9a3412' : '#ffdd99',
                        marginTop: 10,
                        fontSize: 12,
                      }}>
                      {t('extraTestAfterWaterChange')}
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}

          {isTankSection && (
            <>
              <Text
                style={{
                  color: themeTextPrimary,
                  fontSize: 22,
                  marginBottom: 10,
                }}>
                {t('addMeasurement')}
              </Text>

              {!selectedTank && (
                <Text
                  style={{
                    color: themeWarningText,
                    marginBottom: 12,
                  }}>
                  {t('addMeasurementNeedTankHint')}
                </Text>
              )}

              <Text style={{ color: themeTextSecondary, marginBottom: 8, fontSize: 12 }}>
                Widoczne pola z ustawien (zalecane):{' '}
                {visibleMeasurementOptionLabels.join(', ') || t('noData')}
              </Text>
              <Text style={{ color: themeTextSecondary, marginBottom: 10, fontSize: 12 }}>
                Pola pozostaja opcjonalne. Wpisz tylko te wartosci, ktore chcesz teraz zapisac.
              </Text>
              <Text style={{ color: themeTextSecondary, marginBottom: 10, fontSize: 12 }}>
                {historyLimitUsageText}
              </Text>
              {isHistoryDisplayLimited ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: themeBorder,
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 10,
                    backgroundColor: themeCardBgAlt,
                  }}>
                  <Text
                    style={{
                      color: themeTextPrimary,
                      fontSize: 12,
                      fontWeight: '700',
                    }}>
                    {t('subscriptionHistoryDisplayLimited', {
                      plan: currentSubscriptionTierLabel,
                      current: currentHistoryEntryCount,
                      limit: historyEntryLimit,
                    })}
                  </Text>
                  <Text style={{ color: themeTextSecondary, marginTop: 4, fontSize: 12 }}>
                    {t('subscriptionHistoryUpgradeHint')}
                  </Text>
                </View>
              ) : null}

              {measurementInputRows.length === 0 ? (
                <Text style={{ color: themeWarningText, marginBottom: 10, fontSize: 12 }}>
                  W ustawieniach wybierz pola, ktore chcesz widziec w formularzu pomiarow.
                </Text>
              ) : (
                measurementInputRows.map((field) => (
                  <View
                    key={`tank-measurement-row-${field.key}`}
                    style={{
                      marginBottom: 10,
                    }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 6,
                      }}>
                      <Text
                        style={{
                          color: themeTextPrimary,
                          fontWeight: '700',
                        }}>
                        {field.label}
                      </Text>
                      {field.isRecommended ? (
                        <View
                          style={{
                            borderRadius: 999,
                            paddingVertical: 3,
                            paddingHorizontal: 8,
                            backgroundColor: themeAccentSoftBg,
                          }}>
                          <Text
                            style={{
                              color: themeAccentText,
                              fontSize: 10,
                              fontWeight: '700',
                            }}>
                            Zalecane
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <TextInput
                      placeholder={field.label}
                      placeholderTextColor={themePlaceholder}
                      value={field.value}
                      onChangeText={field.onChangeText}
                      editable={Boolean(selectedTank)}
                      keyboardType="numeric"
                      style={{
                        borderWidth: 1,
                        borderColor: themeInputBorder,
                        backgroundColor: themeInputBg,
                        color: themeInputText,
                        padding: 10,
                        borderRadius: 10,
                      }}
                    />
                  </View>
                ))
              )}

              {enabledTests.ph && enabledTests.kh && (
                <Text
                  style={{
                    color: themeTextSecondary,
                    marginBottom: 10,
                    fontSize: 12,
                  }}>
                  CO2 (auto z pH + KH):{' '}
                  {measurementDraftCo2 === null ? '-' : `${measurementDraftCo2} mg/l`}
                </Text>
              )}

              <TextInput
                placeholder={t('measurementNotePlaceholder')}
                placeholderTextColor={themePlaceholder}
                value={measurementNote}
                onChangeText={setMeasurementNote}
                editable={Boolean(selectedTank)}
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: themeInputBorder,
                  backgroundColor: themeInputBg,
                  color: themeInputText,
                  padding: 10,
                  minHeight: 70,
                  textAlignVertical: 'top',
                  marginBottom: 14,
                }}
              />

              <Pressable
                onPress={handleSaveMeasurement}
                disabled={saveBusy || historyLoading || !selectedTank}
                style={{
                  backgroundColor: selectedTank ? themeSuccessBg : themeBorderStrong,
                  padding: 14,
                  borderRadius: 8,
                  opacity:
                    saveBusy || historyLoading || !selectedTank ? 0.7 : 1,
                }}>
                <Text
                  style={{
                    color: themeAccentOnStrong,
                    textAlign: 'center',
                    fontWeight: '700',
                  }}>
                  {saveBusy
                    ? t('saving')
                    : selectedTank
                      ? t('save')
                      : t('chooseTank')}
                </Text>
              </Pressable>
            </>
          )}

          {isHistorySection && (
            <View
                style={{
                  marginTop: 18,
                  borderTopWidth: 1,
                  borderTopColor: themeBorder,
                  paddingTop: 16,
                }}>
              {!selectedTank ? (
                  <Text style={{ color: themeTextSecondary }}>
                    {t('selectTankForHistory')}
                  </Text>
              ) : (
                <>
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: 8,
                      marginBottom: 12,
                    }}>
                    <Pressable
                      onPress={() => setHistorySectionTab('parameters')}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor:
                          historySectionTab === 'parameters'
                            ? themeAccent
                            : themeBorder,
                        backgroundColor:
                          historySectionTab === 'parameters'
                            ? themeAccentSoftBg
                            : themeCardBg,
                        borderRadius: 999,
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        alignItems: 'center',
                      }}>
                      <Text
                        style={{
                          color:
                            historySectionTab === 'parameters'
                              ? themeAccentOnStrong
                              : themeTextPrimary,
                          fontWeight: '700',
                          fontSize: 12,
                        }}>
                        {t('historyTabParameters')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setHistorySectionTab('issues')}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor:
                          historySectionTab === 'issues'
                            ? themeAccent
                            : themeBorder,
                        backgroundColor:
                          historySectionTab === 'issues'
                            ? themeAccentSoftBg
                            : themeCardBg,
                        borderRadius: 999,
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        alignItems: 'center',
                      }}>
                      <Text
                        style={{
                          color:
                            historySectionTab === 'issues'
                              ? themeAccentOnStrong
                              : themeTextPrimary,
                          fontWeight: '700',
                          fontSize: 12,
                        }}>
                        {t('historyTabIssues')}
                      </Text>
                    </Pressable>
                  </View>

                  {historySectionTab === 'parameters' && (
                    <>
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: themeBorder,
                      borderRadius: 10,
                      padding: 12,
                        backgroundColor: themeCardBg,
                    }}>
                    <Text
                      style={{
                         color: themeTextPrimary,
                        fontWeight: '700',
                        fontSize: 16,
                      }}>
                      {t('parameterChart')}
                    </Text>
                    {!hasChartAccess ? (
                      <>
                        <Text
                          style={{ color: themeWarningText, marginTop: 8, fontSize: 12 }}>
                          {t('chartAccessLevelFree')}
                        </Text>
                        <Text style={{ color: themeTextSecondary, marginTop: 4, fontSize: 12 }}>
                          {t('subscriptionChartsLocked')}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text
                          style={{ color: themeTextSecondary, marginTop: 4, fontSize: 12 }}>
                          {hasAdvancedChartAccess
                            ? t('chartAccessLevelPro')
                            : t('chartAccessLevelPremium')}
                        </Text>
                        <Text
                          style={{ color: themeTextSecondary, marginTop: 4, fontSize: 12 }}>
                          {t('switchParameterHint')}
                        </Text>

                        <View
                          style={{
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            gap: 8,
                            marginTop: 10,
                          }}>
                          {enabledHistoryChartParameters.map((item) => {
                            const isActive = item.key === selectedHistoryChartParameter;

                            return (
                              <Pressable
                                key={`chart-parameter-${item.key}`}
                                onPress={() => setSelectedHistoryChartParameter(item.key)}
                                style={{
                                  borderWidth: 1,
                                  borderColor: isActive ? themeAccent : themeBorder,
                                  backgroundColor: isActive
                                    ? themeAccentSoftBg
                                    : themeCardBg,
                                  paddingVertical: 6,
                                  paddingHorizontal: 10,
                                  borderRadius: 999,
                                }}>
                                <Text
                                  style={{
                                    color: isActive
                                      ? themeAccentOnStrong
                                      : themeTextPrimary,
                                    fontWeight: isActive ? '700' : '500',
                                  }}>
                                  {item.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        {historyLoading ? (
                          <Text style={{ color: themeTextSecondary, marginTop: 12 }}>
                            {t('loading')}
                          </Text>
                        ) : historyChartSeries.length === 0 ? (
                          <Text style={{ color: themeTextSecondary, marginTop: 12 }}>
                            {t('noDataForParameter', {
                              value: selectedHistoryChartMeta.label,
                            })}
                          </Text>
                        ) : (
                          <View style={{ marginTop: 12 }}>
                            <View
                              style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 8,
                              }}>
                              <Text style={{ color: historyChartLatestColor, fontWeight: '700' }}>
                                {selectedHistoryChartMeta.label}: {formatLatestTrendValue(
                                  historyChartLatestValue,
                                  selectedHistoryChartMeta.unit
                                )}
                              </Text>
                              <Text style={{ color: themeTextSecondary, fontSize: 12 }}>
                                {t('range', {
                                  min: formatLatestTrendValue(rawHistoryChartMin),
                                  max: formatLatestTrendValue(rawHistoryChartMax),
                                  unit: selectedHistoryChartMeta.unit,
                                })}
                              </Text>
                            </View>

                            {hasAdvancedChartAccess ? (
                              <View
                                style={{
                                  flexDirection: 'row',
                                  flexWrap: 'wrap',
                                  gap: 8,
                                  marginBottom: 10,
                                }}>
                                <View
                                  style={{
                                    borderWidth: 1,
                                    borderColor: themeBorder,
                                    borderRadius: 8,
                                    paddingVertical: 8,
                                    paddingHorizontal: 10,
                                    backgroundColor: themeCardBgAlt,
                                  }}>
                                  <Text style={{ color: themeTextSecondary, fontSize: 11 }}>
                                    {t('chartMetricPoints')}
                                  </Text>
                                  <Text style={{ color: themeTextPrimary, fontWeight: '700', marginTop: 2 }}>
                                    {historyChartSeries.length}
                                  </Text>
                                </View>
                                <View
                                  style={{
                                    borderWidth: 1,
                                    borderColor: themeBorder,
                                    borderRadius: 8,
                                    paddingVertical: 8,
                                    paddingHorizontal: 10,
                                    backgroundColor: themeCardBgAlt,
                                  }}>
                                  <Text style={{ color: themeTextSecondary, fontSize: 11 }}>
                                    {t('chartMetricAverage')}
                                  </Text>
                                  <Text style={{ color: themeTextPrimary, fontWeight: '700', marginTop: 2 }}>
                                    {formatLatestTrendValue(
                                      historyChartAverageValue,
                                      selectedHistoryChartMeta.unit
                                    )}
                                  </Text>
                                </View>
                                <View
                                  style={{
                                    borderWidth: 1,
                                    borderColor: themeBorder,
                                    borderRadius: 8,
                                    paddingVertical: 8,
                                    paddingHorizontal: 10,
                                    backgroundColor: themeCardBgAlt,
                                  }}>
                                  <Text style={{ color: themeTextSecondary, fontSize: 11 }}>
                                    {t('chartMetricChange')}
                                  </Text>
                                  <Text style={{ color: themeTextPrimary, fontWeight: '700', marginTop: 2 }}>
                                    {historyChartDeltaValue === null
                                      ? '-'
                                      : `${historyChartDeltaValue > 0 ? '+' : ''}${formatLatestTrendValue(
                                          historyChartDeltaValue,
                                          selectedHistoryChartMeta.unit
                                        )}`}
                                  </Text>
                                </View>
                              </View>
                            ) : null}

                            <View
                              onLayout={(event) =>
                                setHistoryChartWidth(event.nativeEvent.layout.width)
                              }
                              style={{
                                height:
                                  historyChartTopPadding +
                                  historyChartAreaHeight +
                                  historyChartBottomPadding,
                                borderRadius: 10,
                                borderWidth: 1,
                                borderColor: themeBorder,
                                backgroundColor: themeChartBg,
                                overflow: 'hidden',
                                position: 'relative',
                              }}>
                              <View
                                style={{
                                  position: 'absolute',
                                  left: 0,
                                  right: 0,
                                  top: historyChartTopPadding,
                                  height: historyChartAreaHeight,
                                }}>
                                {[0, 1, 2, 3].map((step) => (
                                  <View
                                    key={`grid-${step}`}
                                    style={{
                                      position: 'absolute',
                                      left: 0,
                                      right: 0,
                                      top: (step / 3) * historyChartAreaHeight,
                                      borderTopWidth: 1,
                                      borderTopColor: themeChartGrid,
                                    }}
                                  />
                                ))}
                              </View>

                              {historyChartHasLine &&
                                historyChartSegments.map((segment) => (
                                  <View
                                    key={`segment-${segment.id}`}
                                    style={{
                                      position: 'absolute',
                                      left: segment.left,
                                      top: segment.top,
                                      width: segment.width,
                                      height: 2,
                                      backgroundColor: segment.color,
                                      borderRadius: 999,
                                      transform: [{ rotate: `${segment.angle}deg` }],
                                    }}
                                  />
                                ))}

                              {historyChartPoints.map((point) => (
                                <View
                                  key={`point-${point.id}`}
                                  style={{
                                    position: 'absolute',
                                    left: point.x - 4,
                                    top: point.y - 4,
                                    width: 8,
                                    height: 8,
                                    borderRadius: 999,
                                    backgroundColor: point.color,
                                    borderWidth: 1,
                                    borderColor: themeChartPointBorder,
                                  }}
                                />
                              ))}

                              <Text
                                style={{
                                  position: 'absolute',
                                  top: 4,
                                  left: 8,
                                  color: themeChartAxis,
                                  fontSize: 10,
                                }}>
                                max{' '}
                                {formatLatestTrendValue(
                                  historyChartDisplayMax,
                                  selectedHistoryChartMeta.unit
                                )}
                              </Text>
                              <Text
                                style={{
                                  position: 'absolute',
                                  top:
                                    historyChartTopPadding + historyChartAreaHeight - 12,
                                  left: 8,
                                  color: themeChartAxis,
                                  fontSize: 10,
                                }}>
                                min{' '}
                                {formatLatestTrendValue(
                                  historyChartDisplayMin,
                                  selectedHistoryChartMeta.unit
                                )}
                              </Text>
                            </View>

                            <View
                              style={{
                                marginTop: 6,
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                              }}>
                              <Text style={{ color: themeChartAxis, fontSize: 11 }}>
                                {formatDateOnly(historyChartFirstDateMs)}
                              </Text>
                              <Text style={{ color: themeChartAxis, fontSize: 11 }}>
                                {formatDateOnly(historyChartLastDateMs)}
                              </Text>
                            </View>
                          </View>
                        )}
                      </>
                    )}
                  </View>

                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: themeBorder,
                      borderRadius: 10,
                      padding: 12,
                      backgroundColor: themeCardBg,
                      marginTop: 12,
                    }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 10,
                      }}>
                      <Text
                        style={{
                          color: themeTextPrimary,
                          fontSize: 16,
                          fontWeight: '700',
                        }}>
                        {t('historyData')}
                      </Text>
                      <Pressable
                        onPress={handleOpenAddMeasurementModal}
                        disabled={!selectedTank}
                        style={{
                          borderWidth: 1,
                          borderColor: themeAccentText,
                          borderRadius: 8,
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          backgroundColor: themeAccentText,
                          opacity: selectedTank ? 1 : 0.6,
                        }}>
                        <Text
                          style={{
                            color: themeAccentOnStrong,
                            fontWeight: '700',
                            fontSize: 12,
                          }}>
                          {t('addMeasurement')}
                        </Text>
                      </Pressable>
                    </View>
                    <Text style={{ color: themeTextSecondary, marginBottom: 10, fontSize: 12 }}>
                      {historyLimitUsageText}
                    </Text>
                    {isHistoryDisplayLimited ? (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: themeBorder,
                          borderRadius: 8,
                          padding: 10,
                          marginBottom: 10,
                          backgroundColor: themeCardBgAlt,
                        }}>
                        <Text
                          style={{
                            color: themeTextPrimary,
                            fontSize: 12,
                            fontWeight: '700',
                          }}>
                          {t('subscriptionHistoryDisplayLimited', {
                            plan: currentSubscriptionTierLabel,
                            current: currentHistoryEntryCount,
                            limit: historyEntryLimit,
                          })}
                        </Text>
                        <Text style={{ color: themeTextSecondary, marginTop: 4, fontSize: 12 }}>
                          {t('subscriptionHistoryUpgradeHint')}
                        </Text>
                      </View>
                    ) : null}

                    {historyLoading ? (
                      <Text style={{ color: themeTextSecondary }}>{t('loading')}</Text>
                    ) : measurements.length === 0 ? (
                      <Text style={{ color: themeTextSecondary }}>
                        {t('noSavedMeasurements')}
                      </Text>
                    ) : (
                      visibleHistoryMeasurements.map((measurement) => {
                        const isSelected = selectedMeasurementId === measurement.id;
                        const baseAnalysis = analyzeMeasurementLogic(
                          measurement,
                          availableMeasurementTests
                        );
                        const contextInsights = buildContextualEcosystemInsights({
                          measurement,
                          enabledTests: availableMeasurementTests,
                          stockItems,
                          tank: selectedTank,
                          equipmentAssessment: currentEquipmentAssessmentForContext,
                        });
                        const analysis = mergeWaterAnalysisWithContext(
                          baseAnalysis,
                          contextInsights
                        );
                        const measurementDetailRows = buildMeasurementDetailRows(
                          measurement,
                          availableMeasurementTests
                        );
                        const measurementIssueSeverityByKey = new Map();
                        measurementDetailRows.forEach((row) => {
                          const rowKey = String(row?.key ?? '');
                          if (!rowKey) {
                            return;
                          }
                          const directSeverity = getMeasurementSeverityFromValue(
                            rowKey,
                            row?.value
                          );
                          measurementIssueSeverityByKey.set(rowKey, directSeverity);
                        });
                        const measurementRiskNotes = [
                          ...buildCurrentRiskNotesLogic(
                            measurement,
                            selectedTankEnvironmentProfile
                          ),
                          ...(contextInsights.riskNotes ?? []),
                        ].filter((item, index, list) => {
                          const key = String(item?.text ?? '')
                            .trim()
                            .toLowerCase();
                          if (!key) {
                            return false;
                          }
                          return (
                            list.findIndex(
                              (candidate) =>
                                String(candidate?.text ?? '')
                                  .trim()
                                  .toLowerCase() === key
                            ) === index
                          );
                        });
                        const trimmedMeasurementNote = measurement.note?.trim() ?? '';

                        return (
                          <Pressable
                            key={measurement.id}
                            onPress={() =>
                              setSelectedMeasurementId((prev) =>
                                prev === measurement.id ? null : measurement.id
                              )
                            }
                            style={{
                              borderWidth: 1,
                              borderColor: isSelected ? themeAccent : themeBorder,
                              borderRadius: 8,
                              padding: 12,
                              marginBottom: 8,
                              backgroundColor: themeCardBgAlt,
                            }}>
                            <Text style={{ color: themeTextPrimary, marginBottom: 4 }}>
                              {formatCreatedAt(measurement.createdAt)}
                            </Text>

                            <Text style={{ color: themeTextSecondary, fontSize: 12 }}>
                              {t('tapForDetails')}
                            </Text>

                            {hasParameterAnalysisAccess ? (
                              <Text
                                style={{
                                  color: SEVERITY_COLOR[analysis.status],
                                  marginTop: 6,
                                  fontWeight: '700',
                                }}>
                                {t('status', { value: SEVERITY_LABEL[analysis.status] })}
                              </Text>
                            ) : (
                              <Text
                                style={{
                                  color: themeTextSecondary,
                                  marginTop: 6,
                                  fontSize: 12,
                                }}>
                                {t('subscriptionParameterAnalysisLocked')}
                              </Text>
                            )}

                            {isSelected && (
                              <View style={{ marginTop: 10 }}>
                                {measurementDetailRows.length > 0 ? (
                                  <View
                                    style={{
                                      flexDirection: 'row',
                                      flexWrap: 'wrap',
                                      marginHorizontal: -4,
                                    }}>
                                    {measurementDetailRows.map((item) => {
                                      const rowKey = String(item.key ?? '');
                                      const itemSeverity =
                                        measurementIssueSeverityByKey.get(rowKey) ?? 'ok';
                                      const isCritical = itemSeverity === 'critical';
                                      const isWarning = itemSeverity === 'warning';
                                      const tileBorderColor = isCritical
                                        ? '#dc2626'
                                        : isWarning
                                          ? '#d97706'
                                          : themeBorder;
                                      const tileBackgroundColor = isCritical
                                        ? isLightTheme
                                          ? '#ffe2e2'
                                          : '#2f1717'
                                        : isWarning
                                          ? isLightTheme
                                            ? '#ffe8bf'
                                            : '#33230f'
                                          : isLightTheme
                                            ? '#f7fafc'
                                            : themeCardBgAlt;
                                      const valueColor = isCritical
                                        ? isLightTheme
                                          ? '#991b1b'
                                          : '#fecaca'
                                        : isWarning
                                          ? isLightTheme
                                            ? '#92400e'
                                            : '#fde68a'
                                          : themeTextPrimary;
                                      const labelColor =
                                        isCritical || isWarning
                                          ? valueColor
                                          : themeTextSecondary;

                                      return (
                                        <View
                                          key={`${measurement.id}-${item.label}`}
                                          style={{
                                            width: '33.3333%',
                                            paddingHorizontal: 4,
                                            marginBottom: 8,
                                          }}>
                                          <View
                                            style={{
                                              borderWidth: 1,
                                              borderColor: tileBorderColor,
                                              borderRadius: 10,
                                              paddingVertical: 10,
                                              paddingHorizontal: 10,
                                              backgroundColor: tileBackgroundColor,
                                              minHeight: 74,
                                              justifyContent: 'space-between',
                                            }}>
                                            <Text
                                              style={{
                                                color: labelColor,
                                                fontSize: 11,
                                                fontWeight: '700',
                                                letterSpacing: 0.3,
                                              }}>
                                              {item.label}
                                            </Text>
                                            <Text
                                              style={{
                                                color: valueColor,
                                                fontSize: 18,
                                                fontWeight: '700',
                                                marginTop: 4,
                                              }}>
                                              {formatLatestTrendValue(item.value)}
                                            </Text>
                                          </View>
                                        </View>
                                      );
                                    })}
                                  </View>
                                ) : null}
                                {trimmedMeasurementNote ? (
                                  <Text style={{ color: themeTextPrimary, marginTop: 6 }}>
                                    {t('note')}: {trimmedMeasurementNote}
                                  </Text>
                                ) : null}

                                <Pressable
                                  onPress={() => handleStartEditMeasurement(measurement)}
                                  style={{
                                    marginTop: 10,
                                    borderWidth: 1,
                                    borderColor: themeBorderStrong,
                                    borderRadius: 8,
                                    paddingVertical: 8,
                                    paddingHorizontal: 10,
                                    backgroundColor: themeCardBg,
                                  }}>
                                  <Text
                                    style={{
                                      color: themeTextPrimary,
                                      textAlign: 'center',
                                      fontWeight: '700',
                                      fontSize: 12,
                                    }}>
                                    Edytuj wpis
                                  </Text>
                                </Pressable>

                                <Pressable
                                  onPress={() => handleDeleteMeasurement(measurement.id)}
                                  disabled={measurementDeleteBusy}
                                  style={{
                                    marginTop: 10,
                                    borderWidth: 1,
                                    borderColor: '#7a1e1e',
                                    borderRadius: 8,
                                    paddingVertical: 8,
                                    paddingHorizontal: 10,
                                    backgroundColor: '#2a1212',
                                    opacity: measurementDeleteBusy ? 0.6 : 1,
                                  }}>
                                  <Text
                                    style={{
                                      color: '#ffb3b3',
                                      textAlign: 'center',
                                      fontWeight: '700',
                                      fontSize: 12,
                                    }}>
                                    {measurementDeleteBusy
                                      ? t('deleting')
                                      : t('deleteEntryIrreversible')}
                                  </Text>
                                </Pressable>

                                {hasParameterAnalysisAccess ? (
                                  <>
                                    <Text
                                      style={{
                                        color: themeTextPrimary,
                                        marginTop: 10,
                                        fontWeight: '700',
                                      }}>
                                      {t('analysis')}
                                    </Text>
                                    <Text
                                      style={{
                                        color: SEVERITY_COLOR[analysis.status],
                                        marginTop: 4,
                                      }}>
                                      {analysis.summary}
                                    </Text>

                                    {analysis.recommendations.length === 0
                                      ? null
                                      : analysis.recommendations.map((item, index) => (
                                          <View
                                            key={`${measurement.id}-${item.parameter}-${index}`}
                                            style={{
                                              marginTop: 8,
                                              paddingTop: 8,
                                              borderTopWidth: index === 0 ? 0 : 1,
                                              borderTopColor: '#2d2d2d',
                                            }}>
                                            <Text
                                              style={{
                                                color: SEVERITY_COLOR[item.severity],
                                                fontWeight: '700',
                                              }}>
                                              {item.parameter} ({item.value})
                                            </Text>
                                            <Text
                                              style={{
                                                color: themeTextPrimary,
                                                marginTop: 2,
                                              }}>
                                              {t('expectedRange', {
                                                value: item.expectedRange,
                                              })}
                                            </Text>
                                            <Text
                                              style={{
                                                color: isLightTheme ? '#9a3412' : '#ffdd99',
                                                marginTop: 2,
                                              }}>
                                              {item.issue}
                                            </Text>
                                          </View>
                                        ))}

                                    {measurementRiskNotes.length > 0 ? (
                                      <View style={{ marginTop: 10 }}>
                                        <Text
                                          style={{
                                            color: themeTextPrimary,
                                            fontWeight: '700',
                                          }}>
                                          Potencjalne skutki bez korekty
                                        </Text>
                                        {measurementRiskNotes.slice(0, 4).map((risk, index) => (
                                          <Text
                                            key={`${measurement.id}-risk-${index}`}
                                            style={{
                                              color:
                                                risk.severity === 'critical'
                                                  ? themeDangerText
                                                  : isLightTheme
                                                    ? '#8a5a12'
                                                    : '#ffdd99',
                                              marginTop: 4,
                                              fontSize: 12,
                                            }}>
                                            - {risk.text}
                                          </Text>
                                        ))}
                                      </View>
                                    ) : null}
                                  </>
                                ) : null}
                              </View>
                            )}
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                  </>
                  )}

                  {historySectionTab === 'issues' && (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: themeBorder,
                        borderRadius: 10,
                        padding: 12,
                        backgroundColor: themeCardBg,
                      }}>
                      <Text
                        style={{
                          color: themeTextPrimary,
                          fontSize: 16,
                          fontWeight: '700',
                          marginBottom: 10,
                        }}>
                        {t('historyIssuesTitle')}
                      </Text>
                      {historyIssueTimeline.length === 0 ? (
                        <Text style={{ color: themeTextSecondary }}>
                          {t('historyIssuesEmpty')}
                        </Text>
                      ) : (
                        historyIssueTimeline.map((item, index) => {
                          const isActive = item.status === 'active';
                          const isExpanded = expandedHistoryIssueId === item.id;
                          const isDeleting = historyIssueDeleteBusyId === item.id;
                          return (
                            <View
                              key={`history-issue-${item.id ?? index}`}
                              style={{
                                borderWidth: 1,
                                borderColor: themeBorder,
                                borderRadius: 8,
                                padding: 10,
                                marginTop: index === 0 ? 0 : 8,
                                backgroundColor: themeCardBgAlt,
                              }}>
                              <Pressable
                                onPress={() =>
                                  setExpandedHistoryIssueId((prev) =>
                                    prev === item.id ? null : item.id
                                  )
                                }
                                style={{
                                  flexDirection: 'row',
                                  justifyContent: 'space-between',
                                  alignItems: 'flex-start',
                                }}>
                                <View style={{ flex: 1, paddingRight: 8 }}>
                                  <Text style={{ color: themeTextPrimary, fontWeight: '700' }}>
                                    {item.issueName}
                                  </Text>
                                  <Text
                                    style={{
                                      color: themeTextSecondary,
                                      fontSize: 12,
                                      marginTop: 2,
                                    }}>
                                    {item.issueTypeLabel}
                                  </Text>
                                </View>
                                <Text
                                  style={{
                                    color: themeActionText,
                                    fontSize: 12,
                                    fontWeight: '700',
                                  }}>
                                  {isExpanded ? t('hide') : t('tapForDetails')}
                                </Text>
                              </Pressable>

                              {!isExpanded ? null : (
                                <>
                                  <Text
                                    style={{
                                      color: themeTextSecondary,
                                      fontSize: 12,
                                      marginTop: 8,
                                    }}>
                                    {t('addedAt', { date: item.addedAt })}
                                  </Text>
                                  <Text
                                    style={{
                                      color: isActive ? themeWarningText : themeSuccessText,
                                      fontSize: 12,
                                      marginTop: 2,
                                    }}>
                                    {isActive
                                      ? t('historyIssueStatusActive')
                                      : t('historyIssueEndedAt', {
                                          date: item.endedAt ?? '-',
                                        })}
                                  </Text>

                                  <Pressable
                                    onPress={() => handleDeleteIssueHistoryEntry(item)}
                                    disabled={isDeleting || Boolean(historyIssueDeleteBusyId)}
                                    style={{
                                      marginTop: 10,
                                      borderWidth: 1,
                                      borderColor: '#7a1e1e',
                                      borderRadius: 8,
                                      paddingVertical: 8,
                                      paddingHorizontal: 10,
                                      backgroundColor: '#2a1212',
                                      opacity:
                                        isDeleting || Boolean(historyIssueDeleteBusyId)
                                          ? 0.6
                                          : 1,
                                    }}>
                                    <Text
                                      style={{
                                        color: '#ffb3b3',
                                        textAlign: 'center',
                                        fontWeight: '700',
                                        fontSize: 12,
                                      }}>
                                      {isDeleting
                                        ? t('deleting')
                                        : t('deleteEntryIrreversible')}
                                    </Text>
                                  </Pressable>
                                </>
                              )}
                            </View>
                          );
                        })
                      )}
                    </View>
                  )}
                </>
              )}
            </View>
          )}
        </ScrollView>
        {isDeleteAccountReauthModalVisible ? (
          <BottomSheetModal
            visible
            onClose={handleCloseDeleteAccountReauthModal}
            title={t('deleteAccountReauthTitle')}
            themeCardBg={themeCardBg}
            themeBorder={themeBorder}
            themeTextPrimary={themeTextPrimary}
            themeCardBgAlt={themeCardBgAlt}
            themeOverlay={themeOverlay}
            themeDragHandle={themeDragHandle}
            isLightTheme={isLightTheme}
            maxWidth={560}
            heightPercent={58}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
            <ScrollView
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{
                paddingHorizontal: 14,
                paddingTop: 14,
                paddingBottom: Math.max(insets.bottom + 20, 20),
              }}>
              <Text style={{ color: themeTextSecondary, fontSize: 12, marginBottom: 12 }}>
                {t('deleteAccountReauthHint')}
              </Text>

              {hasPasswordSignInProvider ? (
                <>
                  <TextInput
                    placeholder={t('password')}
                    placeholderTextColor={themePlaceholder}
                    value={deleteAccountReauthPassword}
                    onChangeText={setDeleteAccountReauthPassword}
                    secureTextEntry
                    style={{
                      borderWidth: 1,
                      borderColor: themeInputBorder,
                      color: themeInputText,
                      padding: 12,
                      borderRadius: 8,
                      marginBottom: 10,
                      backgroundColor: themeInputBg,
                    }}
                  />
                  <Pressable
                    onPress={handleDeleteAccountReauthWithPassword}
                    disabled={deleteAccountBusy || deleteAccountReauthBusy}
                    style={{
                      borderWidth: 1,
                      borderColor: themeDanger,
                      borderRadius: 8,
                      paddingVertical: 10,
                      backgroundColor: themeDangerBg,
                      opacity: deleteAccountBusy || deleteAccountReauthBusy ? 0.7 : 1,
                    }}>
                    <Text
                      style={{
                        color: themeDangerText,
                        textAlign: 'center',
                        fontWeight: '700',
                      }}>
                      {deleteAccountBusy || deleteAccountReauthBusy
                        ? t('deleteAccountReauthInProgress')
                        : t('deleteAccountReauthPasswordAction')}
                    </Text>
                  </Pressable>
                </>
              ) : null}

              {hasGoogleSignInProvider ? (
                <Pressable
                  onPress={handleDeleteAccountReauthWithGoogle}
                  disabled={deleteAccountBusy || deleteAccountReauthBusy}
                  style={{
                    marginTop: hasPasswordSignInProvider ? 10 : 0,
                    borderWidth: 1,
                    borderColor: themeBorderStrong,
                    borderRadius: 8,
                    paddingVertical: 10,
                    backgroundColor: themeCardBgAlt,
                    opacity: deleteAccountBusy || deleteAccountReauthBusy ? 0.7 : 1,
                  }}>
                  <Text
                    style={{
                      color: themeTextPrimary,
                      textAlign: 'center',
                      fontWeight: '700',
                    }}>
                    {deleteAccountBusy || deleteAccountReauthBusy
                      ? t('deleteAccountReauthInProgress')
                      : t('deleteAccountReauthGoogleAction')}
                  </Text>
                </Pressable>
              ) : null}

              {!hasPasswordSignInProvider && !hasGoogleSignInProvider ? (
                <Text style={{ color: themeWarningText, marginBottom: 10 }}>
                  {t('deleteAccountReauthMethodUnavailable')}
                </Text>
              ) : null}

              <Pressable
                onPress={handleCloseDeleteAccountReauthModal}
                disabled={deleteAccountBusy || deleteAccountReauthBusy}
                style={{
                  marginTop: 12,
                  borderWidth: 1,
                  borderColor: themeBorderStrong,
                  borderRadius: 8,
                  paddingVertical: 10,
                  backgroundColor: themeCardBg,
                  opacity: deleteAccountBusy || deleteAccountReauthBusy ? 0.7 : 1,
                }}>
                <Text
                  style={{
                    color: themeTextPrimary,
                    textAlign: 'center',
                    fontWeight: '700',
                  }}>
                  {t('cancel')}
                </Text>
              </Pressable>
            </ScrollView>
          </BottomSheetModal>
        ) : null}
        <Modal
          visible={isDiseaseImageModalVisible}
          animationType="fade"
          transparent={false}
          presentationStyle="fullScreen"
          onRequestClose={handleCloseDiseaseImageModal}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#05070b' }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 14,
                paddingTop: Math.max(insets.top + 6, 12),
                paddingBottom: 10,
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(255,255,255,0.16)',
              }}>
              <Text
                numberOfLines={1}
                style={{
                  color: '#f3f4f6',
                  fontSize: 15,
                  fontWeight: '700',
                  flex: 1,
                  paddingRight: 10,
                }}>
                {diseaseImageModalTitle || 'Zdjecie choroby'}
              </Text>
              <Pressable
                onPress={handleCloseDiseaseImageModal}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.35)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Text style={{ color: '#f9fafb', fontSize: 16, fontWeight: '700' }}>X</Text>
              </Pressable>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                flexGrow: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 12,
              }}
              maximumZoomScale={3.5}
              minimumZoomScale={1}
              pinchGestureEnabled
              centerContent>
              {diseaseImageModalUri ? (
                <Image
                  source={
                    diseaseImageModalLoadStage >= 2
                      ? DISEASE_IMAGE_PLACEHOLDER_SOURCE
                      : getDiseaseRemoteImageSource(
                          diseaseImageModalLoadStage >= 1 &&
                            diseaseImageModalFallbackUri
                            ? diseaseImageModalFallbackUri
                            : diseaseImageModalUri
                        )
                  }
                  style={{
                    width: diseaseImageModalFrameWidth * diseaseImageZoomLevel,
                    height: diseaseImageModalFrameHeight * diseaseImageZoomLevel,
                    maxWidth: diseaseImageModalFrameWidth * 3.5,
                    maxHeight: diseaseImageModalFrameHeight * 3.5,
                    borderRadius: 12,
                  }}
                  resizeMode="contain"
                  onError={
                    diseaseImageModalLoadStage >= 2
                      ? undefined
                      : ({ nativeEvent }) =>
                          handleDiseaseModalImageError(
                            String(nativeEvent?.error ?? '').trim()
                          )
                  }
                />
              ) : null}
            </ScrollView>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                paddingHorizontal: 14,
                paddingTop: 10,
                paddingBottom: Math.max(insets.bottom + 10, 14),
                borderTopWidth: 1,
                borderTopColor: 'rgba(255,255,255,0.16)',
              }}>
              <Pressable
                onPress={handleZoomOutDiseaseImage}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.35)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Text style={{ color: '#f9fafb', fontSize: 20, fontWeight: '700' }}>-</Text>
              </Pressable>

              <Pressable
                onPress={handleResetDiseaseImageZoom}
                style={{
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.35)',
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  minWidth: 82,
                }}>
                <Text
                  style={{
                    color: '#f9fafb',
                    fontWeight: '700',
                    textAlign: 'center',
                  }}>
                  {diseaseImageModalScaleLabel}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleZoomInDiseaseImage}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.35)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Text style={{ color: '#f9fafb', fontSize: 20, fontWeight: '700' }}>+</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

