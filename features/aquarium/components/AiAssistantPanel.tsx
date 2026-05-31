import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  AiChatRequestError,
  requestAiChat,
} from '@/features/aquarium/services/aiChatService';
import {
  pickVisionImage,
  requestAiVisionAnalyzeWithRetry,
  uploadVisionImageForUser,
} from '@/features/aquarium/services/aiVisionService';
import {
  trackAiRequestFailure,
  trackAiRequestStarted,
  trackAiRequestSuccess,
} from '@/shared/services/observability';
import { db } from '@/shared/services/firebase';
import { Text, TextInput } from '@/features/aquarium/components/LocalizedText';

type AiAssistantTheme = {
  isLightTheme: boolean;
  themeCardBg: string;
  themeCardBgAlt: string;
  themeBorder: string;
  themeBorderStrong: string;
  themeTextPrimary: string;
  themeTextSecondary: string;
  themeAccent: string;
  themeAccentOnStrong: string;
  themeWarningText: string;
  themeDangerText: string;
  themeInputBg: string;
  themeInputBorder: string;
  themeInputText: string;
  themePlaceholder: string;
};

type AiChatHistoryEntry = {
  type: 'chat';
  id: string;
  createdAtMs: number;
  createdAtLabel: string;
  question: string;
  answer: string;
  recommendations: string[];
  warnings: string[];
  hadEmptyDataFallback: boolean;
};

type AiVisionHistoryEntry = {
  type: 'vision';
  id: string;
  createdAtMs: number;
  createdAtLabel: string;
  question: string;
  imageUri: string;
  summary: string;
  hypotheses: Array<{ key: string; label: string; confidence: number }>;
  verificationSteps: string[];
  actionPlan: string[];
  warnings: string[];
  hadEmptyDataFallback: boolean;
  unreadableImageFallback: boolean;
};

type AiAssistantEntry = AiChatHistoryEntry | AiVisionHistoryEntry;

type RetryKind = 'chat' | 'vision' | null;

type AiAssistantPanelProps = {
  user: { uid?: string; getIdToken?: () => Promise<string> } | null;
  selectedTankId?: string | null;
  selectedTankName?: string | null;
  forceActiveTankContext?: boolean;
  hasAiAssistantAccess: boolean;
  aiAssistantLockMessage: string;
  aiAssistantUpgradePromptMessage?: string;
  showAiAssistantUpgradePrompt?: boolean;
  onPressUpgradePrompt?: (() => void) | null;
  aiConsentDataProcessing: boolean;
  aiConsentImageAnalysis: boolean;
  onToggleAiConsentDataProcessing: () => void;
  onToggleAiConsentImageAnalysis: () => void;
  theme: AiAssistantTheme;
};

type PickedVisionImage = {
  uri: string;
  width: number;
  height: number;
  mimeType: string;
};

const MAX_HISTORY_ITEMS = 8;
const MAX_DESCRIPTION_LENGTH = 600;
const AI_HISTORY_COLLECTION = 'aiAssistantHistory';
const QUICK_ACTIONS = Object.freeze([
  {
    id: 'interpret-params',
    label: 'Zinterpretuj moje parametry',
    question:
      'Przeanalizuj aktualne parametry w aktywnym akwarium i zwróć praktyczne sugestie.',
    additionalInfo: 'Skup się na pH, NO2, NO3, NH3/NH4 i temperaturze. Nie układaj priorytetów.',
    mode: 'chat',
    aiMode: 'water_parameters',
  },
  {
    id: 'what-now',
    label: 'Co zrobić teraz?',
    question:
      'Co powinienem zrobić teraz w tym akwarium? Ustal priorytety na dzisiaj.',
    additionalInfo: 'Daj krótki plan krok po kroku.',
    mode: 'chat',
  },
  {
    id: 'check-stocking',
    label: "Sprawdź obsade",
    question:
      'Oceń obsadę mojego akwarium i wskaż największe ryzyka dla ryb.',
    additionalInfo: 'Podaj, co poprawic najpierw i dlaczego.',
    mode: 'chat',
  },
  {
    id: 'analyze-photo',
    label: 'Przeanalizuj zdjęcie',
    question:
      'Przeanalizuj zdjęcie akwarium i wskaz najbardziej prawdopodobne problemy.',
    additionalInfo: 'Podaj hipotezy, poziom pewnosci i plan weryfikacji pomiarami.',
    mode: 'vision',
  },
  {
    id: 'help-algae',
    label: 'Pomoz z glonami',
    question:
      'Mam problem z glonami. Oceń dane i zaproponuj plan ograniczania glonów.',
    additionalInfo: 'Uwzględnij światło, NO3/PO4 i obciążenie biologiczne.',
    mode: 'chat',
  },
  {
    id: 'help-sick-fish',
    label: 'Pomoz z chora ryba',
    question:
      'Ryba wyglada na chora. Co moge sprawdzic i jakie kroki wykonac najpierw?',
    additionalInfo: 'Daj ostrozny plan i oznacz, co wymaga konsultacji specjalistycznej.',
    mode: 'chat',
  },
]);

function toSafeString(value: unknown, maxLength = 4000): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, maxLength);
}

function buildHistoryEntryTitle(entry: AiAssistantEntry): string {
  const source = entry.question || (entry.type === 'vision' ? 'Analiza zdjecia' : 'Rozmowa z AI');
  const normalized = source.replace(/\s+/g, ' ').trim();
  const prefix = entry.type === 'vision' ? 'Analiza zdjecia: ' : '';
  const maxLength = entry.type === 'vision' ? 58 : 72;
  const title = normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trim()}...` : normalized;
  return `${prefix}${title}`;
}

function buildDisplayPoints(value: string | string[], maxItems = 8): string[] {
  const source = Array.isArray(value) ? value.join('\n') : value;
  const normalized = source.trim();
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n+|(?:^|\s)(?:[-*]|\d+[.)])\s+/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function getAiHistoryCollectionRef(uid: string) {
  return collection(db, 'users', uid, AI_HISTORY_COLLECTION);
}

function normalizeStringList(value: unknown, maxItems = 8, maxLength = 1200): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => toSafeString(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeHypotheses(value: unknown): AiVisionHistoryEntry['hypotheses'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const source = item as { key?: unknown; label?: unknown; confidence?: unknown };
      const label = toSafeString(source?.label, 300);
      if (!label) {
        return null;
      }
      const rawConfidence = Number(source?.confidence);
      const confidence = Number.isFinite(rawConfidence)
        ? Math.min(1, Math.max(0, rawConfidence))
        : 0;
      return {
        key: toSafeString(source?.key, 80) || `hypothesis-${index}`,
        label,
        confidence,
      };
    })
    .filter((item): item is AiVisionHistoryEntry['hypotheses'][number] => Boolean(item))
    .slice(0, 8);
}

function normalizeAiHistoryEntry(id: string, data: Record<string, unknown>): AiAssistantEntry | null {
  const type = data.type === 'vision' ? 'vision' : data.type === 'chat' ? 'chat' : null;
  if (!type) {
    return null;
  }

  const createdAtMs = Number(data.createdAtMs);
  const fallbackCreatedAtMs = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
  const createdAtLabel =
    toSafeString(data.createdAtLabel, 80) || new Date(fallbackCreatedAtMs).toLocaleString();
  const question = toSafeString(data.question, 1200);

  if (type === 'chat') {
    const answer = toSafeString(data.answer, 8000);
    if (!question || !answer) {
      return null;
    }
    return {
      type: 'chat',
      id,
      createdAtMs: fallbackCreatedAtMs,
      createdAtLabel,
      question,
      answer,
      recommendations: normalizeStringList(data.recommendations, 8, 1200),
      warnings: normalizeStringList(data.warnings, 6, 1200),
      hadEmptyDataFallback: data.hadEmptyDataFallback === true,
    };
  }

  const summary = toSafeString(data.summary, 8000);
  if (!question || !summary) {
    return null;
  }
  return {
    type: 'vision',
    id,
    createdAtMs: fallbackCreatedAtMs,
    createdAtLabel,
    question,
    imageUri: toSafeString(data.imageUri, 4000),
    summary,
    hypotheses: normalizeHypotheses(data.hypotheses),
    verificationSteps: normalizeStringList(data.verificationSteps, 8, 1200),
    actionPlan: normalizeStringList(data.actionPlan, 8, 1200),
    warnings: normalizeStringList(data.warnings, 6, 1200),
    hadEmptyDataFallback: data.hadEmptyDataFallback === true,
    unreadableImageFallback: data.unreadableImageFallback === true,
  };
}

export function AiAssistantPanel({
  user,
  selectedTankId = null,
  selectedTankName = null,
  forceActiveTankContext = false,
  hasAiAssistantAccess,
  aiAssistantLockMessage,
  aiAssistantUpgradePromptMessage = '',
  showAiAssistantUpgradePrompt = false,
  onPressUpgradePrompt = null,
  aiConsentDataProcessing,
  aiConsentImageAnalysis,
  onToggleAiConsentDataProcessing,
  onToggleAiConsentImageAnalysis,
  theme,
}: AiAssistantPanelProps) {
  const [question, setQuestion] = useState('');
  const [includeActiveTank, setIncludeActiveTank] = useState(true);
  const [selectedVisionImage, setSelectedVisionImage] = useState<PickedVisionImage | null>(
    null
  );
  const [history, setHistory] = useState<AiAssistantEntry[]>([]);
  const [selectedHistoryEntryId, setSelectedHistoryEntryId] = useState<string | null>(null);
  const [deletingHistoryEntryId, setDeletingHistoryEntryId] = useState<string | null>(null);
  const [historyStatusMessage, setHistoryStatusMessage] = useState('');
  const [pendingChatMode, setPendingChatMode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryableError, setRetryableError] = useState(false);
  const [isTimeoutError, setIsTimeoutError] = useState(false);
  const [emptyDataHintVisible, setEmptyDataHintVisible] = useState(false);
  const [missingDataHints, setMissingDataHints] = useState<string[]>([]);
  const [lastRetryKind, setLastRetryKind] = useState<RetryKind>(null);
  const [lastChatRequest, setLastChatRequest] = useState<{
    question: string;
    additionalInfo: string;
    tankId: string | null;
    mode: string;
  } | null>(null);
  const [lastVisionRequest, setLastVisionRequest] = useState<{
    question: string;
    additionalInfo: string;
    tankId: string | null;
    image: PickedVisionImage;
  } | null>(null);

  useEffect(() => {
    if (forceActiveTankContext) {
      setIncludeActiveTank(true);
    }
  }, [forceActiveTankContext]);

  const effectiveIncludeActiveTank = forceActiveTankContext ? true : includeActiveTank;
  const activeTankIdForRequest = effectiveIncludeActiveTank ? selectedTankId || null : null;
  const canRetry = Boolean(lastRetryKind) && retryableError && !isLoading;
  const historyItems = useMemo(() => history, [history]);
  const selectedHistoryEntry = useMemo(
    () => historyItems.find((entry) => entry.id === selectedHistoryEntryId) ?? null,
    [historyItems, selectedHistoryEntryId]
  );
  const pushHistoryEntry = useCallback((entry: AiAssistantEntry) => {
    setHistory((previous) => [entry, ...previous].slice(0, MAX_HISTORY_ITEMS));
  }, []);

  const saveHistoryEntry = useCallback(
    async (entry: AiAssistantEntry) => {
      const uid = toSafeString(user?.uid, 128);
      if (!uid) {
        return;
      }

      try {
        await setDoc(doc(getAiHistoryCollectionRef(uid), entry.id), {
          ...entry,
          userId: uid,
          schemaVersion: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setHistoryStatusMessage('');
      } catch {
        setHistoryStatusMessage(
          'Nie udalo sie zapisac historii w chmurze. Wpis zostal pokazany lokalnie.'
        );
      }
    },
    [user?.uid]
  );

  const deleteHistoryEntry = useCallback(
    async (entryId: string) => {
      const uid = toSafeString(user?.uid, 128);
      const removedEntry = historyItems.find((entry) => entry.id === entryId) ?? null;

      setDeletingHistoryEntryId(entryId);
      setHistory((previous) => previous.filter((entry) => entry.id !== entryId));
      if (selectedHistoryEntryId === entryId) {
        setSelectedHistoryEntryId(null);
      }

      try {
        if (uid) {
          await deleteDoc(doc(getAiHistoryCollectionRef(uid), entryId));
        }
        setHistoryStatusMessage('');
      } catch {
        if (removedEntry) {
          setHistory((previous) =>
            [removedEntry, ...previous]
              .filter((entry, index, list) => list.findIndex((item) => item.id === entry.id) === index)
              .sort((a, b) => b.createdAtMs - a.createdAtMs)
              .slice(0, MAX_HISTORY_ITEMS)
          );
        }
        setHistoryStatusMessage('Nie udalo sie usunac wpisu historii. Sprobuj ponownie.');
      } finally {
        setDeletingHistoryEntryId(null);
      }
    },
    [historyItems, selectedHistoryEntryId, user?.uid]
  );

  useEffect(() => {
    if (selectedHistoryEntryId && !selectedHistoryEntry) {
      setSelectedHistoryEntryId(null);
    }
  }, [selectedHistoryEntry, selectedHistoryEntryId]);

  useEffect(() => {
    const uid = toSafeString(user?.uid, 128);
    if (!uid || !hasAiAssistantAccess) {
      setHistory([]);
      setSelectedHistoryEntryId(null);
      return undefined;
    }

    let isMounted = true;
    const loadHistory = async () => {
      try {
        const snapshot = await getDocs(
          query(
            getAiHistoryCollectionRef(uid),
            orderBy('createdAtMs', 'desc'),
            limit(MAX_HISTORY_ITEMS)
          )
        );
        if (!isMounted) {
          return;
        }
        const nextHistory = snapshot.docs
          .map((item) => normalizeAiHistoryEntry(item.id, item.data()))
          .filter((item): item is AiAssistantEntry => Boolean(item));
        setHistory(nextHistory);
        setHistoryStatusMessage('');
      } catch {
        if (isMounted) {
          setHistoryStatusMessage('Nie udalo sie wczytac zapisanej historii AI.');
        }
      }
    };

    void loadHistory();

    return () => {
      isMounted = false;
    };
  }, [hasAiAssistantAccess, user?.uid]);

  const setHandledError = useCallback((error: AiChatRequestError) => {
    setErrorMessage(error.message);
    setRetryableError(Boolean(error.retryable));
    setIsTimeoutError(error.code === 'AIW_TIMEOUT');
  }, []);

  const clearErrorState = useCallback(() => {
    setErrorMessage('');
    setRetryableError(false);
    setIsTimeoutError(false);
    setLastRetryKind(null);
  }, []);

  const buildMissingDataHints = useCallback((contextSummary: Record<string, unknown> | null) => {
    const hints: string[] = [];
    const tankCount = Number((contextSummary as { tankCount?: unknown } | null)?.tankCount);
    const measurementCount = Number(
      (contextSummary as { measurementCount?: unknown } | null)?.measurementCount
    );
    const stockCount = Number((contextSummary as { stockCount?: unknown } | null)?.stockCount);
    const equipmentTotal = Number(
      (
        contextSummary as {
          equipmentSummary?: { total?: unknown };
        } | null
      )?.equipmentSummary?.total
    );

    if (!Number.isFinite(tankCount) || tankCount <= 0) {
      hints.push('Dodaj pierwsze akwarium lub wybierz aktywne akwarium do analizy.');
      return hints;
    }
    if (!Number.isFinite(measurementCount) || measurementCount <= 0) {
      hints.push('Dodaj pomiar: pH, NO2, NO3 i temperatura.');
    }
    if (!Number.isFinite(stockCount) || stockCount <= 0) {
      hints.push('Uzupełnij obsadę (ryby/rośliny), aby AI mogło ocenić zgodność.');
    }
    if (!Number.isFinite(equipmentTotal) || equipmentTotal <= 0) {
      hints.push('Uzupełnij sprzęt (filtr, grzałka, oświetlenie) dla trafniejszych zaleceń.');
    }
    return hints;
  }, []);

  const runChatRequest = useCallback(
    async (
      requestOverride: {
        question: string;
        additionalInfo: string;
        tankId: string | null;
        mode: string;
      } | null = null
    ) => {
      if (!hasAiAssistantAccess || isLoading) {
        return;
      }

      const nextRequest = requestOverride ?? {
        question: toSafeString(question, MAX_DESCRIPTION_LENGTH),
        additionalInfo: '',
        tankId: activeTankIdForRequest,
        mode: toSafeString(pendingChatMode, 64),
      };
      if (!aiConsentDataProcessing) {
        setHandledError(
          new AiChatRequestError(
            'Aby korzystac z AI, włącz zgode na przetwarzanie danych AI.',
            'AIW_VALIDATION',
            false
          )
        );
        return;
      }
      if (!nextRequest.question || nextRequest.question.length < 2) {
        setHandledError(
          new AiChatRequestError('Wpisz pytanie (minimum 2 znaki).', 'AIW_VALIDATION', false)
        );
        return;
      }

      setLastChatRequest(nextRequest);
      setLastRetryKind('chat');
      setIsLoading(true);
      clearErrorState();
      const startedAt = Date.now();

      trackAiRequestStarted({
        operation: 'chat',
        hasTankId: Boolean(nextRequest.tankId),
        questionLength: nextRequest.question.length,
        additionalInfoLength: nextRequest.additionalInfo.length,
        source: 'settings_ai_assistant_panel',
      });

      try {
        const idToken = await user?.getIdToken?.();
        const response = await requestAiChat({
          idToken: toSafeString(idToken, 4096),
          question: nextRequest.question,
          additionalInfo: nextRequest.additionalInfo,
          tankId: nextRequest.tankId,
          mode: nextRequest.mode,
        });

        const hasMinimalData = Boolean(
          (response.contextSummary as { meta?: { hasMinimalData?: boolean } } | null)?.meta
            ?.hasMinimalData
        );
        setEmptyDataHintVisible(hasMinimalData);
        setMissingDataHints(
          hasMinimalData ? buildMissingDataHints(response.contextSummary) : []
        );

        const createdAtMs = Date.now();
        const historyEntry: AiChatHistoryEntry = {
          type: 'chat',
          id: `ai-chat-${createdAtMs}`,
          createdAtMs,
          createdAtLabel: new Date(createdAtMs).toLocaleString(),
          question: nextRequest.question,
          answer: toSafeString(response.answer, 8000),
          recommendations: response.recommendations.slice(0, 4),
          warnings: response.warnings.slice(0, 3),
          hadEmptyDataFallback: hasMinimalData,
        };
        pushHistoryEntry(historyEntry);
        void saveHistoryEntry(historyEntry);
        setQuestion('');
        setPendingChatMode('');
        setLastRetryKind(null);

        trackAiRequestSuccess({
          operation: 'chat',
          durationMs: Date.now() - startedAt,
          diagnosticCode: response.diagnosticCode,
          hasTankId: Boolean(nextRequest.tankId),
          source: 'settings_ai_assistant_panel',
        });
      } catch (rawError) {
        const mappedError =
          rawError instanceof AiChatRequestError
            ? rawError
            : new AiChatRequestError(
                'Wystapil błąd Asystenta AI. Spróbuj ponownie.',
                'AIW_INTERNAL',
                true
              );
        setHandledError(mappedError);
        setLastRetryKind('chat');

        trackAiRequestFailure(rawError, {
          operation: 'chat',
          durationMs: Date.now() - startedAt,
          diagnosticCode: mappedError.code,
          httpStatus: mappedError.status ?? null,
          hasTankId: Boolean(nextRequest.tankId),
          questionLength: nextRequest.question.length,
          additionalInfoLength: nextRequest.additionalInfo.length,
          source: 'settings_ai_assistant_panel',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [
      activeTankIdForRequest,
      aiConsentDataProcessing,
      clearErrorState,
      hasAiAssistantAccess,
      isLoading,
      pushHistoryEntry,
      question,
      pendingChatMode,
      saveHistoryEntry,
      setHandledError,
      user,
      buildMissingDataHints,
    ]
  );

  const handlePickVisionImage = useCallback(
    async (source: 'camera' | 'gallery') => {
      if (!hasAiAssistantAccess || isLoading) {
        return;
      }
      setIsLoading(true);
      clearErrorState();
      try {
        const picked = await pickVisionImage(source);
        if (!picked) {
          return;
        }
        setSelectedVisionImage({
          uri: picked.uri,
          width: picked.width,
          height: picked.height,
          mimeType: picked.mimeType,
        });
      } catch (rawError) {
        const mappedError =
          rawError instanceof AiChatRequestError
            ? rawError
            : new AiChatRequestError(
                "Nie udalo się wybrac zdjęcia. Spróbuj ponownie.",
                'AIW_INTERNAL',
                true
              );
        setHandledError(mappedError);
      } finally {
        setIsLoading(false);
      }
    },
    [clearErrorState, hasAiAssistantAccess, isLoading, setHandledError]
  );

  const runVisionRequest = useCallback(
    async (
      requestOverride: {
        question: string;
        additionalInfo: string;
        tankId: string | null;
        image: PickedVisionImage;
      } | null = null
    ) => {
      if (!hasAiAssistantAccess || isLoading) {
        return;
      }

      const image = requestOverride?.image ?? selectedVisionImage;
      if (!image?.uri) {
        setHandledError(
          new AiChatRequestError(
            'Dodaj zdjęcie z aparatu lub galerii przed analiza.',
            'AIW_VALIDATION',
            false
          )
        );
        return;
      }
      if (!aiConsentDataProcessing || !aiConsentImageAnalysis) {
        setHandledError(
          new AiChatRequestError(
            'Aby analizowac zdjęcia, włącz zgody: przetwarzanie danych AI i analiza obrazow.',
            'AIW_VALIDATION',
            false
          )
        );
        return;
      }

      const nextRequest = requestOverride ?? {
        question: toSafeString(question, MAX_DESCRIPTION_LENGTH),
        additionalInfo: '',
        tankId: activeTankIdForRequest,
        image,
      };

      setLastVisionRequest(nextRequest);
      setLastRetryKind('vision');
      setIsLoading(true);
      clearErrorState();
      const startedAt = Date.now();

      trackAiRequestStarted({
        operation: 'vision',
        hasTankId: Boolean(nextRequest.tankId),
        questionLength: nextRequest.question.length,
        additionalInfoLength: nextRequest.additionalInfo.length,
        source: 'settings_ai_assistant_panel',
      });

      try {
        const uid = toSafeString(user?.uid, 128);
        const idToken = await user?.getIdToken?.();
        const uploaded = await uploadVisionImageForUser(uid, nextRequest.image);
        const response = await requestAiVisionAnalyzeWithRetry(
          {
            idToken: toSafeString(idToken, 4096),
            imageUrl: uploaded.downloadUrl,
            question: nextRequest.question,
            additionalInfo: nextRequest.additionalInfo,
            tankId: nextRequest.tankId,
          },
          { maxAttempts: 2, retryDelayMs: 450 }
        );

        const hasMinimalData = Boolean(
          (response.contextSummary as { meta?: { hasMinimalData?: boolean } } | null)?.meta
            ?.hasMinimalData
        );
        setEmptyDataHintVisible(hasMinimalData || response.unreadableImageFallback);
        setMissingDataHints(
          hasMinimalData ? buildMissingDataHints(response.contextSummary) : []
        );

        const createdAtMs = Date.now();
        const historyEntry: AiVisionHistoryEntry = {
          type: 'vision',
          id: `ai-vision-${createdAtMs}`,
          createdAtMs,
          createdAtLabel: new Date(createdAtMs).toLocaleString(),
          question: nextRequest.question || 'Analiza zdjecia akwarium',
          imageUri: uploaded.downloadUrl || nextRequest.image.uri,
          summary: response.summary,
          hypotheses: response.hypotheses,
          verificationSteps: response.verificationSteps,
          actionPlan: response.actionPlan.length > 0 ? response.actionPlan : response.recommendations,
          warnings: response.warnings,
          hadEmptyDataFallback: hasMinimalData,
          unreadableImageFallback: response.unreadableImageFallback,
        };
        pushHistoryEntry(historyEntry);
        void saveHistoryEntry(historyEntry);
        setLastRetryKind(null);

        trackAiRequestSuccess({
          operation: 'vision',
          durationMs: Date.now() - startedAt,
          diagnosticCode: response.diagnosticCode,
          hasTankId: Boolean(nextRequest.tankId),
          source: 'settings_ai_assistant_panel',
        });
      } catch (rawError) {
        const mappedError =
          rawError instanceof AiChatRequestError
            ? rawError
            : new AiChatRequestError(
                'Wystapil błąd analizy obrazu. Spróbuj ponownie.',
                'AIW_INTERNAL',
                true
              );
        setHandledError(mappedError);
        setLastRetryKind('vision');

        trackAiRequestFailure(rawError, {
          operation: 'vision',
          durationMs: Date.now() - startedAt,
          diagnosticCode: mappedError.code,
          httpStatus: mappedError.status ?? null,
          hasTankId: Boolean(nextRequest.tankId),
          questionLength: nextRequest.question.length,
          additionalInfoLength: nextRequest.additionalInfo.length,
          source: 'settings_ai_assistant_panel',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [
      activeTankIdForRequest,
      aiConsentDataProcessing,
      aiConsentImageAnalysis,
      clearErrorState,
      hasAiAssistantAccess,
      isLoading,
      pushHistoryEntry,
      question,
      saveHistoryEntry,
      selectedVisionImage,
      setHandledError,
      user,
      buildMissingDataHints,
    ]
  );

  const handleQuickAction = useCallback(
    (actionId: string) => {
      const action = QUICK_ACTIONS.find((item) => item.id === actionId);
      if (!action || isLoading) {
        return;
      }

      clearErrorState();
      setPendingChatMode(toSafeString((action as { aiMode?: unknown }).aiMode, 64));
      setQuestion(
        toSafeString(`${action.question}\n${action.additionalInfo}`, MAX_DESCRIPTION_LENGTH)
      );
    },
    [clearErrorState, isLoading]
  );

  const handleRetry = useCallback(() => {
    if (lastRetryKind === 'chat' && lastChatRequest) {
      void runChatRequest(lastChatRequest);
      return;
    }
    if (lastRetryKind === 'vision' && lastVisionRequest) {
      void runVisionRequest(lastVisionRequest);
    }
  }, [lastChatRequest, lastRetryKind, lastVisionRequest, runChatRequest, runVisionRequest]);

  const handleSubmitAssistantRequest = useCallback(() => {
    if (selectedVisionImage?.uri) {
      void runVisionRequest();
      return;
    }
    void runChatRequest();
  }, [runChatRequest, runVisionRequest, selectedVisionImage?.uri]);

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: theme.themeBorder,
        borderRadius: 10,
        padding: 12,
        marginBottom: 18,
        backgroundColor: theme.themeCardBg,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Text
          style={{
            color: theme.themeTextPrimary,
            fontWeight: '700',
            fontSize: 16,
          }}>
          Asystent AI
        </Text>
        <View
          style={{
            borderWidth: 1,
            borderColor: '#c7a24a',
            borderRadius: 999,
            paddingVertical: 3,
            paddingHorizontal: 8,
            backgroundColor: theme.isLightTheme ? '#fff4cf' : '#3a2e13',
          }}>
          <Text
            style={{
              color: theme.isLightTheme ? '#7a5b17' : '#f5dd96',
              fontSize: 10,
              fontWeight: '700',
            }}>
            PRO
          </Text>
        </View>
      </View>
      <Text style={{ color: theme.themeTextSecondary, fontSize: 12, marginBottom: 10 }}>
        Doradca premium, który analizuje dane konkretnego akwarium: parametry, obsade, sprzęt,
        onboarding i zdjęcia.
      </Text>

      {!hasAiAssistantAccess ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.themeWarningText,
            borderRadius: 8,
            padding: 12,
            backgroundColor: theme.themeCardBgAlt,
          }}>
          <Text style={{ color: theme.themeWarningText, fontSize: 12, fontWeight: '700' }}>
            {aiAssistantLockMessage}
          </Text>
          <Text style={{ color: theme.themeTextSecondary, fontSize: 12, marginTop: 6 }}>
            Funkcja Pro pomaga konkretnie w:
          </Text>
          <Text style={{ color: theme.themeTextSecondary, fontSize: 12, marginTop: 4 }}>
            - interpretacji parametrów i priorytetow działań,
          </Text>
          <Text style={{ color: theme.themeTextSecondary, fontSize: 12, marginTop: 2 }}>
            - diagnozie problemów (ryby/rośliny/glony),
          </Text>
          <Text style={{ color: theme.themeTextSecondary, fontSize: 12, marginTop: 2 }}>
            - analizie zdjęć + planie krok po kroku.
          </Text>
          {showAiAssistantUpgradePrompt && aiAssistantUpgradePromptMessage ? (
            <Text
              style={{
                color: theme.themeTextSecondary,
                fontSize: 12,
                marginTop: 6,
              }}>
              {aiAssistantUpgradePromptMessage}
            </Text>
          ) : null}
          {showAiAssistantUpgradePrompt ? (
            <Pressable
              onPress={() => {
                if (typeof onPressUpgradePrompt === 'function') {
                  onPressUpgradePrompt();
                }
              }}
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: theme.themeAccent,
                borderRadius: 8,
                paddingVertical: 8,
                backgroundColor: theme.themeAccent,
              }}>
              <Text
                style={{
                  color: theme.themeAccentOnStrong,
                  textAlign: 'center',
                  fontWeight: '700',
                  fontSize: 12,
                }}>
                Ulepsz do Pro
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.themeBorder,
              borderRadius: 8,
              padding: 10,
              backgroundColor: theme.themeCardBgAlt,
              marginBottom: 8,
            }}>
            <Text style={{ color: theme.themeTextPrimary, fontWeight: '700', fontSize: 12 }}>
              Szybkie akcje AI
            </Text>
            <Text style={{ color: theme.themeTextSecondary, fontSize: 11, marginTop: 4 }}>
              Klikniecie tylko uzupelnia pole pytania. Wysylka nastapi dopiero po recznym kliknieciu
              przycisku.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {QUICK_ACTIONS.map((action) => (
                <Pressable
                  key={action.id}
                  onPress={() => handleQuickAction(action.id)}
                  disabled={isLoading}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.themeBorderStrong,
                    borderRadius: 999,
                    paddingVertical: 7,
                    paddingHorizontal: 10,
                    backgroundColor: theme.themeCardBg,
                    opacity: isLoading ? 0.7 : 1,
                  }}>
                  <Text style={{ color: theme.themeTextPrimary, fontSize: 12 }}>
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={{ marginTop: 2, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => {
                  void handlePickVisionImage('gallery');
                }}
                disabled={isLoading}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: theme.themeBorderStrong,
                  borderRadius: 8,
                  paddingVertical: 9,
                  paddingHorizontal: 8,
                  backgroundColor: theme.themeCardBgAlt,
                  opacity: isLoading ? 0.7 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}>
                <MaterialIcons name="photo-library" size={16} color={theme.themeTextPrimary} />
                <Text
                  style={{
                    color: theme.themeTextPrimary,
                    textAlign: 'center',
                    fontWeight: '700',
                    fontSize: 12,
                  }}>
                  Wybierz z galerii
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void handlePickVisionImage('camera');
                }}
                disabled={isLoading}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: theme.themeBorderStrong,
                  borderRadius: 8,
                  paddingVertical: 9,
                  paddingHorizontal: 8,
                  backgroundColor: theme.themeCardBgAlt,
                  opacity: isLoading ? 0.7 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}>
                <MaterialIcons name="photo-camera" size={16} color={theme.themeTextPrimary} />
                <Text
                  style={{
                    color: theme.themeTextPrimary,
                    textAlign: 'center',
                    fontWeight: '700',
                    fontSize: 12,
                  }}>
                  Zrób zdjęcie
                </Text>
              </Pressable>
            </View>

            {selectedVisionImage?.uri ? (
              <View
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: theme.themeBorder,
                  borderRadius: 8,
                  padding: 8,
                  backgroundColor: theme.themeCardBgAlt,
                }}>
                <Image
                  source={{ uri: selectedVisionImage.uri }}
                  style={{
                    width: '100%',
                    height: 180,
                    borderRadius: 6,
                    backgroundColor: '#00000022',
                  }}
                  resizeMode="cover"
                />
                <Pressable
                  onPress={() => setSelectedVisionImage(null)}
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: theme.themeBorderStrong,
                    borderRadius: 8,
                    paddingVertical: 8,
                    backgroundColor: theme.themeCardBg,
                  }}>
                  <Text
                    style={{
                      color: theme.themeTextPrimary,
                      textAlign: 'center',
                      fontWeight: '700',
                      fontSize: 12,
                    }}>
                    Usuń zdjęcie
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <TextInput
            value={question}
            onChangeText={(value) => {
              setQuestion(value);
              setPendingChatMode('');
            }}
            placeholder="Opisz problem lub pytanie (np. ryby lapia powietrze, NO3 rosnie, glony na szybach)."
            placeholderTextColor={theme.themePlaceholder}
            multiline
            maxLength={MAX_DESCRIPTION_LENGTH}
            style={{
              borderWidth: 1,
              borderColor: theme.themeInputBorder,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 10,
              backgroundColor: theme.themeInputBg,
              color: theme.themeInputText,
              minHeight: 74,
              textAlignVertical: 'top',
            }}
          />
          <Text
            style={{
              marginTop: 6,
              color: theme.themeTextSecondary,
              fontSize: 11,
              textAlign: 'right',
            }}>
            {question.length}/{MAX_DESCRIPTION_LENGTH}
          </Text>

          {!forceActiveTankContext ? (
            <Pressable
              onPress={() => setIncludeActiveTank((previous) => !previous)}
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: includeActiveTank ? theme.themeAccent : theme.themeBorderStrong,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
                backgroundColor: includeActiveTank ? theme.themeCardBgAlt : theme.themeCardBg,
              }}>
              <Text
                style={{
                  color: includeActiveTank ? theme.themeTextPrimary : theme.themeTextSecondary,
                  fontSize: 12,
                }}>
                {includeActiveTank
                  ? selectedTankId
                    ? 'Kontekst zapytania: aktywne akwarium'
                    : 'Kontekst: wszystkie akwaria (brak aktywnego)'
                  : 'Kontekst: wszystkie akwaria'}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={handleSubmitAssistantRequest}
            disabled={isLoading}
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: theme.themeAccent,
              borderRadius: 8,
              paddingVertical: 10,
              backgroundColor: theme.themeAccent,
              opacity: isLoading ? 0.7 : 1,
            }}>
              <Text
                style={{
                  color: theme.themeAccentOnStrong,
                  textAlign: 'center',
                  fontWeight: '700',
                }}>
                {isLoading
                  ? selectedVisionImage?.uri
                    ? 'Trwa analiza...'
                    : 'Asystent odpowiada...'
                  : selectedVisionImage?.uri
                    ? 'Zapytaj asystanta (ze zdjęciem)'
                    : 'Zapytaj asystanta'}
              </Text>
            </Pressable>

          <Pressable
            onPress={onToggleAiConsentDataProcessing}
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: aiConsentDataProcessing ? theme.themeAccent : theme.themeBorderStrong,
              borderRadius: 8,
              padding: 8,
              backgroundColor: aiConsentDataProcessing
                ? theme.themeCardBg
                : theme.themeCardBgAlt,
            }}>
            <Text style={{ color: theme.themeTextPrimary, fontSize: 12 }}>
              [{aiConsentDataProcessing ? 'X' : ' '}] Uzywanie danych akwarium do odpowiedzi AI
            </Text>
          </Pressable>
          <Pressable
            onPress={onToggleAiConsentImageAnalysis}
            style={{
              marginTop: 8,
              borderWidth: 1,
              borderColor: aiConsentImageAnalysis ? theme.themeAccent : theme.themeBorderStrong,
              borderRadius: 8,
              padding: 8,
              backgroundColor: aiConsentImageAnalysis
                ? theme.themeCardBg
                : theme.themeCardBgAlt,
            }}>
            <Text style={{ color: theme.themeTextPrimary, fontSize: 12 }}>
              [{aiConsentImageAnalysis ? 'X' : ' '}] Analiza zdjec przez AI
            </Text>
          </Pressable>

          {errorMessage ? (
            <View
              style={{
                marginTop: 10,
                borderWidth: 1,
                borderColor: theme.themeDangerText,
                borderRadius: 8,
                padding: 10,
                backgroundColor: theme.isLightTheme ? '#fff6f6' : '#2c1414',
              }}>
              <Text style={{ color: theme.themeDangerText, fontSize: 12 }}>{errorMessage}</Text>
              {isTimeoutError ? (
                <Text style={{ color: theme.themeTextSecondary, fontSize: 12, marginTop: 6 }}>
                  Timeout: spróbuj krótszego pytania, zostaw kontekst aktywnego akwarium i
                  wybierz wyrazniejsze zdjęcie.
                </Text>
              ) : null}
              {canRetry ? (
                <Pressable
                  onPress={handleRetry}
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: theme.themeBorderStrong,
                    borderRadius: 8,
                    paddingVertical: 8,
                    backgroundColor: theme.themeCardBg,
                  }}>
                  <Text
                    style={{
                      color: theme.themeTextPrimary,
                      textAlign: 'center',
                      fontWeight: '700',
                      fontSize: 12,
                    }}>
                    Spróbuj ponownie
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {emptyDataHintVisible ? (
            <View
              style={{
                marginTop: 10,
                borderWidth: 1,
                borderColor: theme.themeWarningText,
                borderRadius: 8,
                padding: 10,
                backgroundColor: theme.themeCardBgAlt,
              }}>
              <Text style={{ color: theme.themeWarningText, fontSize: 12, fontWeight: '700' }}>
                Odpowiedz AI ma ograniczony kontekst.
              </Text>
              {missingDataHints.length > 0 ? (
                missingDataHints.map((hint, index) => (
                  <Text
                    key={`ai-missing-hint-${index}`}
                    style={{ color: theme.themeTextSecondary, fontSize: 12, marginTop: 4 }}>
                    - {hint}
                  </Text>
                ))
              ) : (
                <Text style={{ color: theme.themeTextSecondary, fontSize: 12, marginTop: 4 }}>
                  Brakuje danych historycznych lub obraz jest nieczytelny. Dodaj pomiary i wykonaj
                  wyrazniejsze zdjęcie, aby uzyskac bardziej precyzyjna analizę.
                </Text>
              )}
            </View>
          ) : null}
        </>
      )}

      <View style={{ marginTop: 12 }}>
        <Text
          style={{
            color: theme.themeTextPrimary,
            fontWeight: '700',
            fontSize: 14,
            marginBottom: 8,
          }}>
          Historia rozmowy i analiz
        </Text>
        {historyStatusMessage ? (
          <Text style={{ color: theme.themeWarningText, fontSize: 11, marginBottom: 8 }}>
            {historyStatusMessage}
          </Text>
        ) : null}
        {historyItems.length === 0 ? (
          <Text style={{ color: theme.themeTextSecondary, fontSize: 12 }}>
            Brak wpisów. Użyj szybkiej akcji albo zadaj pytanie dla aktywnego akwarium.
          </Text>
        ) : selectedHistoryEntry ? (
          (() => {
            const entry = selectedHistoryEntry;
            const title = buildHistoryEntryTitle(entry);
            const answerPoints =
              entry.type === 'chat' ? buildDisplayPoints(entry.answer, 10) : [];

            return (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: theme.themeBorderStrong,
                  borderRadius: 10,
                  padding: 12,
                  backgroundColor: theme.themeCardBgAlt,
                }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    marginBottom: 10,
                  }}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSelectedHistoryEntryId(null)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      flex: 1,
                    }}>
                    <MaterialIcons name="arrow-back" size={18} color={theme.themeAccent} />
                    <Text style={{ color: theme.themeAccent, fontWeight: '700', fontSize: 12 }}>
                      Wroc do historii
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={deletingHistoryEntryId === entry.id}
                    onPress={() => void deleteHistoryEntry(entry.id)}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.themeDangerText,
                      borderRadius: 999,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                    }}>
                    <Text
                      style={{ color: theme.themeDangerText, fontSize: 11, fontWeight: '700' }}>
                      {deletingHistoryEntryId === entry.id ? 'Usuwanie...' : 'Usun'}
                    </Text>
                  </Pressable>
                </View>

                <Text style={{ color: theme.themeTextPrimary, fontWeight: '800', fontSize: 15 }}>
                  {title}
                </Text>
                <Text style={{ color: theme.themeTextSecondary, fontSize: 11, marginTop: 3 }}>
                  {entry.createdAtLabel}
                </Text>

                <View style={{ marginTop: 12 }}>
                  <Text style={{ color: theme.themeTextPrimary, fontWeight: '700', fontSize: 12 }}>
                    Pytanie
                  </Text>
                  <Text style={{ color: theme.themeTextPrimary, marginTop: 5, lineHeight: 20 }}>
                    {entry.question}
                  </Text>
                </View>

                {entry.type === 'chat' ? (
                  <>
                    <View style={{ marginTop: 14 }}>
                      <Text
                        style={{ color: theme.themeTextPrimary, fontWeight: '700', fontSize: 12 }}>
                        Odpowiedz
                      </Text>
                      {answerPoints.length > 1 ? (
                        <View style={{ marginTop: 5, gap: 6 }}>
                          {answerPoints.map((item, index) => (
                            <Text
                              key={`${entry.id}-answer-point-${index}`}
                              style={{ color: theme.themeTextPrimary, lineHeight: 20 }}>
                              {index + 1}. {item}
                            </Text>
                          ))}
                        </View>
                      ) : (
                        <Text
                          style={{ color: theme.themeTextPrimary, marginTop: 5, lineHeight: 20 }}>
                          {entry.answer}
                        </Text>
                      )}
                    </View>

                    {entry.recommendations.length > 0 ? (
                      <View style={{ marginTop: 14 }}>
                        <Text
                          style={{
                            color: theme.themeTextPrimary,
                            fontWeight: '700',
                            fontSize: 12,
                          }}>
                          Plan dzialania
                        </Text>
                        {entry.recommendations.map((item, index) => (
                          <Text
                            key={`${entry.id}-detail-rec-${index}`}
                            style={{
                              color: theme.themeTextSecondary,
                              fontSize: 12,
                              marginTop: 5,
                              lineHeight: 18,
                            }}>
                            {index + 1}. {item}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Image
                      source={{ uri: entry.imageUri }}
                      style={{
                        width: '100%',
                        height: 180,
                        borderRadius: 8,
                        marginTop: 12,
                        backgroundColor: '#00000022',
                      }}
                      resizeMode="cover"
                    />
                    <View style={{ marginTop: 14 }}>
                      <Text
                        style={{ color: theme.themeTextPrimary, fontWeight: '700', fontSize: 12 }}>
                        Odpowiedz
                      </Text>
                      <Text style={{ color: theme.themeTextPrimary, marginTop: 5, lineHeight: 20 }}>
                        {entry.summary}
                      </Text>
                    </View>
                    {entry.hypotheses.length > 0 ? (
                      <View style={{ marginTop: 14 }}>
                        <Text
                          style={{
                            color: theme.themeTextPrimary,
                            fontWeight: '700',
                            fontSize: 12,
                          }}>
                          Hipotezy
                        </Text>
                        {entry.hypotheses.map((item, index) => (
                          <Text
                            key={`${entry.id}-detail-hypothesis-${item.key}-${index}`}
                            style={{
                              color: theme.themeTextSecondary,
                              fontSize: 12,
                              marginTop: 5,
                              lineHeight: 18,
                            }}>
                            {index + 1}. {item.label} ({Math.round(item.confidence * 100)}%)
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    {entry.verificationSteps.length > 0 ? (
                      <View style={{ marginTop: 14 }}>
                        <Text
                          style={{
                            color: theme.themeTextPrimary,
                            fontWeight: '700',
                            fontSize: 12,
                          }}>
                          Kroki weryfikacyjne
                        </Text>
                        {entry.verificationSteps.map((item, index) => (
                          <Text
                            key={`${entry.id}-detail-verify-${index}`}
                            style={{
                              color: theme.themeTextSecondary,
                              fontSize: 12,
                              marginTop: 5,
                              lineHeight: 18,
                            }}>
                            {index + 1}. {item}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    {entry.actionPlan.length > 0 ? (
                      <View style={{ marginTop: 14 }}>
                        <Text
                          style={{
                            color: theme.themeTextPrimary,
                            fontWeight: '700',
                            fontSize: 12,
                          }}>
                          Plan dzialania
                        </Text>
                        {entry.actionPlan.map((item, index) => (
                          <Text
                            key={`${entry.id}-detail-plan-${index}`}
                            style={{
                              color: theme.themeTextSecondary,
                              fontSize: 12,
                              marginTop: 5,
                              lineHeight: 18,
                            }}>
                            {index + 1}. {item}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    {entry.unreadableImageFallback ? (
                      <Text style={{ color: theme.themeWarningText, marginTop: 10, fontSize: 11 }}>
                        Fallback: obraz byl nieczytelny, wynik ma charakter orientacyjny.
                      </Text>
                    ) : null}
                  </>
                )}

                {entry.warnings.length > 0 ? (
                  <View style={{ marginTop: 14 }}>
                    <Text
                      style={{ color: theme.themeWarningText, fontWeight: '700', fontSize: 12 }}>
                      Ostrzezenia
                    </Text>
                    {entry.warnings.map((warning, index) => (
                      <Text
                        key={`${entry.id}-detail-warning-${index}`}
                        style={{ color: theme.themeWarningText, fontSize: 12, marginTop: 4 }}>
                        {index + 1}. {warning}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {entry.hadEmptyDataFallback ? (
                  <Text style={{ color: theme.themeWarningText, marginTop: 10, fontSize: 11 }}>
                    Odpowiedz bazowala na ograniczonych danych.
                  </Text>
                ) : null}
              </View>
            );
          })()
        ) : (
          historyItems.map((entry) => {
            const title = buildHistoryEntryTitle(entry);

            return (
              <View
                key={entry.id}
                style={{
                  borderWidth: 1,
                  borderColor: theme.themeBorder,
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 8,
                  backgroundColor: theme.themeCardBgAlt,
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSelectedHistoryEntryId(entry.id)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: theme.isLightTheme ? '#e8f2ff' : '#17314f',
                      }}>
                      <MaterialIcons
                        name={entry.type === 'vision' ? 'image-search' : 'chat-bubble-outline'}
                        size={16}
                        color={theme.themeAccent}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.themeTextPrimary, fontWeight: '700' }}>
                        {title}
                      </Text>
                      <Text style={{ color: theme.themeTextSecondary, fontSize: 11, marginTop: 3 }}>
                        {entry.createdAtLabel}
                      </Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={theme.themeTextSecondary} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={deletingHistoryEntryId === entry.id}
                    onPress={() => void deleteHistoryEntry(entry.id)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: theme.themeDangerText,
                    }}>
                    <MaterialIcons name="delete-outline" size={17} color={theme.themeDangerText} />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>
      <Text style={{ color: theme.themeTextSecondary, fontSize: 11, marginTop: 8 }}>
        AI wspiera decyzje akwarystyczne, ale nie zastępuje specjalisty ani lekarza weterynarii.
      </Text>
    </View>
  );
}
