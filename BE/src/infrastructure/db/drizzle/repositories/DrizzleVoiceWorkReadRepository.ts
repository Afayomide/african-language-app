import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import {
  chapters,
  expressions,
  lessonContentItems,
  lessons,
  sentences,
  units,
  voiceAudioSubmissions,
  words
} from "../schema.js";
import type { ContentType } from "../../../../domain/entities/Content.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type { VoiceAudioSubmissionStatus } from "../../../../domain/entities/VoiceAudioSubmission.js";
import type {
  VoiceContentSummary,
  VoiceCurriculum,
  VoiceSubmissionSummary,
  VoiceWorkReadRepository
} from "../../../../domain/repositories/VoiceWorkReadRepository.js";
import { mapContentAudio } from "./contentMappers.js";
import { buildScopedLanguageCondition } from "./languageRef.js";

const NEEDS_AUDIO_STATUSES = ["requested", "rejected", "submitted"];
const ID_CHUNK = 2000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Audio without the pitch contour, spectrogram and waveform: the bulk of the column. */
function slimAudio(value: unknown) {
  const { analysis: _analysis, ...rest } = mapContentAudio(value);
  return rest;
}

const contentTables = { word: words, expression: expressions, sentence: sentences } as const;

export class DrizzleVoiceWorkReadRepository implements VoiceWorkReadRepository {
  async listCurriculum(language: Language): Promise<VoiceCurriculum> {
    const [lessonScope, unitScope, chapterScope] = await Promise.all([
      buildScopedLanguageCondition({ language: lessons.language, languageId: lessons.languageId }, { language }),
      buildScopedLanguageCondition({ language: units.language, languageId: units.languageId }, { language }),
      buildScopedLanguageCondition({ language: chapters.language, languageId: chapters.languageId }, { language })
    ]);
    const lessonWhere = and(lessonScope, eq(lessons.isDeleted, false));

    const [lessonRows, unitRows, chapterRows, itemRows] = await Promise.all([
      db
        .select({ id: lessons.id, title: lessons.title, orderIndex: lessons.orderIndex, unitId: lessons.unitId })
        .from(lessons)
        .where(lessonWhere)
        .orderBy(asc(lessons.orderIndex), asc(lessons.createdAt)),
      db
        .select({ id: units.id, title: units.title, orderIndex: units.orderIndex, chapterId: units.chapterId })
        .from(units)
        .where(and(unitScope, eq(units.isDeleted, false)))
        .orderBy(asc(units.orderIndex), asc(units.createdAt)),
      db
        .select({ id: chapters.id, title: chapters.title, orderIndex: chapters.orderIndex })
        .from(chapters)
        .where(and(chapterScope, eq(chapters.isDeleted, false)))
        .orderBy(asc(chapters.orderIndex), asc(chapters.createdAt)),
      db
        .select({
          contentType: lessonContentItems.contentType,
          contentId: lessonContentItems.contentId,
          lessonId: lessonContentItems.lessonId
        })
        .from(lessonContentItems)
        .innerJoin(lessons, eq(lessons.id, lessonContentItems.lessonId))
        .where(lessonWhere)
        .orderBy(asc(lessonContentItems.orderIndex), asc(lessonContentItems.createdAt))
    ]);

    return {
      lessons: lessonRows.map((row) => ({ ...row, _id: row.id })),
      units: unitRows.map((row) => ({ ...row, _id: row.id, chapterId: row.chapterId ?? null })),
      chapters: chapterRows.map((row) => ({ ...row, _id: row.id })),
      items: itemRows.map((row) => ({ ...row, contentId: String(row.contentId) }))
    };
  }

  async findContentSummaries(
    refs: Array<{ type: ContentType; id: string }>,
    options: { needingAudio?: boolean } = {}
  ): Promise<Map<string, VoiceContentSummary>> {
    const idsByType: Record<ContentType, Set<string>> = {
      word: new Set(),
      expression: new Set(),
      sentence: new Set()
    };
    for (const ref of refs) if (ref?.id) idsByType[ref.type].add(ref.id);

    const result = new Map<string, VoiceContentSummary>();
    await Promise.all(
      (Object.keys(contentTables) as ContentType[]).map(async (kind) => {
        const table = contentTables[kind];
        for (const ids of chunk(Array.from(idsByType[kind]), ID_CHUNK)) {
          const conditions: SQL[] = [inArray(table.id, ids), eq(table.isDeleted, false)];
          if (options.needingAudio) {
            conditions.push(inArray(sql<string>`${table.audio}->>'workflowStatus'`, NEEDS_AUDIO_STATUSES));
          }
          const rows = await db
            .select({
              id: table.id,
              language: table.language,
              text: table.text,
              translations: table.translations,
              pronunciation: table.pronunciation,
              explanation: table.explanation,
              difficulty: table.difficulty,
              status: table.status,
              audio: sql<unknown>`${table.audio} - 'analysis'`
            })
            .from(table)
            .where(and(...conditions));
          for (const row of rows) {
            result.set(`${kind}:${row.id}`, {
              ...row,
              _id: row.id,
              kind,
              status: String(row.status),
              audio: slimAudio(row.audio)
            });
          }
        }
      })
    );
    return result;
  }

  async listSubmissionSummaries(filter: {
    voiceArtistUserId: string;
    language: Language;
    status?: VoiceAudioSubmissionStatus;
  }): Promise<VoiceSubmissionSummary[]> {
    const conditions: SQL[] = [
      eq(voiceAudioSubmissions.voiceArtistUserId, filter.voiceArtistUserId),
      eq(voiceAudioSubmissions.language, filter.language)
    ];
    if (filter.status) conditions.push(eq(voiceAudioSubmissions.status, filter.status));

    const rows = await db
      .select({
        id: voiceAudioSubmissions.id,
        contentType: voiceAudioSubmissions.contentType,
        contentId: voiceAudioSubmissions.contentId,
        language: voiceAudioSubmissions.language,
        status: voiceAudioSubmissions.status,
        rejectionReason: voiceAudioSubmissions.rejectionReason,
        reviewedAt: voiceAudioSubmissions.reviewedAt,
        createdAt: voiceAudioSubmissions.createdAt,
        updatedAt: voiceAudioSubmissions.updatedAt,
        audio: sql<unknown>`${voiceAudioSubmissions.audio} - 'analysis'`
      })
      .from(voiceAudioSubmissions)
      .where(and(...conditions))
      .orderBy(desc(voiceAudioSubmissions.createdAt));

    return rows.map((row) => ({
      ...row,
      _id: row.id,
      contentId: String(row.contentId),
      rejectionReason: String(row.rejectionReason || ""),
      reviewedAt: row.reviewedAt ?? undefined,
      audio: slimAudio(row.audio)
    }));
  }
}
