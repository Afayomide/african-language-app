import type { ContentType } from "../../domain/entities/Content.js";
import type { ContentAudio } from "../../domain/entities/Content.js";
import type { ExpressionEntity } from "../../domain/entities/Expression.js";
import type { SentenceEntity } from "../../domain/entities/Sentence.js";
import type { WordEntity } from "../../domain/entities/Word.js";
import type { ExpressionRepository } from "../../domain/repositories/ExpressionRepository.js";
import type { SentenceRepository } from "../../domain/repositories/SentenceRepository.js";
import type { WordRepository } from "../../domain/repositories/WordRepository.js";

export type ResolvedContentEntity =
  | (WordEntity & { kind: "word" })
  | (ExpressionEntity & { kind: "expression" })
  | (SentenceEntity & { kind: "sentence" });

export class ContentLookupService {
  constructor(
    private readonly words: WordRepository,
    private readonly expressions: ExpressionRepository,
    private readonly sentences: SentenceRepository
  ) {}

  async findByRef(type: ContentType, id: string): Promise<ResolvedContentEntity | null> {
    if (type === "word") {
      const item = await this.words.findById(id);
      return item ? { ...item, kind: "word" } : null;
    }
    if (type === "sentence") {
      const item = await this.sentences.findById(id);
      return item ? { ...item, kind: "sentence" } : null;
    }
    const item = await this.expressions.findById(id);
    return item ? { ...item, kind: "expression" } : null;
  }

  async findMany(refs: Array<{ type: ContentType; id: string }>): Promise<Map<string, ResolvedContentEntity>> {
    const byType = {
      word: new Set<string>(),
      expression: new Set<string>(),
      sentence: new Set<string>()
    };

    for (const ref of refs) {
      if (!ref?.id) continue;
      byType[ref.type].add(ref.id);
    }

    const [words, expressions, sentences] = await Promise.all([
      this.words.findByIds(Array.from(byType.word)),
      this.expressions.findByIds(Array.from(byType.expression)),
      this.sentences.findByIds(Array.from(byType.sentence))
    ]);

    const result = new Map<string, ResolvedContentEntity>();
    for (const item of words) result.set(`word:${item.id}`, { ...item, kind: "word" });
    for (const item of expressions) result.set(`expression:${item.id}`, { ...item, kind: "expression" });
    for (const item of sentences) result.set(`sentence:${item.id}`, { ...item, kind: "sentence" });
    return result;
  }

  async updateAudioByRef(type: ContentType, id: string, audio: ContentAudio) {
    if (type === "word") {
      const item = await this.words.updateById(id, { audio });
      return item ? { ...item, kind: "word" as const } : null;
    }
    if (type === "sentence") {
      const item = await this.sentences.updateById(id, { audio });
      return item ? { ...item, kind: "sentence" as const } : null;
    }
    const item = await this.expressions.updateById(id, { audio });
    return item ? { ...item, kind: "expression" as const } : null;
  }
}
