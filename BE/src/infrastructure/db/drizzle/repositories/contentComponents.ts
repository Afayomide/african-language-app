import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../client.js";
import {
  expressionComponents,
  sentenceComponents,
  type ExpressionComponentRow,
  type SentenceComponentRow
} from "../schema.js";
import type { ContentComponentRef } from "../../../../domain/entities/Content.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ComponentRow = SentenceComponentRow | ExpressionComponentRow;

/**
 * Sentence.components[] / Expression.components[] normalized into two tables.
 *
 * Each has a real FK to its parent with ON DELETE CASCADE, so hard-deleting a
 * sentence or expression removes its components automatically — no manual
 * cleanup needed in the hard-delete scripts.
 *
 * `ref_id` remains polymorphic (word|expression) and is intentionally NOT an FK;
 * it is covered by the (type, ref_id) index for reverse lookups.
 */

/** `gloss` lives only on sentence components; expression components have no such column. */
function glossOf(row: ComponentRow): string | undefined {
  const value = (row as SentenceComponentRow).gloss;
  return value ? String(value) : undefined;
}

function toRef(row: ComponentRow, fallbackIndex: number): ContentComponentRef {
  return {
    type: row.type === "expression" ? "expression" : "word",
    refId: String(row.refId || ""),
    orderIndex: Number.isInteger(row.orderIndex) ? Number(row.orderIndex) : fallbackIndex,
    textSnapshot: row.textSnapshot ? String(row.textSnapshot) : undefined,
    gloss: glossOf(row)
  };
}

function toValues(components: ContentComponentRef[]) {
  return components.map((component, index) => ({
    type: component.type === "expression" ? ("expression" as const) : ("word" as const),
    refId: String(component.refId || ""),
    orderIndex: Number.isInteger(component.orderIndex) ? Number(component.orderIndex) : index,
    textSnapshot: component.textSnapshot ? String(component.textSnapshot) : ""
  }));
}

/** Sentence rows carry the extra `gloss` column; expression rows must not receive it. */
function toSentenceValues(components: ContentComponentRef[]) {
  return toValues(components).map((value, index) => ({
    ...value,
    gloss: components[index]?.gloss ? String(components[index].gloss) : null
  }));
}

function group(rows: ComponentRow[], keyOf: (row: ComponentRow) => string): Map<string, ContentComponentRef[]> {
  const byParent = new Map<string, ContentComponentRef[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = byParent.get(key) ?? [];
    list.push(toRef(row, list.length));
    byParent.set(key, list);
  }
  return byParent;
}

/* ----------------------------- sentences ----------------------------- */

export async function loadSentenceComponents(sentenceIds: string[]): Promise<Map<string, ContentComponentRef[]>> {
  if (sentenceIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(sentenceComponents)
    .where(inArray(sentenceComponents.sentenceId, sentenceIds))
    .orderBy(asc(sentenceComponents.sentenceId), asc(sentenceComponents.orderIndex));
  return group(rows, (row) => (row as SentenceComponentRow).sentenceId);
}

export async function writeSentenceComponents(
  tx: Tx,
  sentenceId: string,
  components: ContentComponentRef[] | undefined
): Promise<void> {
  await tx.delete(sentenceComponents).where(eq(sentenceComponents.sentenceId, sentenceId));
  if (!Array.isArray(components) || components.length === 0) return;
  await tx.insert(sentenceComponents).values(toSentenceValues(components).map((value) => ({ ...value, sentenceId })));
}

/* ---------------------------- expressions ---------------------------- */

export async function loadExpressionComponents(
  expressionIds: string[]
): Promise<Map<string, ContentComponentRef[]>> {
  if (expressionIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(expressionComponents)
    .where(inArray(expressionComponents.expressionId, expressionIds))
    .orderBy(asc(expressionComponents.expressionId), asc(expressionComponents.orderIndex));
  return group(rows, (row) => (row as ExpressionComponentRow).expressionId);
}

export async function writeExpressionComponents(
  tx: Tx,
  expressionId: string,
  components: ContentComponentRef[] | undefined
): Promise<void> {
  await tx.delete(expressionComponents).where(eq(expressionComponents.expressionId, expressionId));
  if (!Array.isArray(components) || components.length === 0) return;
  await tx.insert(expressionComponents).values(toValues(components).map((value) => ({ ...value, expressionId })));
}
