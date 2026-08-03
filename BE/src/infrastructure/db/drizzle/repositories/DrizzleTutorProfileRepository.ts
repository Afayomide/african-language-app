import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../client.js";
import { tutorProfiles, type NewTutorProfileRow, type TutorProfileRow } from "../schema.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type { TutorProfileEntity } from "../../../../domain/entities/TutorProfile.js";
import type { TutorProfileRepository } from "../../../../domain/repositories/TutorProfileRepository.js";

function toEntity(row: TutorProfileRow): TutorProfileEntity {
  return {
    id: row.id,
    _id: row.id,
    userId: String(row.userId),
    language: row.language ?? null,
    displayName: row.displayName,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class DrizzleTutorProfileRepository implements TutorProfileRepository {
  async findByUserId(userId: string): Promise<TutorProfileEntity | null> {
    const rows = await db.select().from(tutorProfiles).where(eq(tutorProfiles.userId, userId)).limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async listByUserIds(userIds: string[]): Promise<TutorProfileEntity[]> {
    if (!userIds.length) return [];
    const rows = await db.select().from(tutorProfiles).where(inArray(tutorProfiles.userId, userIds));
    return rows.map(toEntity);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await db.delete(tutorProfiles).where(eq(tutorProfiles.userId, userId));
  }

  async upsertByUserId(
    userId: string,
    input: { language: Language; displayName: string; isActive: boolean }
  ): Promise<TutorProfileEntity> {
    const [row] = await db
      .insert(tutorProfiles)
      .values({ userId, language: input.language, displayName: input.displayName, isActive: input.isActive })
      .onConflictDoUpdate({
        target: tutorProfiles.userId,
        set: {
          language: input.language,
          displayName: input.displayName,
          isActive: input.isActive,
          updatedAt: new Date()
        }
      })
      .returning();
    return toEntity(row);
  }

  async list(filter?: { isActive?: boolean }): Promise<TutorProfileEntity[]> {
    const rows = await db
      .select()
      .from(tutorProfiles)
      .where(filter?.isActive === undefined ? undefined : eq(tutorProfiles.isActive, filter.isActive))
      .orderBy(desc(tutorProfiles.createdAt));
    return rows.map(toEntity);
  }

  async updateActiveById(id: string, isActive: boolean): Promise<TutorProfileEntity | null> {
    const rows = await db
      .update(tutorProfiles)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(tutorProfiles.id, id))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async updateByUserId(
    userId: string,
    update: { language?: Language | null; displayName?: string; isActive?: boolean }
  ): Promise<TutorProfileEntity | null> {
    const values: Partial<NewTutorProfileRow> = { updatedAt: new Date() };
    if (update.language !== undefined) values.language = update.language;
    if (update.displayName !== undefined) values.displayName = update.displayName;
    if (update.isActive !== undefined) values.isActive = update.isActive;

    const rows = await db
      .update(tutorProfiles)
      .set(values)
      .where(eq(tutorProfiles.userId, userId))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async deleteById(id: string): Promise<TutorProfileEntity | null> {
    const rows = await db.delete(tutorProfiles).where(eq(tutorProfiles.id, id)).returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async create(input: {
    userId: string;
    language?: Language | null;
    displayName: string;
    isActive: boolean;
  }): Promise<TutorProfileEntity> {
    const [row] = await db
      .insert(tutorProfiles)
      .values({
        userId: input.userId,
        language: input.language ?? null,
        displayName: input.displayName ?? "",
        isActive: input.isActive
      })
      .returning();
    return toEntity(row);
  }
}
