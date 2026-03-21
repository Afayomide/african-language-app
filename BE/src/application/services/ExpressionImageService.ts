import type { ImageAssetEntity } from "../../domain/entities/ImageAsset.js";
import type { ExpressionImageLinkEntity } from "../../domain/entities/ExpressionImageLink.js";
import type { ImageAssetRepository } from "../../domain/repositories/ImageAssetRepository.js";
import type { ExpressionImageLinkRepository } from "../../domain/repositories/ExpressionImageLinkRepository.js";

export type ExpressionImageView = ExpressionImageLinkEntity & {
  asset: ImageAssetEntity | null;
};

export class ExpressionImageService {
  constructor(
    private readonly links: ExpressionImageLinkRepository,
    private readonly assets: ImageAssetRepository
  ) {}

  async listByExpressionIds(expressionIds: string[]) {
    const normalizedPhraseIds = Array.from(new Set(expressionIds.map((item) => String(item || "")).filter(Boolean)));
    if (normalizedPhraseIds.length === 0) return new Map<string, ExpressionImageView[]>();

    const links = await this.links.listByExpressionIds(normalizedPhraseIds);
    const assets = await this.assets.findByIds(links.map((item) => item.imageAssetId));
    const assetMap = new Map(assets.map((item) => [item.id, item]));
    const result = new Map<string, ExpressionImageView[]>();

    for (const link of links) {
      const existing = result.get(link.expressionId) || [];
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
      result.set(link.expressionId, existing);
    }

    return result;
  }

  async listByExpressionId(expressionId: string) {
    const map = await this.listByExpressionIds([expressionId]);
    return map.get(expressionId) || [];
  }
}
