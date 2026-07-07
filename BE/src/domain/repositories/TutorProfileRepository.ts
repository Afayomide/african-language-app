import type { Language } from "../entities/Lesson.js";
import type { TutorProfileEntity } from "../entities/TutorProfile.js";

export interface TutorProfileRepository {
  findByUserId(userId: string): Promise<TutorProfileEntity | null>;
  list(filter?: { isActive?: boolean }): Promise<TutorProfileEntity[]>;
  updateActiveById(id: string, isActive: boolean): Promise<TutorProfileEntity | null>;
  updateByUserId(
    userId: string,
    update: { language?: Language | null; displayName?: string; isActive?: boolean }
  ): Promise<TutorProfileEntity | null>;
  deleteById(id: string): Promise<TutorProfileEntity | null>;
  create(input: {
    userId: string;
    language?: Language | null;
    displayName: string;
    isActive: boolean;
  }): Promise<TutorProfileEntity>;
}
