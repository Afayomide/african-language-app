export type LessonQuestionSourceGroup = "target" | "sentence" | "lesson";

export type LessonQuestionCandidate<T> = {
  stage: 1 | 2 | 3;
  sourceGroup: LessonQuestionSourceGroup;
  sourceKey: string;
  questionType: string;
  questionSubtype: string;
  payload: T;
};

export type LessonExerciseProfileName = "meaning-heavy" | "order-heavy" | "listening-heavy" | "speaking-light";

export type QuestionFamily =
  | "scenario"
  | "speaking"
  | "matching"
  | "missing_word"
  | "gap_fill"
  | "order"
  | "translation"
  | "listening_translation"
  | "other";

export type LessonQuestionSelectionHistoryEntry = {
  lessonKey: string;
  profileName: LessonExerciseProfileName;
  stageFamilies: Record<1 | 2 | 3, QuestionFamily[]>;
  stageSubtypes: Record<1 | 2 | 3, string[]>;
  stageSignatures: Record<1 | 2 | 3, string>;
};

export type ScheduledLessonRequirement = {
  stage: 2 | 3;
  sourceGroup: "sentence" | "lesson";
  questionSubtype: string;
  family: QuestionFamily;
};

export type ScheduledLessonPlan = {
  lessonKey: string;
  lessonIndex: number;
  totalLessons: number;
  lessonMode: "core" | "review";
  profileName: LessonExerciseProfileName;
  stageRequirements: Record<1 | 2 | 3, ScheduledLessonRequirement[]>;
};

export type LessonQuestionSelectionState = {
  profileUsageCounts: Map<LessonExerciseProfileName, number>;
  questionSubtypeUsageCounts: Map<string, number>;
  questionFamilyUsageCounts: Map<QuestionFamily, number>;
  stageSignatureUsageCounts: Map<string, number>;
  recentLessons: LessonQuestionSelectionHistoryEntry[];
  lessonPlans: Map<string, ScheduledLessonPlan>;
};

type StageSelectionConfig = {
  stageLimit: number;
  groupLimits: Record<LessonQuestionSourceGroup, number>;
  perSourceLimits: Record<LessonQuestionSourceGroup, number>;
};

type DecoratedCandidate<T> = LessonQuestionCandidate<T> & {
  originalIndex: number;
  family: QuestionFamily;
  basePriority: number;
};

type SelectionStageState = {
  groupCounts: Record<LessonQuestionSourceGroup, number>;
  sourceCounts: Map<string, number>;
  sourceFamilyKeys: Set<string>;
  familyCounts: Map<QuestionFamily, number>;
  lastFamily: QuestionFamily | null;
  selectedFamilies: QuestionFamily[];
  sentenceStage3Buckets: Map<"speaking" | "listening" | "meaning_or_order", number>;
};

type LessonQuestionSelectionOptions = {
  lessonKey?: string;
  profileName?: LessonExerciseProfileName;
  selectionState?: LessonQuestionSelectionState | null;
  lessonMode?: "core" | "review";
  commitSelection?: boolean;
};

type LessonQuestionSelectionSeed = {
  lessonKey: string;
  lessonMode?: "core" | "review";
};

type LessonQuestionSelectionPlan<T> = {
  profileName: LessonExerciseProfileName;
  selectedCandidates: LessonQuestionCandidate<T>[];
  historyEntry: LessonQuestionSelectionHistoryEntry;
};

const STAGE_SELECTION_CONFIG: Record<1 | 2 | 3, StageSelectionConfig> = {
  1: {
    stageLimit: 4,
    groupLimits: { target: 3, sentence: 1, lesson: 0 },
    perSourceLimits: { target: 2, sentence: 1, lesson: 0 }
  },
  2: {
    stageLimit: 5,
    groupLimits: { target: 2, sentence: 2, lesson: 1 },
    perSourceLimits: { target: 2, sentence: 1, lesson: 1 }
  },
  3: {
    stageLimit: 5,
    groupLimits: { target: 2, sentence: 3, lesson: 0 },
    perSourceLimits: { target: 1, sentence: 1, lesson: 0 }
  }
};

const EXERCISE_PROFILES: LessonExerciseProfileName[] = [
  "meaning-heavy",
  "order-heavy",
  "listening-heavy",
  "speaking-light"
];

const CORE_PROFILE_ROTATION: LessonExerciseProfileName[] = [
  "meaning-heavy",
  "listening-heavy",
  "order-heavy",
  "speaking-light"
];

const REVIEW_PROFILE_ROTATION: LessonExerciseProfileName[] = [
  "listening-heavy",
  "speaking-light"
];

const MAX_REQUIRED_ASSIGNMENTS_PER_STAGE: Record<2 | 3, number> = {
  2: 2,
  3: 2
};

type SubtypeQuotaSpec = {
  sourceGroup: "sentence" | "lesson";
  questionSubtype: string;
  family: QuestionFamily;
  targetCount: (coreLessonCount: number) => number;
  chooseStage: (plan: ScheduledLessonPlan, assignmentIndex: number) => 2 | 3;
  profileBonuses?: Partial<Record<LessonExerciseProfileName, number>>;
};

const CORE_SUBTYPE_QUOTA_SPECS: SubtypeQuotaSpec[] = [
  {
    sourceGroup: "sentence",
    questionSubtype: "mc-select-translation",
    family: "translation",
    targetCount: (coreLessonCount) => Math.max(1, Math.ceil(coreLessonCount / 2)),
    chooseStage: () => 2,
    profileBonuses: {
      "meaning-heavy": -2,
      "listening-heavy": 1
    }
  },
  {
    sourceGroup: "sentence",
    questionSubtype: "fg-word-order",
    family: "order",
    targetCount: (coreLessonCount) => Math.max(1, Math.ceil(coreLessonCount / 2)),
    chooseStage: (plan, assignmentIndex) => ((plan.lessonIndex + assignmentIndex) % 2 === 0 ? 2 : 3),
    profileBonuses: {
      "order-heavy": -3,
      "speaking-light": -1
    }
  },
  {
    sourceGroup: "sentence",
    questionSubtype: "ls-mc-select-translation",
    family: "listening_translation",
    targetCount: (coreLessonCount) => (coreLessonCount >= 2 ? Math.max(1, Math.floor(coreLessonCount / 3)) : 0),
    chooseStage: () => 3,
    profileBonuses: {
      "listening-heavy": -4
    }
  },
  {
    sourceGroup: "sentence",
    questionSubtype: "sp-pronunciation-compare",
    family: "speaking",
    targetCount: (coreLessonCount) => (coreLessonCount >= 2 ? Math.max(1, Math.floor((coreLessonCount + 1) / 3)) : 0),
    chooseStage: () => 3,
    profileBonuses: {
      "speaking-light": 4
    }
  },
  {
    sourceGroup: "lesson",
    questionSubtype: "mt-match-translation",
    family: "matching",
    targetCount: (coreLessonCount) => (coreLessonCount >= 2 ? Math.max(1, Math.floor(coreLessonCount / 3)) : 0),
    chooseStage: () => 2,
    profileBonuses: {
      "listening-heavy": -3,
      "meaning-heavy": -1
    }
  }
];

const PROFILE_FAMILY_BONUSES: Record<
  LessonExerciseProfileName,
  Partial<Record<1 | 2 | 3, Partial<Record<LessonQuestionSourceGroup, Partial<Record<QuestionFamily, number>>>>>>
> = {
  "meaning-heavy": {
    2: {
      target: { translation: 6, listening_translation: 2, order: -4 },
      sentence: { translation: 12, listening_translation: 6, order: -6 },
      lesson: { matching: 8 }
    },
    3: {
      target: { translation: 4, listening_translation: -2, order: 2 },
      sentence: { translation: 12, order: 5, listening_translation: 2, speaking: -8 }
    }
  },
  "order-heavy": {
    2: {
      target: { order: 8, gap_fill: 5, missing_word: 4, translation: -2 },
      sentence: { order: 14, translation: 3, listening_translation: -4 },
      lesson: { matching: 2 }
    },
    3: {
      target: { order: 8, gap_fill: 4, translation: 2 },
      sentence: { order: 14, translation: 4, listening_translation: -6, speaking: -6 }
    }
  },
  "listening-heavy": {
    2: {
      target: { listening_translation: 8, missing_word: 4, gap_fill: 3, translation: -1 },
      sentence: { listening_translation: 14, translation: 2, order: -3 },
      lesson: { matching: 4 }
    },
    3: {
      target: { listening_translation: 6, order: 2, translation: -1 },
      sentence: { listening_translation: 14, order: 5, translation: 2, speaking: -5 }
    }
  },
  "speaking-light": {
    2: {
      target: { speaking: -10, translation: 4, listening_translation: 2, order: 3 },
      sentence: { translation: 7, order: 5, listening_translation: 4, speaking: -10 },
      lesson: { matching: 4 }
    },
    3: {
      target: { listening_translation: 2, order: 4, translation: 4 },
      sentence: { translation: 8, order: 10, listening_translation: 5, speaking: -18 }
    }
  }
};

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function pushMapCount<T>(map: Map<T, number>, key: T, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function getProfileFamilyBonus(
  profileName: LessonExerciseProfileName,
  stage: 1 | 2 | 3,
  sourceGroup: LessonQuestionSourceGroup,
  family: QuestionFamily
) {
  return PROFILE_FAMILY_BONUSES[profileName]?.[stage]?.[sourceGroup]?.[family] || 0;
}

function buildEmptyStageRecord<T>(factory: () => T): Record<1 | 2 | 3, T> {
  return {
    1: factory(),
    2: factory(),
    3: factory()
  };
}

function buildStageSignature(families: QuestionFamily[]) {
  return families.join(">");
}

function getRecentLessons(state?: LessonQuestionSelectionState | null) {
  return state?.recentLessons || [];
}

function getLastLesson(state?: LessonQuestionSelectionState | null) {
  const recentLessons = getRecentLessons(state);
  return recentLessons.length > 0 ? recentLessons[recentLessons.length - 1] : null;
}

function getSecondLastLesson(state?: LessonQuestionSelectionState | null) {
  const recentLessons = getRecentLessons(state);
  return recentLessons.length > 1 ? recentLessons[recentLessons.length - 2] : null;
}

function getSentenceStage3Bucket(family: QuestionFamily) {
  if (family === "speaking") return "speaking" as const;
  if (family === "listening_translation") return "listening" as const;
  if (family === "translation" || family === "order") return "meaning_or_order" as const;
  return null;
}

function buildEmptyStageRequirements(): Record<1 | 2 | 3, ScheduledLessonRequirement[]> {
  return buildEmptyStageRecord<ScheduledLessonRequirement[]>(() => []);
}

function getPreferredProfileForLesson(input: {
  lessonIndex: number;
  lessonMode: "core" | "review";
  previousProfileName?: LessonExerciseProfileName | null;
  seedOffset: number;
}) {
  const rotation = input.lessonMode === "review" ? REVIEW_PROFILE_ROTATION : CORE_PROFILE_ROTATION;
  let profileName = rotation[(input.lessonIndex + input.seedOffset) % rotation.length] || rotation[0];

  if (input.previousProfileName === profileName && rotation.length > 1) {
    profileName = rotation[(input.lessonIndex + input.seedOffset + 1) % rotation.length] || rotation[0];
  }

  return profileName;
}

function getIdealLessonIndex(totalLessons: number, targetCount: number, assignmentIndex: number) {
  if (totalLessons <= 1 || targetCount <= 1) {
    return Math.min(totalLessons - 1, Math.floor(totalLessons / 2));
  }
  return Math.min(totalLessons - 1, Math.floor(((assignmentIndex + 0.5) * totalLessons) / targetCount));
}

function hasScheduledRequirement(
  plan: ScheduledLessonPlan,
  stage: 2 | 3,
  sourceGroup: "sentence" | "lesson",
  questionSubtype: string
) {
  return plan.stageRequirements[stage].some(
    (requirement) =>
      requirement.sourceGroup === sourceGroup && requirement.questionSubtype === questionSubtype
  );
}

function addScheduledRequirement(plan: ScheduledLessonPlan, requirement: ScheduledLessonRequirement) {
  if (
    plan.stageRequirements[requirement.stage].length >= MAX_REQUIRED_ASSIGNMENTS_PER_STAGE[requirement.stage] ||
    hasScheduledRequirement(plan, requirement.stage, requirement.sourceGroup, requirement.questionSubtype)
  ) {
    return false;
  }

  plan.stageRequirements[requirement.stage].push(requirement);
  return true;
}

function buildScheduledLessonPlans(lessons: LessonQuestionSelectionSeed[]): ScheduledLessonPlan[] {
  if (lessons.length === 0) return [];

  const coreLessons = lessons.filter((lesson) => (lesson.lessonMode || "core") !== "review");
  const lessonPlans: ScheduledLessonPlan[] = [];
  const seedOffset = hashString(lessons.map((lesson) => lesson.lessonKey).join("|")) % CORE_PROFILE_ROTATION.length;

  let previousProfileName: LessonExerciseProfileName | null = null;
  for (let index = 0; index < lessons.length; index += 1) {
    const lesson = lessons[index]!;
    const lessonMode = lesson.lessonMode || "core";
    const profileName = getPreferredProfileForLesson({
      lessonIndex: index,
      lessonMode,
      previousProfileName,
      seedOffset
    });
    previousProfileName = profileName;
    lessonPlans.push({
      lessonKey: lesson.lessonKey,
      lessonIndex: index,
      totalLessons: lessons.length,
      lessonMode,
      profileName,
      stageRequirements: buildEmptyStageRequirements()
    });
  }

  if (coreLessons.length === 0) {
    return lessonPlans;
  }

  const corePlans = lessonPlans.filter((plan) => plan.lessonMode === "core");

  for (const spec of CORE_SUBTYPE_QUOTA_SPECS) {
    const targetCount = Math.min(corePlans.length, spec.targetCount(corePlans.length));
    if (targetCount <= 0) continue;

    for (let assignmentIndex = 0; assignmentIndex < targetCount; assignmentIndex += 1) {
      const idealLessonIndex = getIdealLessonIndex(corePlans.length, targetCount, assignmentIndex);
      const rankedPlans = corePlans
        .map((plan, coreLessonIndex) => {
          const stage = spec.chooseStage(plan, assignmentIndex);
          const totalRequiredAssignments =
            plan.stageRequirements[2].length + plan.stageRequirements[3].length;
          const distancePenalty = Math.abs(coreLessonIndex - idealLessonIndex);
          const stageLoadPenalty = plan.stageRequirements[stage].length * 2;
          const familyPenalty = plan.stageRequirements[stage].some((item) => item.family === spec.family) ? 2 : 0;
          const profileBonus = spec.profileBonuses?.[plan.profileName] || 0;
          return {
            plan,
            stage,
            score: distancePenalty + totalRequiredAssignments + stageLoadPenalty + familyPenalty + profileBonus,
            coreLessonIndex
          };
        })
        .sort((left, right) => left.score - right.score || left.coreLessonIndex - right.coreLessonIndex);

      const chosen = rankedPlans.find(({ plan, stage }) =>
        !hasScheduledRequirement(plan, stage, spec.sourceGroup, spec.questionSubtype) &&
        plan.stageRequirements[stage].length < MAX_REQUIRED_ASSIGNMENTS_PER_STAGE[stage]
      );

      if (!chosen) continue;

      addScheduledRequirement(chosen.plan, {
        stage: chosen.stage,
        sourceGroup: spec.sourceGroup,
        questionSubtype: spec.questionSubtype,
        family: spec.family
      });
    }
  }

  return lessonPlans;
}

function getScheduledLessonPlan(
  lessonKey: string | undefined,
  selectionState?: LessonQuestionSelectionState | null
) {
  if (!lessonKey || !selectionState) return null;
  return selectionState.lessonPlans.get(lessonKey) || null;
}

export function createLessonQuestionSelectionState(input?: {
  lessons?: LessonQuestionSelectionSeed[];
}): LessonQuestionSelectionState {
  return {
    profileUsageCounts: new Map<LessonExerciseProfileName, number>(),
    questionSubtypeUsageCounts: new Map<string, number>(),
    questionFamilyUsageCounts: new Map<QuestionFamily, number>(),
    stageSignatureUsageCounts: new Map<string, number>(),
    recentLessons: [],
    lessonPlans: new Map(
      (input?.lessons ? buildScheduledLessonPlans(input.lessons) : []).map((plan) => [plan.lessonKey, plan] as const)
    )
  };
}

export function getQuestionFamily(type: string, subtype: string): QuestionFamily {
  if (subtype === "mc-select-context-response") return "scenario";
  if (type === "speaking") return "speaking";
  if (type === "matching") return "matching";
  if (subtype.includes("missing-word")) return "missing_word";
  if (subtype.includes("gap-fill")) return "gap_fill";
  if (subtype.includes("word-order") || subtype === "fg-letter-order") return "order";
  if (subtype.includes("select-translation")) {
    return type === "listening" ? "listening_translation" : "translation";
  }
  return "other";
}

function getQuestionPriority(stage: 1 | 2 | 3, sourceGroup: LessonQuestionSourceGroup, type: string, subtype: string) {
  const family = getQuestionFamily(type, subtype);

  if (sourceGroup === "lesson") {
    if (family === "matching") return 92;
    return 10;
  }

  if (sourceGroup === "sentence") {
    if (stage === 1) {
      if (family === "order") return 100;
      return 10;
    }
    if (stage === 2) {
      if (family === "translation") return 98;
      if (family === "listening_translation") return 94;
      if (family === "order") return 90;
      return 30;
    }
    if (family === "speaking") return 100;
    if (family === "order") return 95;
    if (family === "listening_translation") return 92;
    if (family === "translation") return 86;
    return 30;
  }

  if (stage === 1) {
    if (family === "translation") return 100;
    if (family === "order") return 94;
    if (family === "gap_fill") return 90;
    if (family === "missing_word") return 88;
    if (family === "listening_translation") return 84;
    return 40;
  }
  if (stage === 2) {
    if (family === "speaking") return 100;
    if (family === "gap_fill") return 94;
    if (family === "missing_word") return 92;
    if (family === "listening_translation") return 88;
    if (family === "order") return 82;
    if (family === "translation") return 70;
    return 40;
  }
  if (family === "listening_translation") return 96;
  if (family === "order") return 92;
  if (family === "gap_fill") return 90;
  if (family === "translation") return 78;
  return 40;
}

export function chooseLessonExerciseProfile(input: {
  lessonKey: string;
  lessonMode?: "core" | "review";
  selectionState?: LessonQuestionSelectionState | null;
}) {
  const selectionState = input.selectionState || null;
  const scheduledPlan = getScheduledLessonPlan(input.lessonKey, selectionState);
  if (scheduledPlan) {
    return scheduledPlan.profileName;
  }
  const lastLesson = getLastLesson(selectionState);
  const secondLastLesson = getSecondLastLesson(selectionState);

  let bestProfile = EXERCISE_PROFILES[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const profileName of EXERCISE_PROFILES) {
    const usageCount = selectionState?.profileUsageCounts.get(profileName) || 0;
    const modeBias =
      input.lessonMode === "review"
        ? profileName === "speaking-light"
          ? -0.45
          : profileName === "listening-heavy"
            ? -0.2
            : 0
        : profileName === "speaking-light"
          ? 0.15
          : 0;
    const repeatPenalty = lastLesson?.profileName === profileName ? 1.9 : 0;
    const recentPenalty = secondLastLesson?.profileName === profileName ? 0.7 : 0;
    const tieBreaker = (hashString(`${input.lessonKey}:${profileName}`) % 97) / 1000;
    const score = usageCount * 3 + repeatPenalty + recentPenalty + modeBias + tieBreaker;

    if (score < bestScore) {
      bestScore = score;
      bestProfile = profileName;
    }
  }

  return bestProfile;
}

function canSelectCandidate<T>(
  candidate: DecoratedCandidate<T>,
  stage: 1 | 2 | 3,
  stageConfig: StageSelectionConfig,
  stageState: SelectionStageState,
  selectedSourceSubtypeKeys: Set<string>
) {
  if (stageState.groupCounts[candidate.sourceGroup] >= stageConfig.groupLimits[candidate.sourceGroup]) return false;
  if ((stageState.sourceCounts.get(candidate.sourceKey) || 0) >= stageConfig.perSourceLimits[candidate.sourceGroup]) return false;
  if (stageState.sourceFamilyKeys.has(`${candidate.sourceKey}:${candidate.family}`)) return false;
  if (selectedSourceSubtypeKeys.has(`${candidate.sourceKey}:${candidate.questionSubtype}`)) return false;
  if (stage >= 2 && (stageState.familyCounts.get(candidate.family) || 0) >= 2) return false;

  if (stage === 3 && candidate.sourceGroup === "sentence") {
    const bucket = getSentenceStage3Bucket(candidate.family);
    if (bucket && (stageState.sentenceStage3Buckets.get(bucket) || 0) >= 1) return false;
  }

  return true;
}

function getCoverageBonus<T>(candidate: DecoratedCandidate<T>, selectionState?: LessonQuestionSelectionState | null) {
  if (!selectionState) return 0;

  const subtypeCount = selectionState.questionSubtypeUsageCounts.get(candidate.questionSubtype) || 0;
  const familyCount = selectionState.questionFamilyUsageCounts.get(candidate.family) || 0;
  let bonus = 0;

  if (subtypeCount === 0) bonus += 14;
  else if (subtypeCount === 1) bonus += 8;
  else if (subtypeCount === 2) bonus += 3;

  if (familyCount === 0) bonus += 4;
  else if (familyCount === 1) bonus += 1;

  return bonus;
}

function buildRequirementKey(stage: 1 | 2 | 3, sourceGroup: LessonQuestionSourceGroup, questionSubtype: string) {
  return `${stage}:${sourceGroup}:${questionSubtype}`;
}

function getScheduledRequirementBonus<T>(
  stage: 1 | 2 | 3,
  candidate: DecoratedCandidate<T>,
  scheduledPlan: ScheduledLessonPlan | null
) {
  if (!scheduledPlan) return 0;
  const isScheduledRequirement = scheduledPlan.stageRequirements[stage].some(
    (requirement) =>
      requirement.sourceGroup === candidate.sourceGroup &&
      requirement.questionSubtype === candidate.questionSubtype
  );
  return isScheduledRequirement ? 120 : 0;
}

function getRecentLessonPenalty<T>(
  stage: 1 | 2 | 3,
  candidate: DecoratedCandidate<T>,
  selectedFamilies: QuestionFamily[],
  selectionState?: LessonQuestionSelectionState | null
) {
  if (!selectionState) return 0;

  const lastLesson = getLastLesson(selectionState);
  const secondLastLesson = getSecondLastLesson(selectionState);
  let penalty = 0;

  if (lastLesson) {
    if (lastLesson.stageSubtypes[stage].includes(candidate.questionSubtype)) penalty += 10;
    else if (lastLesson.stageFamilies[stage].includes(candidate.family)) penalty += 5;

    if (
      selectedFamilies.length < lastLesson.stageFamilies[stage].length &&
      selectedFamilies.every((family, index) => family === lastLesson.stageFamilies[stage][index]) &&
      lastLesson.stageFamilies[stage][selectedFamilies.length] === candidate.family
    ) {
      penalty += 7 + selectedFamilies.length * 2;
    }
  }

  if (secondLastLesson) {
    if (secondLastLesson.stageSubtypes[stage].includes(candidate.questionSubtype)) penalty += 3;
    else if (secondLastLesson.stageFamilies[stage].includes(candidate.family)) penalty += 1;
  }

  return penalty;
}

function getCurrentStagePenalty<T>(candidate: DecoratedCandidate<T>, stageState: SelectionStageState) {
  let penalty = 0;
  const familyCount = stageState.familyCounts.get(candidate.family) || 0;
  if (familyCount > 0) penalty += 6 * familyCount;
  if (stageState.lastFamily === candidate.family) penalty += 12;
  if (stageState.lastFamily === "listening_translation" && candidate.family === "speaking") penalty += 18;
  if (stageState.lastFamily === "speaking" && candidate.family === "listening_translation") penalty += 12;
  return penalty;
}

function getStageSignaturePenalty(
  stage: 1 | 2 | 3,
  candidateFamily: QuestionFamily,
  selectedFamilies: QuestionFamily[],
  selectionState?: LessonQuestionSelectionState | null
) {
  if (!selectionState) return 0;
  const signature = buildStageSignature([...selectedFamilies, candidateFamily]);
  if (!signature) return 0;
  return (selectionState.stageSignatureUsageCounts.get(`${stage}:${signature}`) || 0) * 2;
}

function scoreCandidate<T>(
  stage: 1 | 2 | 3,
  candidate: DecoratedCandidate<T>,
  stageState: SelectionStageState,
  profileName: LessonExerciseProfileName,
  selectionState?: LessonQuestionSelectionState | null,
  scheduledPlan?: ScheduledLessonPlan | null
) {
  return (
    candidate.basePriority +
    getScheduledRequirementBonus(stage, candidate, scheduledPlan || null) +
    getProfileFamilyBonus(profileName, stage, candidate.sourceGroup, candidate.family) +
    getCoverageBonus(candidate, selectionState) -
    getRecentLessonPenalty(stage, candidate, stageState.selectedFamilies, selectionState) -
    getCurrentStagePenalty(candidate, stageState) -
    getStageSignaturePenalty(stage, candidate.family, stageState.selectedFamilies, selectionState)
  );
}

function reorderStageCandidates<T>(
  stage: 1 | 2 | 3,
  selectedCandidates: DecoratedCandidate<T>[],
  profileName: LessonExerciseProfileName,
  selectionState?: LessonQuestionSelectionState | null
) {
  if (selectedCandidates.length <= 1) return selectedCandidates;

  const remaining = [...selectedCandidates];
  const ordered: DecoratedCandidate<T>[] = [];
  let lastFamily: QuestionFamily | null = null;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!;
      let score = candidate.basePriority + getProfileFamilyBonus(profileName, stage, candidate.sourceGroup, candidate.family);
      score -= getRecentLessonPenalty(stage, candidate, ordered.map((item) => item.family), selectionState);
      if (lastFamily === candidate.family) score -= 20;
      if (lastFamily === "listening_translation" && candidate.family === "speaking") score -= 30;
      if (lastFamily === "speaking" && candidate.family === "listening_translation") score -= 18;
      score -= (ordered.filter((item) => item.family === candidate.family).length || 0) * 4;
      score -= index / 100;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const [chosen] = remaining.splice(bestIndex, 1);
    ordered.push(chosen!);
    lastFamily = chosen?.family || null;
  }

  return ordered;
}

function getAdjacencyPenalty(leftFamily: QuestionFamily | null, rightFamily: QuestionFamily | null) {
  if (!leftFamily || !rightFamily) return 0;
  if (leftFamily === rightFamily) return 30;
  if (leftFamily === "listening_translation" && rightFamily === "speaking") return 40;
  if (leftFamily === "speaking" && rightFamily === "listening_translation") return 18;
  return 0;
}

function getSequencePenalty<T>(candidates: DecoratedCandidate<T>[]) {
  let penalty = 0;
  for (let index = 1; index < candidates.length; index += 1) {
    penalty += getAdjacencyPenalty(candidates[index - 1]?.family || null, candidates[index]?.family || null);
  }
  return penalty;
}

function repairStageAdjacency<T>(candidates: DecoratedCandidate<T>[]) {
  if (candidates.length < 3) return candidates;
  const repaired = [...candidates];
  let improved = true;

  while (improved) {
    improved = false;
    for (let index = 1; index < repaired.length; index += 1) {
      const currentPenalty = getAdjacencyPenalty(repaired[index - 1]?.family || null, repaired[index]?.family || null);
      if (currentPenalty === 0) continue;

      for (let swapIndex = index + 1; swapIndex < repaired.length; swapIndex += 1) {
        const candidate = repaired[swapIndex];
        if (!candidate) continue;
        const swapped = [...repaired];
        swapped[index] = candidate;
        swapped[swapIndex] = repaired[index]!;
        if (getSequencePenalty(swapped) < getSequencePenalty(repaired)) {
          repaired.splice(0, repaired.length, ...swapped);
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  return repaired;
}

export function recordLessonQuestionSelection<T>(
  selectionState: LessonQuestionSelectionState,
  lessonKey: string,
  profileName: LessonExerciseProfileName,
  selectedCandidates: LessonQuestionCandidate<T>[]
) {
  const stageFamilies = buildEmptyStageRecord<QuestionFamily[]>(() => []);
  const stageSubtypes = buildEmptyStageRecord<string[]>(() => []);

  for (const candidate of selectedCandidates) {
    const family = getQuestionFamily(candidate.questionType, candidate.questionSubtype);
    stageFamilies[candidate.stage].push(family);
    stageSubtypes[candidate.stage].push(candidate.questionSubtype);
    pushMapCount(selectionState.questionSubtypeUsageCounts, candidate.questionSubtype);
    pushMapCount(selectionState.questionFamilyUsageCounts, family);
  }

  const stageSignatures = {
    1: buildStageSignature(stageFamilies[1]),
    2: buildStageSignature(stageFamilies[2]),
    3: buildStageSignature(stageFamilies[3])
  } satisfies Record<1 | 2 | 3, string>;

  for (const stage of [1, 2, 3] as const) {
    if (stageSignatures[stage]) {
      pushMapCount(selectionState.stageSignatureUsageCounts, `${stage}:${stageSignatures[stage]}`);
    }
  }

  pushMapCount(selectionState.profileUsageCounts, profileName);
  selectionState.recentLessons.push({
    lessonKey,
    profileName,
    stageFamilies,
    stageSubtypes,
    stageSignatures
  });
  if (selectionState.recentLessons.length > 4) {
    selectionState.recentLessons.splice(0, selectionState.recentLessons.length - 4);
  }
}

export function selectLessonQuestionPlan<T>(
  candidates: LessonQuestionCandidate<T>[],
  options: LessonQuestionSelectionOptions = {}
): LessonQuestionSelectionPlan<T> {
  const selectionState = options.selectionState || null;
  const scheduledPlan = getScheduledLessonPlan(options.lessonKey, selectionState);
  const profileName =
    options.profileName ||
    chooseLessonExerciseProfile({
      lessonKey: options.lessonKey || candidates.map((candidate) => candidate.sourceKey).join("|"),
      lessonMode: options.lessonMode,
      selectionState
    });

  const decoratedCandidates = candidates.map((candidate, index) => ({
    ...candidate,
    originalIndex: index,
    family: getQuestionFamily(candidate.questionType, candidate.questionSubtype),
    basePriority: getQuestionPriority(candidate.stage, candidate.sourceGroup, candidate.questionType, candidate.questionSubtype)
  }));

  const selectedByStage = buildEmptyStageRecord<DecoratedCandidate<T>[]>(() => []);
  const selectedSourceSubtypeKeys = new Set<string>();

  for (const stage of [1, 2, 3] as const) {
    const stageConfig = STAGE_SELECTION_CONFIG[stage];
    const stageCandidates = decoratedCandidates.filter((candidate) => candidate.stage === stage);
    const stageState: SelectionStageState = {
      groupCounts: { target: 0, sentence: 0, lesson: 0 },
      sourceCounts: new Map<string, number>(),
      sourceFamilyKeys: new Set<string>(),
      familyCounts: new Map<QuestionFamily, number>(),
      lastFamily: null,
      selectedFamilies: [],
      sentenceStage3Buckets: new Map<"speaking" | "listening" | "meaning_or_order", number>()
    };
    const pendingRequiredKeys = new Set(
      (scheduledPlan?.stageRequirements[stage] || []).map((requirement) =>
        buildRequirementKey(requirement.stage, requirement.sourceGroup, requirement.questionSubtype)
      )
    );

    while (
      stageCandidates.length > 0 &&
      stageState.groupCounts.target + stageState.groupCounts.sentence + stageState.groupCounts.lesson < stageConfig.stageLimit
    ) {
      let bestIndex = -1;
      let bestScore = Number.NEGATIVE_INFINITY;
      let foundRequiredCandidate = false;

      for (let index = 0; index < stageCandidates.length; index += 1) {
        const candidate = stageCandidates[index]!;
        if (!canSelectCandidate(candidate, stage, stageConfig, stageState, selectedSourceSubtypeKeys)) continue;
        const requirementKey = buildRequirementKey(stage, candidate.sourceGroup, candidate.questionSubtype);
        const isPendingRequiredCandidate = pendingRequiredKeys.has(requirementKey);
        if (foundRequiredCandidate && !isPendingRequiredCandidate) {
          continue;
        }

        const score = scoreCandidate(stage, candidate, stageState, profileName, selectionState, scheduledPlan);
        if (score > bestScore || (score === bestScore && candidate.originalIndex < (stageCandidates[bestIndex]?.originalIndex || Number.MAX_SAFE_INTEGER))) {
          bestScore = score;
          bestIndex = index;
          foundRequiredCandidate = isPendingRequiredCandidate;
        }
      }

      if (bestIndex < 0) break;

      const [chosen] = stageCandidates.splice(bestIndex, 1);
      if (!chosen) break;
      selectedByStage[stage].push(chosen);
      selectedSourceSubtypeKeys.add(`${chosen.sourceKey}:${chosen.questionSubtype}`);
      pendingRequiredKeys.delete(buildRequirementKey(stage, chosen.sourceGroup, chosen.questionSubtype));
      stageState.groupCounts[chosen.sourceGroup] += 1;
      stageState.sourceCounts.set(chosen.sourceKey, (stageState.sourceCounts.get(chosen.sourceKey) || 0) + 1);
      stageState.sourceFamilyKeys.add(`${chosen.sourceKey}:${chosen.family}`);
      pushMapCount(stageState.familyCounts, chosen.family);
      stageState.lastFamily = chosen.family;
      stageState.selectedFamilies.push(chosen.family);
      if (stage === 3 && chosen.sourceGroup === "sentence") {
        const bucket = getSentenceStage3Bucket(chosen.family);
        if (bucket) {
          pushMapCount(stageState.sentenceStage3Buckets, bucket);
        }
      }
    }

    selectedByStage[stage] = repairStageAdjacency(
      reorderStageCandidates(stage, selectedByStage[stage], profileName, selectionState)
    );
  }

  const selectedCandidates = [
    ...selectedByStage[1],
    ...selectedByStage[2],
    ...selectedByStage[3]
  ].map(({ originalIndex: _originalIndex, family: _family, basePriority: _basePriority, ...candidate }) => candidate);

  const historyStageFamilies = {
    1: selectedByStage[1].map((candidate) => candidate.family),
    2: selectedByStage[2].map((candidate) => candidate.family),
    3: selectedByStage[3].map((candidate) => candidate.family)
  } satisfies Record<1 | 2 | 3, QuestionFamily[]>;
  const historyStageSubtypes = {
    1: selectedByStage[1].map((candidate) => candidate.questionSubtype),
    2: selectedByStage[2].map((candidate) => candidate.questionSubtype),
    3: selectedByStage[3].map((candidate) => candidate.questionSubtype)
  } satisfies Record<1 | 2 | 3, string[]>;
  const historyEntry: LessonQuestionSelectionHistoryEntry = {
    lessonKey: options.lessonKey || "lesson",
    profileName,
    stageFamilies: historyStageFamilies,
    stageSubtypes: historyStageSubtypes,
    stageSignatures: {
      1: buildStageSignature(historyStageFamilies[1]),
      2: buildStageSignature(historyStageFamilies[2]),
      3: buildStageSignature(historyStageFamilies[3])
    }
  };

  if (selectionState && options.lessonKey && options.commitSelection !== false) {
    recordLessonQuestionSelection(selectionState, options.lessonKey, profileName, selectedCandidates);
  }

  return {
    profileName,
    selectedCandidates,
    historyEntry
  };
}

export function selectLessonQuestionCandidates<T>(
  candidates: LessonQuestionCandidate<T>[],
  options: LessonQuestionSelectionOptions = {}
) {
  return selectLessonQuestionPlan(candidates, options).selectedCandidates.map(({ payload }) => payload);
}

export function selectBundleQuestionDrafts<T extends { stage: 1 | 2 | 3; type: string; subtype: string }>(
  sourceGroup: Exclude<LessonQuestionSourceGroup, "lesson">,
  sourceKey: string,
  drafts: T[],
  options: Omit<LessonQuestionSelectionOptions, "lessonKey"> = {}
) {
  return selectLessonQuestionCandidates(
    drafts.map((draft) => ({
      stage: draft.stage,
      sourceGroup,
      sourceKey,
      questionType: draft.type,
      questionSubtype: draft.subtype,
      payload: draft
    })),
    {
      ...options,
      lessonKey: sourceKey
    }
  );
}
