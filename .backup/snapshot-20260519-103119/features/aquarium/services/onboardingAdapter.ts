export type OnboardingTaskChecks = Record<string, boolean>;

type OnboardingPlan = {
  isActive?: boolean;
  rows?: Array<{ id?: string; level?: string; status?: string }>;
  todayItems?: unknown[];
};

type SelectedTankLike = {
  onboardingEnabled?: boolean;
} | null;

type BuildOnboardingPanelModelParams = {
  selectedTank: SelectedTankLike;
  tankOnboardingPlan: OnboardingPlan | null | undefined;
  selectedTankOnboardingTaskChecks: OnboardingTaskChecks;
  hasTaskChecklistAccess: boolean;
};

export type OnboardingPanelModel = {
  shouldRenderPanel: boolean;
  sectionSeverity: 'none' | 'warning' | 'critical';
  visibleOnboardingRows: Array<Record<string, unknown>>;
  completedOnboardingRows: Array<Record<string, unknown>>;
};

export function buildOnboardingPanelModel({
  selectedTank,
  tankOnboardingPlan,
  selectedTankOnboardingTaskChecks,
  hasTaskChecklistAccess,
}: BuildOnboardingPanelModelParams): OnboardingPanelModel {
  const rows = Array.isArray(tankOnboardingPlan?.rows)
    ? tankOnboardingPlan.rows
    : [];

  const checks =
    selectedTankOnboardingTaskChecks &&
    typeof selectedTankOnboardingTaskChecks === 'object'
      ? selectedTankOnboardingTaskChecks
      : {};

  const visibleOnboardingRows = rows.filter(
    (row) =>
      String(row?.status ?? '') !== 'upcoming' &&
      !Boolean(checks[String(row?.id ?? '')])
  );

  const completedOnboardingRows = rows.filter((row) =>
    Boolean(checks[String(row?.id ?? '')])
  );

  let sectionSeverity: 'none' | 'warning' | 'critical' = 'none';
  if (
    selectedTank &&
    Boolean(tankOnboardingPlan?.isActive) &&
    hasTaskChecklistAccess
  ) {
    const hasWarnings = rows.some(
      (row) => String(row?.level ?? '').toLowerCase() === 'warning'
    );
    if (hasWarnings || (tankOnboardingPlan?.todayItems ?? []).length > 0) {
      sectionSeverity = 'warning';
    }
  }

  const shouldRenderPanel =
    Boolean(selectedTank) &&
    selectedTank?.onboardingEnabled !== false &&
    Boolean(tankOnboardingPlan?.isActive);

  return {
    shouldRenderPanel,
    sectionSeverity,
    visibleOnboardingRows,
    completedOnboardingRows,
  };
}
