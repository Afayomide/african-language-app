import test from "node:test";
import assert from "node:assert/strict";

import {
  createLessonQuestionSelectionState,
  selectLessonQuestionPlan,
  type LessonQuestionCandidate
} from "../application/services/lessonQuestionSelection.js";

function makeCandidate(
  overrides: Partial<LessonQuestionCandidate<string>> & Pick<LessonQuestionCandidate<string>, "stage" | "sourceGroup" | "sourceKey" | "questionType" | "questionSubtype">
): LessonQuestionCandidate<string> {
  return {
    payload: `${overrides.sourceKey}:${overrides.questionSubtype}:${overrides.stage}`,
    ...overrides
  };
}

test("selectLessonQuestionPlan does not repeat the same source and subtype across stages", () => {
  const plan = selectLessonQuestionPlan([
    makeCandidate({
      stage: 2,
      sourceGroup: "sentence",
      sourceKey: "sentence:1",
      questionType: "fill-in-the-gap",
      questionSubtype: "fg-word-order"
    }),
    makeCandidate({
      stage: 3,
      sourceGroup: "sentence",
      sourceKey: "sentence:1",
      questionType: "fill-in-the-gap",
      questionSubtype: "fg-word-order"
    }),
    makeCandidate({
      stage: 3,
      sourceGroup: "sentence",
      sourceKey: "sentence:2",
      questionType: "fill-in-the-gap",
      questionSubtype: "fg-word-order"
    })
  ]);

  const selectedKeys = plan.selectedCandidates.map((candidate) => `${candidate.sourceKey}:${candidate.questionSubtype}`);
  const uniqueKeys = new Set(selectedKeys);

  assert.equal(selectedKeys.length, uniqueKeys.size);
  assert.equal(
    plan.selectedCandidates.filter(
      (candidate) => candidate.sourceKey === "sentence:1" && candidate.questionSubtype === "fg-word-order"
    ).length,
    1
  );
});

test("createLessonQuestionSelectionState schedules subtype coverage across core lessons", () => {
  const state = createLessonQuestionSelectionState({
    lessons: [
      { lessonKey: "lesson-1", lessonMode: "core" },
      { lessonKey: "lesson-2", lessonMode: "core" },
      { lessonKey: "lesson-3", lessonMode: "core" },
      { lessonKey: "lesson-4", lessonMode: "core" }
    ]
  });

  const plannedLessons = Array.from(state.lessonPlans.values()).sort((left, right) => left.lessonIndex - right.lessonIndex);
  const requiredSubtypeKeys = plannedLessons.flatMap((lesson) =>
    [1, 2, 3].flatMap((stage) =>
      lesson.stageRequirements[stage as 1 | 2 | 3].map(
        (requirement) => `${requirement.stage}:${requirement.sourceGroup}:${requirement.questionSubtype}`
      )
    )
  );

  assert.equal(plannedLessons.length, 4);
  assert.ok(requiredSubtypeKeys.includes("2:sentence:mc-select-translation"));
  assert.ok(requiredSubtypeKeys.some((key) => key.endsWith(":sentence:fg-word-order")));
  assert.ok(requiredSubtypeKeys.includes("3:sentence:ls-mc-select-translation"));
  assert.ok(requiredSubtypeKeys.includes("2:lesson:mt-match-translation"));
});

test("selectLessonQuestionPlan prioritizes scheduled subtype requirements for the current lesson", () => {
  const selectionState = createLessonQuestionSelectionState({
    lessons: [
      { lessonKey: "lesson-1", lessonMode: "core" },
      { lessonKey: "lesson-2", lessonMode: "core" },
      { lessonKey: "lesson-3", lessonMode: "core" }
    ]
  });
  const lessonPlan = selectionState.lessonPlans.get("lesson-2");
  assert.ok(lessonPlan);

  const stage3Requirements = lessonPlan!.stageRequirements[3];
  const sentenceRequirement = stage3Requirements.find((requirement) => requirement.sourceGroup === "sentence");
  assert.ok(sentenceRequirement);

  const fallbackSubtype =
    sentenceRequirement!.questionSubtype === "fg-word-order" ? "mc-select-translation" : "fg-word-order";
  const questionTypeForRequirement =
    sentenceRequirement!.questionSubtype === "sp-pronunciation-compare"
      ? "speaking"
      : sentenceRequirement!.questionSubtype === "ls-mc-select-translation"
        ? "listening"
        : sentenceRequirement!.questionSubtype === "mc-select-translation"
          ? "multiple-choice"
          : "fill-in-the-gap";

  const plan = selectLessonQuestionPlan(
    [
      makeCandidate({
        stage: 3,
        sourceGroup: "sentence",
        sourceKey: "sentence:required",
        questionType: questionTypeForRequirement,
        questionSubtype: sentenceRequirement!.questionSubtype
      }),
      makeCandidate({
        stage: 3,
        sourceGroup: "sentence",
        sourceKey: "sentence:fallback",
        questionType: fallbackSubtype === "mc-select-translation" ? "multiple-choice" : "fill-in-the-gap",
        questionSubtype: fallbackSubtype
      })
    ],
    {
      lessonKey: "lesson-2",
      selectionState
    }
  );

  assert.equal(plan.selectedCandidates[0]?.questionSubtype, sentenceRequirement!.questionSubtype);
});

test("a lesson that introduces one item still fills its stages", () => {
  // The pacing the curriculum uses is one new item per lesson. The per-item limits used to
  // stop at 2 questions in stage 1 and 1 in stage 3, so such a lesson ended at ~13 blocks
  // no matter how many sentences it had. It should now draw more from the single item and
  // from a fourth sentence in stage 3.
  const targetSubtypes: Record<1 | 2 | 3, string[]> = {
    1: ["mc-select-translation", "ls-mc-select-translation", "fg-letter-order", "sp-pronunciation-compare"],
    2: ["mc-select-context-response", "mc-select-missing-word", "mt-match-translation"],
    3: ["ls-mc-select-translation", "sp-pronunciation-compare", "mc-select-translation"]
  };
  const candidates: LessonQuestionCandidate<string>[] = [];
  for (const stage of [1, 2, 3] as const) {
    for (const questionSubtype of targetSubtypes[stage]) {
      candidates.push(
        makeCandidate({
          stage,
          sourceGroup: questionSubtype === "mt-match-translation" ? "lesson" : "target",
          sourceKey: questionSubtype === "mt-match-translation" ? "lesson:all" : "word:ni",
          questionType: questionSubtype.startsWith("ls-") ? "listening" : "multiple-choice",
          questionSubtype
        })
      );
    }
    // Each sentence offers a different exercise in each stage, as generation does: the same
    // source and subtype cannot be selected twice across a lesson.
    const sentenceSubtypes = ["fg-word-order", "ls-fg-gap-fill", "mc-select-translation", "mc-select-missing-word"];
    for (const index of [1, 2, 3, 4]) {
      candidates.push(
        makeCandidate({
          stage,
          sourceGroup: "sentence",
          sourceKey: `sentence:${index}`,
          questionType: stage === 3 ? "listening" : "fill-in-the-gap",
          questionSubtype: sentenceSubtypes[(index + stage) % sentenceSubtypes.length]!
        })
      );
    }
  }

  const plan = selectLessonQuestionPlan(candidates, { lessonKey: "one-item-lesson", lessonMode: "core" });
  const perStage = [1, 2, 3].map(
    (stage) => plan.selectedCandidates.filter((candidate) => candidate.stage === stage).length
  );
  const fromTheItem = plan.selectedCandidates.filter((candidate) => candidate.sourceKey === "word:ni").length;

  assert.ok(perStage[0] >= 3, `stage 1 should hold at least 3 questions, got ${perStage[0]}`);
  // Stage 3 takes what the per-sentence cap leaves: each sentence may carry at most two
  // exercises in a lesson, so by stage 3 some sentences are already spent. The cap is
  // deliberate -- it stops one sentence being drilled while another goes unused.
  assert.ok(perStage[2] >= 3, `stage 3 should hold at least 3 questions, got ${perStage[2]}`);
  assert.ok(fromTheItem >= 5, `the single new item should carry at least 5 questions, got ${fromTheItem}`);
  assert.ok(
    plan.selectedCandidates.length >= 12,
    `a one-item lesson should reach at least 12 questions, got ${plan.selectedCandidates.length}`
  );
});

test("a core lesson that introduces nothing is still a full lesson", () => {
  // Roughly twenty Yoruba lessons teach a phrase that is only its parts joined, and their
  // units hold no spare word to put in its place. Such a lesson stays core and drills its
  // unit's sentences -- but the allowances reserved for a new item would go unclaimed, so it
  // would ship at about nine blocks while its neighbours ship fifteen.
  const sentenceSubtypes = ["fg-word-order", "ls-fg-gap-fill", "mc-select-translation", "mc-select-missing-word"];
  const candidates: LessonQuestionCandidate<string>[] = [];
  for (const stage of [1, 2, 3] as const) {
    for (const index of [1, 2, 3, 4]) {
      for (const [offset, subtype] of sentenceSubtypes.entries()) {
        candidates.push(
          makeCandidate({
            stage,
            sourceGroup: "sentence",
            sourceKey: `sentence:${index}`,
            questionType: subtype.startsWith("ls-") ? "listening" : "fill-in-the-gap",
            questionSubtype: sentenceSubtypes[(offset + stage + index) % sentenceSubtypes.length]!
          })
        );
      }
    }
  }

  const plan = selectLessonQuestionPlan(candidates, { lessonKey: "targetless-lesson", lessonMode: "core" });
  const perSentence = new Map<string, number>();
  for (const candidate of plan.selectedCandidates) {
    perSentence.set(candidate.sourceKey, (perSentence.get(candidate.sourceKey) || 0) + 1);
  }

  assert.ok(
    plan.selectedCandidates.length >= 11,
    `a targetless lesson should still reach at least 11 questions, got ${plan.selectedCandidates.length}`
  );
  assert.equal(perSentence.size, 4, `all four sentences should be used, used ${perSentence.size}`);
  // Three, not two: with no target to carry the lesson the sentences must, but a fourth
  // exercise on one sentence would be drilling it rather than teaching the combination.
  for (const [sourceKey, count] of perSentence) {
    assert.ok(count <= 3, `${sourceKey} used ${count} times, more than three`);
  }
});

test("a lesson with no target may close on two sentence exercises per kind; one with a target still gets one", () => {
  // Stage 3 takes one sentence exercise per kind -- speaking, listening, meaning-or-order --
  // so it does not become three listening drills. A lesson with a card fills the rest of the
  // stage from its target; a lesson with none has only its sentences and sat at exactly three.
  const stage3 = (withTarget: boolean): LessonQuestionCandidate<string>[] => {
    const candidates: LessonQuestionCandidate<string>[] = [];
    if (withTarget) {
      candidates.push(
        makeCandidate({ stage: 1, sourceGroup: "target", sourceKey: "word:x", questionType: "multiple-choice", questionSubtype: "mc-select-translation" })
      );
    }
    for (const index of [1, 2, 3, 4]) {
      candidates.push(
        makeCandidate({ stage: 3, sourceGroup: "sentence", sourceKey: `sentence:${index}`, questionType: "listening", questionSubtype: "ls-mc-select-translation" }),
        makeCandidate({ stage: 3, sourceGroup: "sentence", sourceKey: `sentence:${index}`, questionType: "speaking", questionSubtype: "sp-pronunciation-compare" }),
        makeCandidate({ stage: 3, sourceGroup: "sentence", sourceKey: `sentence:${index}`, questionType: "multiple-choice", questionSubtype: "mc-select-translation" })
      );
    }
    return candidates;
  };
  const stage3Count = (withTarget: boolean) =>
    selectLessonQuestionPlan(stage3(withTarget), { lessonKey: `bucket-${withTarget}`, lessonMode: "core" }).selectedCandidates.filter(
      (candidate) => candidate.stage === 3 && candidate.sourceGroup === "sentence"
    ).length;

  assert.equal(stage3Count(true), 3, "with a target, stage 3 keeps one sentence exercise per kind");
  assert.ok(stage3Count(false) >= 5, `without a target, stage 3 should reach at least five, got ${stage3Count(false)}`);
});

test("a lesson that only reviews a word is treated as introducing nothing, and its stage 1 is unchanged", () => {
  // A reviewed word yields stage-2 and stage-3 drafts in the target group but no stage-1 card
  // question. Counting those as "has a target" put every lesson that reviewed anything on the
  // targeted limits, so the targetless limits never reached a real lesson: 45 lessons with no
  // card sat at nine exercises. Being targetless shows in stage 3 -- two sentence exercises
  // per kind rather than one -- while stage 1 stays exactly as a lesson with a card opens.
  const candidates: LessonQuestionCandidate<string>[] = [
    makeCandidate({ stage: 2, sourceGroup: "target", sourceKey: "word:reviewed", questionType: "multiple-choice", questionSubtype: "mc-select-missing-word" }),
    makeCandidate({ stage: 3, sourceGroup: "target", sourceKey: "word:reviewed", questionType: "listening", questionSubtype: "ls-mc-select-translation" })
  ];
  for (const index of [1, 2, 3, 4]) {
    candidates.push(
      makeCandidate({ stage: 1, sourceGroup: "sentence", sourceKey: `sentence:${index}`, questionType: "fill-in-the-gap", questionSubtype: "fg-word-order" }),
      makeCandidate({ stage: 3, sourceGroup: "sentence", sourceKey: `sentence:${index}`, questionType: "listening", questionSubtype: "ls-mc-select-translation" }),
      makeCandidate({ stage: 3, sourceGroup: "sentence", sourceKey: `sentence:${index}`, questionType: "speaking", questionSubtype: "sp-pronunciation-compare" }),
      makeCandidate({ stage: 3, sourceGroup: "sentence", sourceKey: `sentence:${index}`, questionType: "multiple-choice", questionSubtype: "mc-select-translation" })
    );
  }

  const plan = selectLessonQuestionPlan(candidates, { lessonKey: "reviews-only", lessonMode: "core" });
  const stage1 = plan.selectedCandidates.filter((candidate) => candidate.stage === 1).length;
  const stage3Sentences = plan.selectedCandidates.filter(
    (candidate) => candidate.stage === 3 && candidate.sourceGroup === "sentence"
  ).length;

  assert.equal(stage1, 2, `stage 1 should open with two sentence exercises, as any lesson does, got ${stage1}`);
  assert.ok(stage3Sentences >= 5, `a lesson with no card should close on more than three sentence exercises, got ${stage3Sentences}`);
});

test("every sentence in a lesson gets used, and none is drilled to death", () => {
  // A four-sentence lesson spent three exercises on one sentence and never touched the
  // fourth, because a core lesson had no per-source cap.
  const sentenceSubtypes = ["fg-word-order", "ls-fg-gap-fill", "mc-select-translation", "mc-select-missing-word"];
  const candidates: LessonQuestionCandidate<string>[] = [];
  for (const stage of [1, 2, 3] as const) {
    candidates.push(
      makeCandidate({
        stage,
        sourceGroup: "target",
        sourceKey: "word:ni",
        questionType: "multiple-choice",
        questionSubtype: stage === 1 ? "mc-select-translation" : stage === 2 ? "mc-select-missing-word" : "fg-letter-order"
      })
    );
    for (const index of [1, 2, 3, 4]) {
      for (const [offset, subtype] of sentenceSubtypes.entries()) {
        candidates.push(
          makeCandidate({
            stage,
            sourceGroup: "sentence",
            sourceKey: `sentence:${index}`,
            questionType: subtype.startsWith("ls-") ? "listening" : "fill-in-the-gap",
            questionSubtype: sentenceSubtypes[(offset + stage + index) % sentenceSubtypes.length]!
          })
        );
      }
    }
  }

  const plan = selectLessonQuestionPlan(candidates, { lessonKey: "four-sentence-lesson", lessonMode: "core" });
  const perSentence = new Map<string, number>();
  for (const candidate of plan.selectedCandidates) {
    if (candidate.sourceGroup !== "sentence") continue;
    perSentence.set(candidate.sourceKey, (perSentence.get(candidate.sourceKey) || 0) + 1);
  }

  assert.equal(perSentence.size, 4, `all four sentences should be used, used ${perSentence.size}`);
  for (const [sourceKey, count] of perSentence) {
    assert.ok(count <= 2, `${sourceKey} used ${count} times, more than twice`);
  }
});
