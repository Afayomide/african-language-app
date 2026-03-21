# Production Readiness: Review And Speaking

This is the current production-readiness checklist for the review and speaking systems.

## Critical

### 1. `lesson.kind` migration
- Existing lessons need `kind` backfilled to `core` or `review`.
- Right now old lessons will default to `core`, which can misclassify existing review lessons.

### 2. Server-trusted learner performance
- Current personalized review signals come from FE stage-completion payload.
- That is not strong enough for production because the client can lie.
- Production version should persist answer results server-side from real answer submissions, or validate the payload much more tightly.

### 3. Review snapshot policy
- Personalized review is currently assembled on read.
- That means the same review lesson can change depending on when the learner opens it.
- Decide one of these:
  - snapshot the personalized first stage when lesson 2 is completed
  - or accept dynamic recomputation and make it deterministic

### 4. Dashboard / next-lesson consistency
- Review must be the next lesson everywhere:
  - dashboard
  - overview
  - completion flow
  - resume flow
- Most of this is aligned now, but it needs explicit end-to-end verification.

## Data / Model

### 5. Learner attempt model
- `LearnerContentPerformance` is a summary table.
- For production, add raw attempt events or per-question attempt records for debugging and recalculation.

### 6. Backfill script
- Backfill `lesson.kind`.
- Optionally seed `LearnerContentPerformance` from existing progress if continuity matters.

### 7. Retention / growth policy
- `LearnerContentPerformance` grows per user/content pair.
- Add limits or archival rules if needed.

## Speaking

### 8. Accepted tutor-audio coverage
- Speaking review only works well if content has accepted human reference audio.
- Add a clear publish gate and coverage report.

### 9. Backfill old accepted tutor audio analysis
- Existing accepted tutor recordings need analysis populated or speaking questions will be inconsistent.

### 10. Speaking calibration
- DTW score thresholds need real data tuning:
  - `excellent`
  - `good`
  - `fair`
  - `poor`
- Without calibration, the feature works technically but not pedagogically.

### 11. Persist learner speaking attempts
- Production should store:
  - learner recording
  - score
  - feedback
  - timestamp
- Otherwise you lose auditability and progress trends.

## Testing

### 12. End-to-end tests
Cover these cases:
- after 2 core lessons, next lesson is review
- struggled learner gets personalized first-stage review blocks
- non-struggled learner gets plain review lesson
- review button points to the right lesson
- reopening the same review lesson behaves consistently
- speaking questions fail gracefully without reference audio

### 13. Regression tests around generation
- review lessons inserted after every 2 core lessons
- `lesson.kind` persisted correctly
- refactor/regenerate preserve review sequencing

## Operational

### 14. Feature flag
- Put personalized review behind a flag until real-user testing is done.

### 15. Observability
- Log:
  - personalized review generated
  - weak items selected
  - fallback used
  - speaking compare failures
  - missing tutor audio
- Without this, debugging will be slow.

### 16. Rate limiting / abuse controls
- Especially for pronunciation compare and repeated lesson-flow requests.

## UX

### 17. Explainability
- The learner should understand why the review contains certain items.
- Keep it short:
  - "Based on the last two lessons"
  - "Focused on items you missed"

### 18. Preserve the old review affordance
- Keep the existing review button.
- It should point to the actual next review lesson, not a separate side path.

## Minimum Production Checklist

If only the highest-value items are done first:

1. migrate `lesson.kind`
2. stop trusting FE-only struggle payloads as the long-term source of truth
3. add raw learner attempt persistence
4. calibrate speaking thresholds
5. add E2E tests for review sequencing
6. backfill tutor audio analysis
7. add logs and a feature flag

## Current Status

Current system status:
- strong prototype
- not production-ready yet

Main reason:
- the core flow works, but data trust, consistency, calibration, and operational safety are not finished yet.
