import type { Level } from "../../domain/entities/Lesson.js";

export function getCefrBandForLevel(level: Level): string {
  switch (level) {
    case "beginner":
      return "A1-A2";
    case "intermediate":
      return "B1-B2";
    case "advanced":
      return "C1-C2";
    default:
      return "A1-A2";
  }
}
