# AI Curriculum Pipeline Todo

## 1. Build Multi-Agent Curriculum System

### Agent A: Curriculum Architect
Purpose:
- Decide which grammar points, vocabulary, and communicative goals belong in each unit.
- Ensure logical progression across the full course.
- Align the curriculum to CEFR targets such as `A1` and `A2`.

Responsibilities:
- Define unit-by-unit learning progression.
- Assign grammar focus, vocabulary scope, and communicative intent to each unit.
- Prevent poor sequencing, overlap, and premature difficulty jumps.

Deliverables:
- Unit plan for the full course.
- Grammar progression map.
- Vocabulary progression map.
- CEFR alignment per unit.

### Agent B: Content Generator
Purpose:
- Generate lesson content from the approved unit plan.

Responsibilities:
- Generate:
  - sentences
  - translations
  - exercise types
  - supporting lesson content
- Follow the project’s JSON schema strictly.
- Stay inside the scope defined by Agent A.

Deliverables:
- Schema-valid lesson content payloads.
- Unit content drafts ready for review.

### Agent C: Critic / QA Agent
Purpose:
- Review Agent B output before persistence.

Responsibilities:
- Validate schema compliance.
- Detect repetitive or low-value content.
- Check difficulty against the assigned unit level.
- Flag weak progression, shallow duplication, or invalid outputs.

Deliverables:
- Structured QA report.
- Error list with severity and recommended fixes.

### Agent D: Refiner
Purpose:
- Repair outputs rejected by the Critic.

Responsibilities:
- Fix schema issues.
- Rewrite repetitive or overly difficult content.
- Preserve the intended unit scope while correcting errors.

Deliverables:
- Corrected content payloads ready for final save.

---

## 2. Add CEFR-Aware Course Generation

### Goal
Integrate CEFR progression into course generation and prompt design using the currently supported chapter levels.

### Tasks
- Map existing chapter levels to CEFR bands.
- Update generation prompts to include CEFR expectations.
- Define allowed difficulty range per chapter and unit.
- Ensure grammar, vocabulary, and sentence complexity align with CEFR targets.

### Acceptance Criteria
- Each generated chapter/unit has CEFR-aware progression.
- Prompting explicitly references the correct CEFR target.
- QA can detect content that exceeds the expected level.

---

## 3. Create Context Architecture

### Goal
Design a structured context system for generation, review, and refinement.

### Tasks
- Define what context each agent receives.
- Separate:
  - curriculum memory
  - unit memory
  - lesson memory
  - learner-facing generation context
- Standardize context payloads for all generation flows.
- Ensure context supports:
  - progression
  - repetition
  - review
  - anti-duplication

### Acceptance Criteria
- Agents receive explicit, minimal, structured context.
- Context inputs are reusable across generation flows.
- Curriculum memory is available without bloated prompts.

---

## 4. Create Caching Systems

### Goal
Reduce repeated cost and latency in AI generation.

### Tasks
- Add Gemini context caching for large stable prompt prefixes.
- Define which flows are worth caching:
  - unit planning
  - refactor planning
  - lesson suggestion
- Add cache key strategy based on:
  - model
  - stable context
  - language
  - level
- Add cache invalidation / TTL policy.

### Acceptance Criteria
- Stable planning prompts reuse cached context.
- Repeated planning/refactor calls become cheaper and faster.
- Cache behavior is observable and debuggable.

---

## Implementation Order

1. Create context architecture.
2. Add CEFR-aware progression rules.
3. Build Agent A and Agent B.
4. Build Agent C and Agent D.
5. Add caching systems.
6. Integrate the full pipeline into course generation.

---

## Notes
- Repetition should remain deliberate and pedagogically useful.
- Avoid shallow duplication, not reinforcement.
- The agent layer should orchestrate existing structured generation services, not replace them with uncontrolled free-form generation.
