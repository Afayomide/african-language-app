import type { TutorProfileEntity } from "../entities/TutorProfile.js";

export interface TutorProfileRepository {
  findByUserId(userId: string): Promise<TutorProfileEntity | null>;
  list(filter?: { isActive?: boolean }): Promise<TutorProfileEntity[]>;
  updateActiveById(id: string, isActive: boolean): Promise<TutorProfileEntity | null>;
  deleteById(id: string): Promise<TutorProfileEntity | null>;
  create(input: {
    userId: string;
    language: "yoruba" | "igbo" | "hausa";
    displayName: string;
    isActive: boolean;
  }): Promise<TutorProfileEntity>;
}
