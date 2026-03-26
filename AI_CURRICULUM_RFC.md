# RFC: AI Curriculum Generation Pipeline

- Status: Draft
- Authors: Codex
- Last Updated: 2026-03-26
- Target Area: `BE` AI generation stack

## 1. Summary

This RFC proposes a structured AI curriculum-generation pipeline for the language app. The system introduces a multi-agent architecture for curriculum planning, content generation, quality assurance, and refinement. It also adds CEFR-aware planning, a formal context architecture, and caching for repeated planning workloads.

The objective is to improve curriculum quality, progression consistency, and operational efficiency without replacing the existing validated backend generation pipeline.

## 2. Motivation

The current backend generation system is effective for bounded unit and lesson generation, but it remains limited in four areas:

- long-horizon curriculum planning
- explicit CEFR alignment
- structured context reuse across generation runs
- efficient reuse of repeated large planning prompts

If the project is expected to generate larger curriculum segments with stronger pedagogical consistency, these gaps need to be addressed with architecture, not just prompt tuning.

## 3. Goals

### 3.1 Primary Goals
- Introduce a multi-agent orchestration layer for curriculum generation.
- Align chapter and unit generation with CEFR expectations.
- Define a reusable context architecture for all AI generation paths.
- Add caching for large stable prompt prefixes, especially unit-planning workloads.

### 3.2 Secondary Goals
- Preserve existing deterministic validators and generation constraints.
- Improve repetition quality by distinguishing reinforcement from shallow duplication.
- Keep the architecture compatible with the current unit generation pipeline.

## 4. Non-Goals

- Replacing the existing lesson/unit generation services with unconstrained agent output.
- Allowing AI to autonomously publish curriculum without validation.
- Introducing a generic agent framework before bounded use cases are proven.
- Solving all curriculum design problems with embeddings or RAG alone.

## 5. Current State

The backend currently provides:

- unit planning and generation
- regeneration and refactor flows
- output validation and retries
- deterministic question selection and diversity constraints
- runtime curriculum memory retrieval for prior approved curriculum

This is a strong bounded-generation pipeline, but it is not yet a full curriculum orchestration system.

## 6. Proposed Architecture

## 6.1 Multi-Agent System

The system will introduce four bounded agents.

### Agent A: Curriculum Architect
Purpose:
- Define the pedagogical progression of a course segment.

Responsibilities:
- Decide which grammar points, vocabulary scope, communicative goals, and lesson intents belong in each unit.
- Align unit progression to CEFR targets such as `A1` and `A2`.
- Prevent duplicate unit intent and poor sequencing.

Inputs:
- language
- CEFR band / chapter level
- curriculum memory
- explicit product constraints

Outputs:
- chapter plan
- unit plan
- per-unit scope definition
- progression rationale

### Agent B: Content Generator
Purpose:
- Generate lesson content from the approved unit plan.

Responsibilities:
- Generate:
  - sentences
  - translations
  - target content
  - exercise candidates
- Follow the existing JSON schema and backend constraints exactly.
- Stay inside the scope defined by Agent A.

Inputs:
- approved unit plan
- unit context
- lesson context
- curriculum memory

Outputs:
- schema-valid lesson payloads
- draft content ready for QA

### Agent C: Critic / QA Agent
Purpose:
- Evaluate generated content before persistence.

Responsibilities:
- Validate schema integrity.
- Detect repetitive, low-value, or shallow-duplicate content.
- Check if content exceeds the expected difficulty for the unit.
- Flag lesson drift, weak progression, and poor repetition.

Inputs:
- unit plan
- generated content
- CEFR expectations
- curriculum memory

Outputs:
- structured QA report
- issue list with severity and fix recommendations

### Agent D: Refiner
Purpose:
- Repair content rejected by the Critic.

Responsibilities:
- Fix schema errors.
- Rewrite repetitive or overly difficult content.
- Preserve intended lesson scope while correcting issues.

Inputs:
- rejected content
- QA report
- original unit plan

Outputs:
- corrected lesson payloads ready for final save

## 6.2 Orchestration Model

The agent layer should orchestrate existing structured generation services rather than replace them.

Recommended execution order:
1. Curriculum Architect proposes scope.
2. Content Generator creates draft content.
3. Critic evaluates draft content.
4. Refiner repairs failures.
5. Existing backend validators run before persistence.

This keeps the system bounded and auditable.

## 7. CEFR-Aware Course Generation

## 7.1 Problem
The current generation system uses chapter levels, but CEFR alignment is not yet explicit in the generation contract.

## 7.2 Proposal
Add CEFR-awareness to chapter and unit planning.

### Required Work
- Map supported chapter levels to CEFR bands.
- Include CEFR targets in planning prompts.
- Define expected ranges for:
  - vocabulary load
  - grammar complexity
  - sentence complexity
  - communicative task difficulty
- Make QA reject content that exceeds the assigned CEFR target.

### Acceptance Criteria
- Each generated chapter/unit has explicit CEFR alignment.
- Prompting references the expected CEFR band.
- QA detects over-difficult content automatically.

## 8. Context Architecture

## 8.1 Goal
Create a structured context model shared across all AI generation paths.

## 8.2 Context Layers

### Curriculum Memory
Contains approved prior curriculum context such as:
- prior chapters
- prior units
- prior lessons
- introduced words
- introduced expressions
- sentence patterns
- proverbs
- major lesson intents

### Unit Memory
Contains the local context for a unit generation run:
- unit theme
- chapter theme
- existing lessons in unit
- in-unit expressions
- in-unit proverbs
- review source information

### Lesson Memory
Contains lesson-local context:
- prior blocks
- selected targets
- selected review content
- selected question families
- recent repetition state

### Learner-Facing Generation Context
Contains pedagogical and delivery constraints:
- CEFR target
- lesson mode
- supported question families
- stage progression requirements
- repetition rules

## 8.3 Requirements
- Context must be explicit and structured.
- Context should be reused across generate, regenerate, and refactor flows.
- Context must support reinforcement while preventing shallow duplication.

## 9. Caching Systems

## 9.1 Goal
Reduce latency and cost for repeated planning workloads.

## 9.2 Proposal
Add Gemini context caching for large stable planning prefixes.

### Priority Targets
- unit planning
- unit refactor planning
- lesson suggestion / lesson outline planning

### Cache Key Dimensions
- model
- language
- level / CEFR band
- stable curriculum-memory payload
- chapter/unit context

### Cache Policy
- explicit TTL
- invalidation when approved curriculum changes materially
- observable cache hit/miss logging

### Acceptance Criteria
- repeated planning calls reuse cached context
- planning cost and latency decrease measurably
- cache behavior is inspectable in logs

## 10. Data and API Impact

## 10.1 New Backend Concepts
Potential additions:
- curriculum build job model
- agent run state model
- CEFR metadata in chapter/unit planning inputs
- cache metadata for planning contexts

## 10.2 Existing Systems Reused
The following systems remain the deterministic core:
- unit generation pipeline
- lesson generation pipeline
- schema validation
- question-selection logic
- curriculum memory retrieval

## 11. Rollout Plan

### Phase 1: Context Architecture
- Formalize context payloads.
- Reuse runtime curriculum memory consistently.
- Standardize prompt inputs across generate/regenerate/refactor.

### Phase 2: CEFR Alignment
- Add CEFR mappings.
- Update planning prompts.
- Add QA checks for level drift.

### Phase 3: Agent A + Agent B
- Implement bounded orchestration for curriculum planning and content generation.
- Limit to one language and one course segment per run.

### Phase 4: Agent C + Agent D
- Add QA review and repair loop.
- Require clean pass before persistence.

### Phase 5: Caching
- Add Gemini explicit context caching for planning paths.
- Add TTL and invalidation rules.

## 12. Risks

### Risk: Agent Drift
Mitigation:
- keep agents bounded
- reuse deterministic validators
- never allow raw agent output to bypass schema checks

### Risk: Overblocking Useful Repetition
Mitigation:
- distinguish reinforcement from shallow duplication
- encode repetition policy explicitly in prompts and QA

### Risk: Cache Staleness
Mitigation:
- tie cache keys to curriculum-memory hashes
- add TTL and invalidation on approved-curriculum updates

### Risk: CEFR Becoming Cosmetic
Mitigation:
- include CEFR in both planning and QA
- make level violations actionable, not descriptive only

## 13. Success Metrics

- lower duplicate lesson intent rate
- better unit-to-unit progression consistency
- lower manual correction rate after generation
- reduced planning latency for repeated runs
- measurable reduction in shallow duplication across generated curriculum

## 14. Open Questions

- Should the first implementation persist agent run state, or run synchronously with bounded retries?
- Should CEFR be stored explicitly on chapters and units, or derived from level at generation time?
- When should curriculum memory move from runtime retrieval to a persisted read model?
- Which planning surfaces justify explicit Gemini context caching first?

## 15. Implementation Recommendation

Start with this order:
1. context architecture
2. CEFR-aware progression
3. Agent A and Agent B
4. Agent C and Agent D
5. caching systems
6. integration into course generation

## 16. Notes

- Repetition is required for this product; shallow duplication is not.
- The goal is not to let AI improvise freely. The goal is to give AI bounded ownership inside a validated generation system.
- The existing backend remains the enforcement layer.
