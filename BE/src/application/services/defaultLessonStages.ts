import type { LessonStage } from "../../domain/entities/Lesson.js";

const PEDAGOGICAL_STAGE_TEMPLATES = [
  {
    title: "Stage 1: Meaning",
    description: "Understand the sentence, its meaning, and the key chunks inside it."
  },
  {
    title: "Stage 2: Guided Practice",
    description: "Practice the sentence with structured prompts and support."
  },
  {
    title: "Stage 3: Recall and Use",
    description: "Recall the sentence, listen again, and use it with less support."
  }
] as const;

export function buildPedagogicalStages(idBuilder: (index: number) => string): LessonStage[] {
  return PEDAGOGICAL_STAGE_TEMPLATES.map((stage, index) => ({
    id: idBuilder(index),
    title: stage.title,
    description: stage.description,
    orderIndex: index,
    blocks: []
  }));
}
