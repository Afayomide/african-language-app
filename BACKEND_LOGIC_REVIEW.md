# Backend Logic Review

I focused on learner progression, dashboard state, and the curriculum-agent path.

## Findings

### 1. High: Lesson progression ordering ignores chapter order
Both learner overview and next-lesson selection sort lessons only by `unit.orderIndex` and `lesson.orderIndex`. If unit indexes reset per chapter, lessons from later chapters can be interleaved before earlier chapters are finished. That will skew `nextLesson`, chapter progress, and unlock flow.

Refs:
- `BE/src/application/use-cases/learner/dashboard/LearnerDashboardUseCases.ts:96`
- `BE/src/application/use-cases/learner/dashboard/LearnerDashboardUseCases.ts:174`
- `BE/src/application/use-cases/learner/lesson/LearnerLessonUseCases.ts:367`
- `BE/src/application/use-cases/learner/lesson/LearnerLessonUseCases.ts:1502`
- `BE/src/infrastructure/db/mongoose/repositories/MongooseUnitRepository.ts:116`
- `BE/src/infrastructure/db/mongoose/repositories/MongooseUnitRepository.ts:220`

### 2. High: Dashboard stats have conflicting sources of truth
`totalXp` and `completedLessonsCount` are taken as `Math.max(storedState, recomputedFromProgress)`, so stale state never self-corrects downward. Achievements are worse: once `languageState.achievements` is non-empty, the dashboard stops deriving `"On Fire"` and `"Perfect Score"`, but lesson completion currently only persists `"First Step"`. Result: badge state can freeze.

Refs:
- `BE/src/application/use-cases/learner/dashboard/LearnerDashboardUseCases.ts:215`
- `BE/src/application/use-cases/learner/dashboard/LearnerDashboardUseCases.ts:221`
- `BE/src/application/use-cases/learner/lesson/LearnerLessonUseCases.ts:1757`

### 3. High: The agent now consumes the manual unit preview, but still validates it with shell-planner expectations
The agent converts `previewGeneratePlan().lessonSequence` into a checkpoint plan, but manual preview can auto-insert review lessons. The critic still compares that sequence against a fixed requested count of `4` as if it were a plain shell plan. Valid manual plans can therefore fail just because they include review lessons.

Refs:
- `BE/src/application/services/CurriculumBuildAgentService.ts:651`
- `BE/src/application/services/CurriculumBuildAgentService.ts:691`
- `BE/src/application/services/CurriculumCriticService.ts:275`
- `BE/src/application/use-cases/admin/lesson-ai/AdminUnitAiContentUseCases.ts:857`

### 4. High: The agent creates lesson shells, then regeneration immediately deletes and recreates them
After `lesson_shells` are persisted, the agent calls `regenerateFromApprovedPlan()`, which clears all unit lessons before rebuilding. That makes shell lesson IDs stale and creates a failure window where the unit can be left empty or partially rebuilt.

Refs:
- `BE/src/application/services/CurriculumBuildAgentService.ts:762`
- `BE/src/application/services/CurriculumBuildAgentService.ts:804`
- `BE/src/application/services/CurriculumBuildAgentService.ts:834`
- `BE/src/application/use-cases/admin/lesson-ai/AdminUnitAiContentUseCases.ts:4030`

### 5. High: Agent retries are not isolated; they reuse old shells by title
Chapter, unit, and lesson shell creation all resolve existing records purely by normalized title. A new job can silently attach to an old draft or mismatched prior run instead of creating a clean shell. That makes retries and concurrent jobs non-deterministic.

Refs:
- `BE/src/application/services/CurriculumBuildAgentService.ts:443`
- `BE/src/application/services/CurriculumBuildAgentService.ts:451`
- `BE/src/application/services/CurriculumBuildAgentService.ts:590`
- `BE/src/application/services/CurriculumBuildAgentService.ts:595`
- `BE/src/application/services/CurriculumBuildAgentService.ts:762`
- `BE/src/application/services/CurriculumBuildAgentService.ts:767`

### 6. Medium: The architect accepts partial output instead of retrying until the requested count is met
`generateAcceptedChapters()` breaks as soon as it gets any accepted chapters, not the full requested count. That pushes a planner failure into critic/refiner instead of keeping it inside the architect retry loop.

Refs:
- `BE/src/application/services/CurriculumArchitectService.ts:211`
- `BE/src/application/services/CurriculumArchitectService.ts:238`

### 7. Medium: The refiner can still downgrade quality back to the weaker planner path
Even after moving content generation to the manual flow, `CurriculumRefinerService` still repairs duplicate/shallow-duplicate unit and lesson plans with `CurriculumUnitPlannerService` and `CurriculumLessonPlannerService`, both of which still use `suggestLesson()` plus `validateLessonSuggestion()`.

Refs:
- `BE/src/application/services/CurriculumRefinerService.ts:214`
- `BE/src/application/services/CurriculumRefinerService.ts:242`
- `BE/src/application/services/CurriculumRefinerService.ts:317`
- `BE/src/application/services/CurriculumRefinerService.ts:345`
- `BE/src/application/services/CurriculumUnitPlannerService.ts:167`
- `BE/src/application/services/CurriculumLessonPlannerService.ts:177`

### 8. Medium: Final review does not truly review generated content
`CurriculumCriticService.review()` only inspects chapter, unit, and lesson shell artifacts. Content generation is only represented later as artifact status strings merged into review. So final review knows a content phase failed, but it does not inspect content payload quality itself.

Refs:
- `BE/src/application/services/CurriculumCriticService.ts:343`
- `BE/src/application/services/CurriculumBuildAgentService.ts:974`
- `BE/src/application/services/CurriculumBuildAgentService.ts:1042`

### 9. Medium: The persisted job system still runs synchronously over HTTP
`startCurriculumBuildJob()` calls `startJob()`, and `startJob()` immediately runs the full workflow inline. So this is not a true background job system yet; long runs still block the request and are exposed to timeout and retry behavior.

Refs:
- `BE/src/controllers/admin/curriculumAgent.controller.ts:113`
- `BE/src/application/services/CurriculumBuildAgentService.ts:130`
- `BE/src/application/services/CurriculumBuildAgentService.ts:149`

### 10. Medium: Artifact reads are heavyweight and unbounded
Artifacts store arbitrary `input` and `output` payloads as mixed blobs, and `listByJobId()` returns everything with no projection or pagination. That will degrade quickly as jobs get larger.

Refs:
- `BE/src/models/CurriculumBuildArtifact.ts:33`
- `BE/src/infrastructure/db/mongoose/repositories/MongooseCurriculumBuildArtifactRepository.ts:78`
- `BE/src/controllers/admin/curriculumAgent.controller.ts:190`

### 11. Low: Retry prompts are noisier than they need to be
`buildRetryInstruction()` just joins the first six reasons verbatim. Repeated reasons are not deduped, so retries get bloated and less targeted.

Refs:
- `BE/src/services/llm/aiGenerationLogger.ts:21`

### 12. Low: The lesson-suggestion validator is internally inconsistent right now
Theme-anchor matching is still computed and logged, but it no longer fails validation. So logs look stricter than runtime behavior.

Refs:
- `BE/src/services/llm/outputQuality.ts:607`
- `BE/src/services/llm/outputQuality.ts:642`

## Open Questions

1. Is auto-enrolling on language switch intended?
`updateCurrentLanguage()` will create or mark a language state as enrolled whenever the user switches. If that was meant to be explicit enrollment, this is too permissive.

Ref:
- `BE/src/application/use-cases/learner/dashboard/LearnerDashboardUseCases.ts:404`

2. Are unit `orderIndex` values meant to be chapter-scoped or globally unique per language?
If they are chapter-scoped, finding 1 is definitely a real production bug.

Refs:
- `BE/src/infrastructure/db/mongoose/repositories/MongooseUnitRepository.ts:116`
- `BE/src/infrastructure/db/mongoose/repositories/MongooseUnitRepository.ts:220`

3. Are lesson-shell artifacts supposed to be durable review records or just transient checkpoints?
The current flow treats them as persisted artifacts, then invalidates them immediately by regeneration.

Refs:
- `BE/src/application/services/CurriculumBuildAgentService.ts:804`
- `BE/src/application/use-cases/admin/lesson-ai/AdminUnitAiContentUseCases.ts:4047`

## Test Gaps

- I did not find automated tests around `CurriculumBuildAgentService`, `CurriculumArchitectService`, `LearnerDashboardUseCases`, or `LearnerLessonUseCases`.
- Existing tests under `BE/src/tests` are around question selection, review scheduling, and adaptive review, not multi-language progression or the agent pipeline.
- That means the highest-risk areas here currently have little regression protection.
