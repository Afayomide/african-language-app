# Refactor Architecture

This document explains the current refactor system for lessons and units.

It covers:
- what `refactor` means in this codebase
- how unit-level and lesson-level refactor differ from `regenerate`
- the backend architecture
- the frontend flow
- the allowed AI operations
- how phrase replacement works
- known limits and current caveats

## 1. Terms

### Regenerate
`Regenerate` is the destructive path.

It clears the old lesson content in a unit and rebuilds the unit from scratch.

Implementation:
- `BE/src/application/use-cases/admin/lesson-ai/AdminUnitAiContentUseCases.ts`
- method: `revise(...)` when `mode === "regenerate"`

### Refactor
`Refactor` is the non-destructive targeted-edit path.

It does **not** clear the unit.
It asks AI to propose precise edits and then applies those edits through a constrained patch engine.

Implementation:
- planner: `BE/src/services/llm/geminiClient.ts`, `BE/src/services/llm/openaiClient.ts`
- application: `BE/src/application/services/LessonRefactorService.ts`
- orchestration: `BE/src/application/use-cases/admin/lesson-ai/AdminUnitAiContentUseCases.ts`

## 2. High-Level Design

The system is split into two layers.

### Unit-level orchestration
Used when the user clicks `Refactor Unit`.

Responsibilities:
- gather the existing lesson snapshot for the unit
- ask the LLM for a structured refactor plan
- validate that plan
- apply lesson patches one lesson at a time
- optionally add new lessons if the requested lesson count is higher than the current lesson count

Main file:
- `BE/src/application/use-cases/admin/lesson-ai/AdminUnitAiContentUseCases.ts`

### Lesson-level patch engine
Used internally by both unit refactor and lesson refactor.

Responsibilities:
- apply deterministic operations to a single lesson
- update lesson stages and blocks
- remove or add phrase bundles
- create or delete related question records
- sync Stage 1 phrase introductions

Main file:
- `BE/src/application/services/LessonRefactorService.ts`

This is the core design:
- unit refactor decides **what lessons should change**
- lesson refactor decides **how a specific lesson changes**

That is the correct separation.

## 3. Why The Patch Engine Exists

The system does **not** let AI emit raw lesson JSON or rewrite full stage graphs directly.

Instead, AI is limited to a small set of operations.

Reason:
- raw stage JSON rewrites are too brittle
- they make it easy to break phrase/question consistency
- phrase replacement needs to update related questions too
- stage structure should stay predictable

This is why the patch engine exists.

## 4. Allowed AI Operations

Defined in:
- `BE/src/services/llm/types.ts`

Current allowed operations:

### `add_text_block`
Adds a text block to a stage.

Shape:
```ts
{
  type: "add_text_block";
  stageIndex: number;
  blockIndex?: number;
  content: string;
}
```

Behavior:
- inserts at `blockIndex` if valid
- otherwise appends to the end of the stage

### `move_block`
Moves an existing block from one stage/index to another.

Shape:
```ts
{
  type: "move_block";
  fromStageIndex: number;
  fromBlockIndex: number;
  toStageIndex: number;
  toBlockIndex?: number;
}
```

Behavior:
- removes the block from the source position
- inserts it at the destination position
- all indices are stage/block-array positions

### `remove_block`
Removes a single block by index.

Shape:
```ts
{
  type: "remove_block";
  stageIndex: number;
  blockIndex: number;
}
```

Behavior:
- removes only that one block
- if the removed block is a question block and that question is no longer referenced anywhere in the lesson stages, the question record is soft-deleted

### `add_phrase_bundle`
Adds a phrase to the lesson and creates its standard question bundle.

Shape:
```ts
{
  type: "add_phrase_bundle";
  phraseText: string;
  translations?: string[];
  explanation?: string;
  pronunciation?: string;
}
```

Behavior:
- reuses an existing phrase in the DB if the text already exists
- otherwise creates a new phrase record
- creates the lesson question bundle for that phrase
- stage placement depends on whether the phrase is new to the learner or previously introduced elsewhere

### `replace_phrase_bundle`
Replaces one phrase bundle with another.

Shape:
```ts
{
  type: "replace_phrase_bundle";
  oldPhraseText: string;
  newPhraseText: string;
  translations?: string[];
  explanation?: string;
  pronunciation?: string;
}
```

Behavior:
- removes the old phrase bundle from the lesson
- resolves or creates the new phrase
- rebuilds the new phrase bundle using the new phrase's introduction status

### `remove_phrase_bundle`
Removes a phrase from the lesson together with its related question bundle.

Shape:
```ts
{
  type: "remove_phrase_bundle";
  phraseText: string;
}
```

Behavior:
- removes phrase blocks for that phrase in the lesson
- removes question blocks for question records tied to that phrase in the lesson
- soft-deletes those question records
- removes the lesson id from the phrase's `lessonIds`
- removes the lesson id from the phrase's `introducedLessonIds`

## 5. Phrase Bundles

A `phrase bundle` is the phrase plus the standard generated question set built from that phrase.

The system treats phrase replacement as a bundle operation because replacing only the phrase block would leave broken or stale question blocks behind.

Current bundle question generation logic lives in:
- `BE/src/application/services/LessonRefactorService.ts`
- function: `buildQuestionDrafts(...)`

This is the same lesson-question logic used by AI lesson generation.

## 6. Introduction Status Rules

Phrase introduction history is tracked in:
- `Phrase.introducedLessonIds`

Relevant files:
- `BE/src/models/Phrase.ts`
- `BE/src/domain/entities/Phrase.ts`
- `BE/src/application/services/PhraseIntroductionService.ts`

### Rule
When a phrase is added or replaced into a lesson, the system checks whether that phrase was introduced before this lesson.

Helper:
- `wasPhraseIntroducedBeforeLesson(...)`
- `BE/src/application/services/PhraseIntroductionService.ts`

### If the phrase was introduced before this lesson
The phrase is treated as **review**.

Effect:
- no Stage 1 intro bundle
- no Stage 1 phrase-teaching block
- only later-stage review-style questions are generated

### If the phrase was not introduced before this lesson
The phrase is treated as **new**.

Effect:
- Stage 1 intro flow is generated
- Stage 1 phrase-teaching block can appear
- the fuller teaching bundle is generated

### Stage 1 sync
After patch application, Stage 1 phrase blocks are synced back into `introducedLessonIds`.

Implementation:
- `PhraseIntroductionService.syncStageOneIntroductions(...)`

## 7. Phrase Matching Rules

Phrase bundle removal and replacement currently use normalized text matching:
- trim
- lowercase

Implementation:
- `normalizeText(...)`
- `BE/src/application/services/LessonRefactorService.ts`

This means:
- matching is case-insensitive
- matching is **not** fuzzy
- matching does **not** strip tone marks or rewrite variants

So if the AI refers to the wrong spelling variant, the removal can miss.

This is an important current limitation.

## 8. Unit Refactor Flow

Entry point:
- `POST /admin/ai/units/:unitId/revise`
- `POST /tutor/ai/units/:unitId/revise`
- with payload `{ mode: "refactor", ... }`

Controller files:
- `BE/src/controllers/admin/lessonAi.controller.ts`
- `BE/src/controllers/tutor/ai.controller.ts`

### Flow
1. Load the unit and current lessons.
2. Build an `existingLessonsSnapshot` string.
3. Call `llm.planUnitRefactor(...)`.
4. Validate the refactor plan.
5. Apply per-lesson patches through `LessonRefactorService`.
6. If the requested lesson count is greater than the current lesson count, create any `newLessons` returned by the plan.
7. Save `unit.lastAiRun`.

Planner method:
- `AdminUnitAiContentUseCases.getValidatedUnitRefactorPlan(...)`

Plan validation:
- `validateUnitRefactorPlan(...)`
- same file

### Unit refactor input notes
The unit refactor payload still accepts:
- `lessonCount`
- `phrasesPerLesson`
- `reviewPhrasesPerLesson`
- `proverbsPerLesson`
- `topics`
- `extraInstructions`

Important nuance:
- for **existing lessons**, targeted refactor does not use phrase-count budgets to drive edits
- those count fields mainly matter when the refactor plan adds **new lessons**

## 9. Lesson Refactor Flow

Entry points:
- `POST /admin/ai/lessons/:lessonId/refactor`
- `POST /tutor/ai/lessons/:lessonId/refactor`

Controller files:
- `BE/src/controllers/admin/lessonAi.controller.ts`
- `BE/src/controllers/tutor/ai.controller.ts`

Main use case:
- `AdminUnitAiContentUseCases.refactorLesson(...)`

### Lesson refactor payload
Current lesson-level payload is intentionally small:

```json
{
  "topic": "optional",
  "extraInstructions": "optional"
}
```

Why:
- lesson refactor is for local fixes
- it should be driven by targeted instructions, not by bulk lesson-generation budgets

### Flow
1. Load the lesson.
2. Load its unit for context.
3. Build a snapshot for just that one lesson.
4. Call the same `planUnitRefactor(...)` LLM method with exactly one lesson in scope.
5. Extract the patch for that lesson.
6. Apply it with `LessonRefactorService.applyPatchPlan(...)`.
7. Save a `lastAiRun` summary on the unit.

If the planner returns no operations for the lesson:
- the request succeeds
- the lesson is treated as unchanged

## 10. LLM Contract

LLM types live in:
- `BE/src/services/llm/types.ts`

Relevant types:
- `LlmLessonRefactorOperation`
- `LlmLessonRefactorPatch`
- `LlmUnitRefactorPlan`

LLM client implementations:
- `BE/src/services/llm/geminiClient.ts`
- `BE/src/services/llm/openaiClient.ts`

Planner method:
- `planUnitRefactor(...)`

The planner returns:
- `lessonPatches`
- `newLessons`

It does **not** return raw lesson stages.

## 11. How Existing Lesson Snapshots Are Built

Snapshot builder:
- `AdminUnitAiContentUseCases.buildExistingLessonsSnapshot(...)`

It includes:
- lesson id
- lesson title
- lesson description
- lesson phrases with a simple intro/review tag
- stages
- per-stage blocks
- block indexes
- question subtype summaries

This snapshot is what the LLM sees when it decides how to patch lessons.

### Block indexing
The current snapshot uses stage order indexes and block array indexes.

Important:
- stage indexes are `0`, `1`, `2`
- block indexes are also zero-based array positions

This matters for:
- `move_block`
- `remove_block`
- `add_text_block` insertion

## 12. Frontend Architecture

### Unit refactor pages
- `adminFE/src/app/(dashboard)/units/[id]/page.tsx`
- `tutorFE/src/app/(dashboard)/units/[id]/page.tsx`

These pages call:
- `aiService.reviseUnitContent(...)`

### Lesson refactor pages
- `adminFE/src/app/(dashboard)/lessons/[id]/page.tsx`
- `tutorFE/src/app/(dashboard)/lessons/[id]/page.tsx`

These pages call:
- `aiService.refactorLessonContent(...)`

### Next.js proxy routes
Admin:
- `adminFE/src/app/api/admin/ai/units/[unitId]/revise/route.ts`
- `adminFE/src/app/api/admin/ai/lessons/[lessonId]/refactor/route.ts`

Tutor:
- `tutorFE/src/app/api/tutor/ai/units/[unitId]/revise/route.ts`
- `tutorFE/src/app/api/tutor/ai/lessons/[lessonId]/refactor/route.ts`

## 13. Persistence and Audit Trail

The latest AI run summary is stored on the unit.

Model and mapping:
- `BE/src/models/Unit.ts`
- `BE/src/domain/entities/Unit.ts`
- `BE/src/infrastructure/db/mongoose/repositories/MongooseUnitRepository.ts`

This means:
- unit refactor updates `lastAiRun`
- lesson refactor also updates the parent unit's `lastAiRun`

Current behavior:
- only the latest run is persisted
- there is no full multi-run history collection yet

## 14. Current Limitations

These are real implementation limits right now.

### Exact phrase text matching only
Phrase removal/replacement is not fuzzy.

If AI refers to the wrong spelling or variant:
- the target phrase may not be found

### No explicit proverb patch operations
The patch engine currently does not support:
- `add_proverb_block`
- `replace_proverb`
- `remove_proverb`

Unit and lesson refactor are currently stronger for:
- text blocks
- block movement
- phrase replacement

### Phrase bundle placement is system-driven
When you add or replace a phrase bundle:
- the system decides which stages receive the generated bundle
- the current implementation appends those new blocks to the end of the relevant stage
- there is no direct `insert_phrase_bundle_at_block_index` operation yet

### Generic block removal is intentionally dumb
`remove_block` removes one block.

It does **not** try to interpret whether that block was part of a larger phrase bundle.

If the intent is phrase-level cleanup, use:
- `remove_phrase_bundle`
- or `replace_phrase_bundle`

### No raw stage rewrite
This is intentional.

The system does not let AI:
- rewrite arbitrary stage JSON
- re-emit the whole lesson graph

That is a safety decision.

## 15. Recommended Usage

### Use lesson refactor for local fixes
Good examples:
- replace one bad phrase
- remove one phrase bundle
- add a short clarification text
- move one listening block to Stage 3

### Use unit refactor for sequence-level changes
Good examples:
- split a unit across clearer lessons
- reassign subtopics across lessons
- add a new lesson to cover a missing area
- clean up repeated lesson focus across a unit

This is the best-practice split.

## 16. Good Prompt Examples

### Lesson refactor
```text
Remove the entire phrase bundle for "Mo jíire" from this lesson.
Add a short Stage 1 text block after the phrase introductions explaining the difference between "Káàárọ̀" and "Ẹ káàárọ̀".
Do not add unrelated phrases or blocks.
```

### Lesson refactor, phrase replacement
```text
Replace the phrase bundle for "Kú ọ̀sán" with "Ẹ káàsán".
Treat the new phrase as standard Yoruba.
Do not change the rest of the lesson.
```

### Unit refactor
```text
Keep the unit structure, but fix overlap.
Lesson 1 should focus on morning greetings.
Lesson 2 should focus on afternoon greetings.
Lesson 3 should focus on evening and night greetings.
Replace non-standard variants where needed.
Add short text explanations only where they clarify formal vs informal usage.
```

## 17. Testing Checklist

When testing refactor, verify all of these:

### Lesson refactor
- the lesson still opens normally
- phrase replacement removed old phrase questions
- the new phrase appears in the expected stages
- Stage 1 introduction behavior matches the new phrase's history
- no broken question refs appear in audit

### Unit refactor
- AI returns distinct lesson patches
- no existing lessons are silently cleared
- new lessons are only created when requested
- `lastAiRun` updates on the unit page

### Phrase history
- if a phrase is newly introduced in Stage 1, `introducedLessonIds` is updated
- if a phrase bundle is removed from a lesson, the current lesson id is removed from `introducedLessonIds`

## 18. File Map

### Core backend
- `BE/src/application/use-cases/admin/lesson-ai/AdminUnitAiContentUseCases.ts`
- `BE/src/application/services/LessonRefactorService.ts`
- `BE/src/application/services/PhraseIntroductionService.ts`
- `BE/src/services/llm/types.ts`
- `BE/src/services/llm/geminiClient.ts`
- `BE/src/services/llm/openaiClient.ts`

### Admin backend routes/controllers
- `BE/src/controllers/admin/lessonAi.controller.ts`
- `BE/src/routes/admin/lessonAi.routes.ts`

### Tutor backend routes/controllers
- `BE/src/controllers/tutor/ai.controller.ts`
- `BE/src/routes/tutor/ai.routes.ts`

### Admin frontend
- `adminFE/src/app/(dashboard)/units/[id]/page.tsx`
- `adminFE/src/app/(dashboard)/lessons/[id]/page.tsx`
- `adminFE/src/services/ai.service.ts`
- `adminFE/src/lib/apiRoutes.ts`

### Tutor frontend
- `tutorFE/src/app/(dashboard)/units/[id]/page.tsx`
- `tutorFE/src/app/(dashboard)/lessons/[id]/page.tsx`
- `tutorFE/src/services/ai.service.ts`
- `tutorFE/src/lib/apiRoutes.ts`

## 19. Summary

The current refactor system is:
- AI-planned
- backend-validated
- lesson-level in application
- unit-level in orchestration
- deterministic in execution
- intentionally narrower than full regeneration

That is the current architecture.
