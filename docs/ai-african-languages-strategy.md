# Hybrid Intelligence Strategy for African Languages

## 1. The Core Problem: Tonal vs. Synthetic Accuracy
Current AI models (Gemini, OpenAI, ElevenLabs) are primarily optimized for non-tonal languages (English, Spanish, etc.). In these languages, pitch conveys *emotion*. In African languages like Yoruba, Igbo, and Hausa, pitch conveys *meaning* (syntax). 

Standard AI TTS "flattens" these tones, making the speech sound robotic or culturally inaccurate. A slight mispronunciation of a "Mid-Tone" as a "High-Tone" can change a greeting into an insult.

## 2. The Solution: "AI-Strategic / Human-Acoustic" Model
Instead of relying on AI to *generate* the audio, we use the existing efficient Backend to *manage* a human-led audio pipeline.

### A. AI-Managed Curriculum (Backend)
- **Role:** Use `AdminLessonAiUseCases` and `LessonRefactorService` to generate the text-based curriculum, exercises, and distractors.
- **Goal:** Scalability. The AI builds the "skeleton" of the lesson in seconds.

### B. Human-Reference Audio (voiceFE)
- **Role:** Transform `voiceFE` into a "Crowdsourcing Studio."
- **Goal:** Native speakers (tutors) record the "Gold Standard" audio for each lesson. 
- **Validation:** Use Gemini's multimodal capabilities (`gemini-1.5-pro`) to verify that a human recording matches the generated text before it goes live.

### C. Tone-Matching Logic (Frontend)
- **Role:** Implement "Pitch Contour" visualization in the learner's app.
- **Goal:** Instead of a binary "Correct/Incorrect" (which AI is bad at for tone), show a visual graph comparing the learner's voice frequency to the tutor's reference frequency.

## 3. Actionable Architectural Changes

### Backend (BE)
- **Schema Update:** Modify `ExerciseQuestionSchema` in `BE/src/models/ExerciseQuestion.ts` to include:
  - `audioUrl`: Link to the human-recorded reference.
  - `pitchContourData`: A JSON map of the frequency over time.
- **Status Workflow:** Introduce a `pending_audio` status for lessons. A lesson is only "Published" once a native speaker has attached audio to every "content" block.

### Frontend Studio (voiceFE)
- **Recording Interface:** Build a simple mobile-friendly recorder for tutors.
- **Batch Processing:** Allow tutors to "Speed-Record" an entire lesson's vocabulary (10-15 phrases) in one session.

### Learner App (FE)
- **Waveform Comparison:** Use the `Web Audio API` to visualize the "High-Mid-Low" tone patterns. 
- **Audio-First Exercises:** Prioritize "Listening Discrimination" (hearing the difference between two similar-sounding tonal words) in the early stages of the lesson flow.

## 4. Why This Wins
By building a proprietary library of **Human-Tonal Reference Data**, you create a product that:
1. Is more accurate than Google or Duolingo.
2. Creates a "moat" of high-quality African language data that big tech companies do not have.
3. Empowers native speakers (tutors) to be part of the value chain.
