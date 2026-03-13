import type { PhraseImageLinkEntity } from "../entities/PhraseImageLink.js";

export type PhraseImageLinkCreateInput = {
  phraseId: string;
  translationIndex?: number | null;
  imageAssetId: string;
  isPrimary?: boolean;
  notes?: string;
  createdBy: string;
};

export type PhraseImageLinkUpdateInput = Partial<{
  translationIndex: number | null;
  imageAssetId: string;
  isPrimary: boolean;
  notes: string;
}>;

export interface PhraseImageLinkRepository {
  create(input: PhraseImageLinkCreateInput): Promise<PhraseImageLinkEntity>;
  listByPhraseId(phraseId: string): Promise<PhraseImageLinkEntity[]>;
  listByPhraseIds(phraseIds: string[]): Promise<PhraseImageLinkEntity[]>;
  findById(id: string): Promise<PhraseImageLinkEntity | null>;
  findActiveByPhraseAndAsset(
    phraseId: string,
    imageAssetId: string,
    translationIndex?: number | null
  ): Promise<PhraseImageLinkEntity | null>;
  updateById(id: string, update: PhraseImageLinkUpdateInput): Promise<PhraseImageLinkEntity | null>;
  clearPrimaryForPhrase(phraseId: string, translationIndex?: number | null, excludeId?: string): Promise<void>;
  softDeleteById(id: string, now: Date): Promise<PhraseImageLinkEntity | null>;
  softDeleteByImageAssetId(imageAssetId: string, now: Date): Promise<void>;
}
