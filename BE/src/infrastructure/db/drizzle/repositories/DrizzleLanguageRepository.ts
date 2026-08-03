import { and, asc, eq, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import { languages, type LanguageRow, type NewLanguageRow } from "../schema.js";
import type { LanguageEntity } from "../../../../domain/entities/Language.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type {
  LanguageCreateInput,
  LanguageListFilter,
  LanguageRepository,
  LanguageUpdateInput
} from "../../../../domain/repositories/LanguageRepository.js";

function toEntity(row: LanguageRow): LanguageEntity {
  const branding = row.branding ?? {};
  const speechConfig = row.speechConfig ?? {};
  const learningConfig = row.learningConfig ?? {};
  return {
    id: row.id,
    _id: row.id,
    code: row.code,
    name: row.name,
    nativeName: row.nativeName,
    status: row.status,
    orderIndex: row.orderIndex,
    locale: String(row.locale || ""),
    region: String(row.region || ""),
    branding: {
      heroGreeting: String(branding.heroGreeting || ""),
      heroSubtitle: String(branding.heroSubtitle || ""),
      proverbLabel: String(branding.proverbLabel || "Proverb"),
      primaryColor: String(branding.primaryColor || ""),
      secondaryColor: String(branding.secondaryColor || ""),
      accentColor: String(branding.accentColor || ""),
      iconName: String(branding.iconName || "")
    },
    speechConfig: {
      ttsLocale: String(speechConfig.ttsLocale || ""),
      sttLocale: String(speechConfig.sttLocale || ""),
      ttsVoiceId: String(speechConfig.ttsVoiceId || "")
    },
    learningConfig: {
      scriptDirection: learningConfig.scriptDirection || "ltr",
      usesToneMarks: Boolean(learningConfig.usesToneMarks),
      usesDiacritics: Boolean(learningConfig.usesDiacritics)
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function toValues(input: LanguageUpdateInput): Partial<NewLanguageRow> {
  const values: Partial<NewLanguageRow> = {};
  if (input.name !== undefined) values.name = input.name;
  if (input.nativeName !== undefined) values.nativeName = input.nativeName;
  if (input.status !== undefined) values.status = input.status;
  if (input.orderIndex !== undefined) values.orderIndex = input.orderIndex;
  if (input.locale !== undefined) values.locale = input.locale;
  if (input.region !== undefined) values.region = input.region;
  if (input.branding !== undefined) values.branding = input.branding;
  if (input.speechConfig !== undefined) values.speechConfig = input.speechConfig;
  if (input.learningConfig !== undefined) values.learningConfig = input.learningConfig;
  return values;
}

export class DrizzleLanguageRepository implements LanguageRepository {
  async create(input: LanguageCreateInput): Promise<LanguageEntity> {
    const [row] = await db
      .insert(languages)
      .values({
        code: input.code,
        name: input.name,
        nativeName: input.nativeName,
        status: input.status ?? "active",
        orderIndex: input.orderIndex ?? 0,
        locale: input.locale ?? "",
        region: input.region ?? "",
        branding: input.branding ?? {},
        speechConfig: input.speechConfig ?? {},
        learningConfig: input.learningConfig ?? { scriptDirection: "ltr", usesToneMarks: false, usesDiacritics: false }
      })
      .returning();
    return toEntity(row);
  }

  async list(filter: LanguageListFilter = {}): Promise<LanguageEntity[]> {
    const conditions: (SQL | undefined)[] = [];
    if (filter.status) conditions.push(eq(languages.status, filter.status));

    const rows = await db
      .select()
      .from(languages)
      .where(conditions.length > 0 ? and(...conditions.filter(Boolean)) : undefined)
      .orderBy(asc(languages.orderIndex), asc(languages.createdAt));

    return rows.map(toEntity);
  }

  async listActive(): Promise<LanguageEntity[]> {
    const rows = await db
      .select()
      .from(languages)
      .where(eq(languages.status, "active"))
      .orderBy(asc(languages.orderIndex), asc(languages.createdAt));
    return rows.map(toEntity);
  }

  async findById(id: string): Promise<LanguageEntity | null> {
    const rows = await db.select().from(languages).where(eq(languages.id, id)).limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findByCode(code: Language): Promise<LanguageEntity | null> {
    const rows = await db.select().from(languages).where(eq(languages.code, code)).limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async updateById(id: string, update: LanguageUpdateInput): Promise<LanguageEntity | null> {
    const rows = await db
      .update(languages)
      .set({ ...toValues(update), updatedAt: new Date() })
      .where(eq(languages.id, id))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  /** Postgres upsert on the unique `code` index — replaces Mongo's findOneAndUpdate({upsert:true}). */
  async upsertByCode(code: Language, input: LanguageCreateInput): Promise<LanguageEntity> {
    const [row] = await db
      .insert(languages)
      .values({
        code,
        name: input.name,
        nativeName: input.nativeName,
        status: input.status ?? "active",
        orderIndex: input.orderIndex ?? 0,
        locale: input.locale ?? "",
        region: input.region ?? "",
        branding: input.branding ?? {},
        speechConfig: input.speechConfig ?? {},
        learningConfig: input.learningConfig ?? { scriptDirection: "ltr", usesToneMarks: false, usesDiacritics: false }
      })
      .onConflictDoUpdate({
        target: languages.code,
        set: { ...toValues(input), updatedAt: new Date() }
      })
      .returning();
    return toEntity(row);
  }
}
