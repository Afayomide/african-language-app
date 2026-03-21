export type LessonQuestionSourceGroup = "target" | "sentence" | "lesson";

export type LessonQuestionCandidate<T> = {
  stage: 1 | 2 | 3;
  sourceGroup: LessonQuestionSourceGroup;
  sourceKey: string;
  questionType: string;
  questionSubtype: string;
  payload: T;
};

type StageSelectionConfig = {
  stageLimit: number;
  groupLimits: Record<LessonQuestionSourceGroup, number>;
  perSourceLimits: Record<LessonQuestionSourceGroup, number>;
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

function getQuestionFamily(type: string, subtype: string) {
  if (subtype === "mc-select-context-response") return "scenario";
  if (type === "speaking") return "speaking";
  if (type === "matching") return "matching";
  if (subtype.includes("missing-word")) return "missing_word";
  if (subtype.includes("gap-fill")) return "gap_fill";
  if (subtype.includes("word-order") || subtype === "fg-letter-order") return "order";
  if (subtype.includes("select-translation")) {
    return type === "listening" ? "listening_translation" : "translation";
  }
  return subtype || type || "other";
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

export function selectLessonQuestionCandidates<T>(candidates: LessonQuestionCandidate<T>[]) {
  const selected: LessonQuestionCandidate<T>[] = [];

  for (const stage of [1, 2, 3] as const) {
    const stageConfig = STAGE_SELECTION_CONFIG[stage];
    const stageCandidates = candidates
      .map((candidate, index) => ({
        ...candidate,
        originalIndex: index,
        family: getQuestionFamily(candidate.questionType, candidate.questionSubtype),
        priority: getQuestionPriority(stage, candidate.sourceGroup, candidate.questionType, candidate.questionSubtype)
      }))
      .filter((candidate) => candidate.stage === stage)
      .sort((left, right) => right.priority - left.priority || left.originalIndex - right.originalIndex);

    const groupCounts: Record<LessonQuestionSourceGroup, number> = { target: 0, sentence: 0, lesson: 0 };
    const sourceCounts = new Map<string, number>();
    const sourceFamilyKeys = new Set<string>();

    while (stageCandidates.length > 0 && groupCounts.target + groupCounts.sentence + groupCounts.lesson < stageConfig.stageLimit) {
      const nextIndex = stageCandidates.findIndex((candidate) => {
        if (groupCounts[candidate.sourceGroup] >= stageConfig.groupLimits[candidate.sourceGroup]) return false;
        if ((sourceCounts.get(candidate.sourceKey) || 0) >= stageConfig.perSourceLimits[candidate.sourceGroup]) return false;
        if (sourceFamilyKeys.has(`${candidate.sourceKey}:${candidate.family}`)) return false;
        return true;
      });

      if (nextIndex < 0) break;

      const [chosen] = stageCandidates.splice(nextIndex, 1);
      selected.push(chosen);
      groupCounts[chosen.sourceGroup] += 1;
      sourceCounts.set(chosen.sourceKey, (sourceCounts.get(chosen.sourceKey) || 0) + 1);
      sourceFamilyKeys.add(`${chosen.sourceKey}:${chosen.family}`);
    }
  }

  return selected.map(({ payload }) => payload);
}

export function selectBundleQuestionDrafts<T extends { stage: 1 | 2 | 3; type: string; subtype: string }>(
  sourceGroup: Exclude<LessonQuestionSourceGroup, "lesson">,
  sourceKey: string,
  drafts: T[]
) {
  return selectLessonQuestionCandidates(
    drafts.map((draft) => ({
      stage: draft.stage,
      sourceGroup,
      sourceKey,
      questionType: draft.type,
      questionSubtype: draft.subtype,
      payload: draft
    }))
  );
}
