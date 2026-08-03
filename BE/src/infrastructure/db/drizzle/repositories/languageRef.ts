import { eq, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../client.js";
import { languages } from "../schema.js";
import type { Language } from "../../../../domain/entities/Lesson.js";

export async function findLanguageIdByCode(code: Language): Promise<string | null> {
  const rows = await db
    .select({ id: languages.id })
    .from(languages)
    .where(eq(languages.code, code))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Postgres port of buildScopedLanguageQuery. Content rows carry BOTH a legacy
 * `language` code and a newer `language_id` FK, and not every row has been
 * backfilled — so scoping matches on either, exactly like the Mongo `$or` did.
 */
export async function buildScopedLanguageCondition(
  cols: { language: AnyPgColumn; languageId: AnyPgColumn },
  input: { language?: Language; languageId?: string | null }
): Promise<SQL | undefined> {
  if (input.languageId) {
    return input.language
      ? or(eq(cols.languageId, input.languageId), eq(cols.language, input.language))
      : eq(cols.languageId, input.languageId);
  }

  if (input.language) {
    const resolved = await findLanguageIdByCode(input.language);
    return resolved
      ? or(eq(cols.languageId, resolved), eq(cols.language, input.language))
      : eq(cols.language, input.language);
  }

  return undefined;
}
