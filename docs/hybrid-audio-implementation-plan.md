# Hybrid-Tone Implementation Plan: Human-First Strategy

This document outlines the engineering steps to transition to a high-accuracy, human-led audio pipeline for African languages, skipping costly and inaccurate AI TTS.

## Phase 1: Content-Centric Audio Schema
*Tying audio to reusable content (Words/Expressions/Sentences) rather than specific questions.*
- [ ] **Extend `ContentAudioSchema`:** Update `BE/src/models/shared/contentFields.ts` to include:
    - `pitchContourData`: JSON (Stores the normalized F0 pitch map for comparison).
    - `isHumanVerified`: Boolean (Set to true when a tutor/teacher records the audio).
    - `duration`: Number (Length of the clip in milliseconds).
- [ ] **Content Repository Update:** Ensure `Word`, `Expression`, and `Sentence` repositories support saving these new audio metadata fields.

## Phase 2: AI Text Accuracy (Mandatory Diacritics)
*Ensuring the text is perfectly marked so the Human knows exactly which tone to record.*
- [ ] **Audit Prompt Guardrails:** Update `BE/src/services/llm/promptGuardrails.ts`.
    - [ ] Add explicit instruction: "Every Yoruba, Igbo, and Hausa word MUST include all standard diacritics (sub-dots and tone marks)."
- [ ] **Validation Pass:** Update `outputQuality.ts` to reject AI-generated content if it lacks expected tonal markers.

## Phase 3: The "Voice Studio" (voiceFE)
*Building the production line for human audio.*
- [ ] **Tutor Dashboard:** Create a "Recording Queue" that lists all `published` or `draft` content items missing `humanVerified` audio.
- [ ] **Studio Recorder:**
    - [ ] Implementation of a high-quality browser recorder (WAV/PCM 44.1kHz).
    - [ ] Visual Tone Guide: Display the text with large, clear diacritics for the speaker.
- [ ] **Tone Fingerprinting:**
    - [ ] Extract the **Normalized Pitch Contour (F0)** from the teacher's recording.
    - [ ] Store this contour in the DB as the "Source of Truth."

## Phase 4: Learner Comparison (Pitch Matching)
*Providing feedback to the student.*
- [ ] **Pitch Extraction:** Implement real-time F0 extraction for the student's microphone input.
- [ ] **Algorithm:** Use **Dynamic Time Warping (DTW)** to compare the student's pitch contour against the teacher's.
    - [ ] *Why not Spectrograms?* Spectrograms include voice timber (bass/soprano). DTW on F0 focuses only on the "Melody" (Tone), allowing a student with a different voice type to still "match" the teacher.
- [ ] **UI Visualization:** Overlay the student's pitch line on top of the teacher's pitch line for visual correction.

## Phase 5: Workflow Integration
- [ ] **Automation:** When a question is rendered in the `FE`, it should automatically fetch the audio linked to its `sourceId` (Word/Expression/Sentence).
- [ ] **Quality Gate:** Add an Admin tool to "Approve" tutor recordings before they are served to learners.
