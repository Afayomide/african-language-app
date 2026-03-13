import type { ImageAssetEntity } from "../../domain/entities/ImageAsset.js";
import type { PhraseImageLinkEntity } from "../../domain/entities/PhraseImageLink.js";
import type { ImageAssetRepository } from "../../domain/repositories/ImageAssetRepository.js";
import type { PhraseImageLinkRepository } from "../../domain/repositories/PhraseImageLinkRepository.js";

export type PhraseImageView = PhraseImageLinkEntity & {
  asset: ImageAssetEntity | null;
};

export class PhraseImageService {
  constructor(
    private readonly links: PhraseImageLinkRepository,
    private readonly assets: ImageAssetRepository
  ) {}

  async listByPhraseIds(phraseIds: string[]) {
    const normalizedPhraseIds = Array.from(new Set(phraseIds.map((item) => String(item || "")).filter(Boolean)));
    if (normalizedPhraseIds.length === 0) return new Map<string, PhraseImageView[]>();

    const links = await this.links.listByPhraseIds(normalizedPhraseIds);
    const assets = await this.assets.findByIds(links.map((item) => item.imageAssetId));
    const assetMap = new Map(assets.map((item) => [item.id, item]));
    const result = new Map<string, PhraseImageView[]>();

    for (const link of links) {
      const existing = result.get(link.phraseId) || [];
      existing.push({
        ...link,
        asset: assetMap.get(link.imageAssetId) || null
      });
      existing.sort((left, right) => {
        if (Number(left.isPrimary) !== Number(right.isPrimary)) {
          return Number(right.isPrimary) - Number(left.isPrimary);
        }
        const leftTime = left.createdAt?.getTime() || 0;
        const rightTime = right.createdAt?.getTime() || 0;
        return rightTime - leftTime;
      });
      result.set(link.phraseId, existing);
    }

    return result;
  }

  async listByPhraseId(phraseId: string) {
    const map = await this.listByPhraseIds([phraseId]);
    return map.get(phraseId) || [];
  }
}
