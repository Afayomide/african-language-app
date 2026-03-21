import type { ExpressionImageLinkEntity } from "../entities/ExpressionImageLink.js";

export type ExpressionImageLinkCreateInput = {
  expressionId: string;
  translationIndex?: number | null;
  imageAssetId: string;
  isPrimary?: boolean;
  notes?: string;
  createdBy: string;
};

export type ExpressionImageLinkUpdateInput = Partial<{
  translationIndex: number | null;
  imageAssetId: string;
  isPrimary: boolean;
  notes: string;
}>;

export interface ExpressionImageLinkRepository {
  create(input: ExpressionImageLinkCreateInput): Promise<ExpressionImageLinkEntity>;
  listByExpressionId(expressionId: string): Promise<ExpressionImageLinkEntity[]>;
  listByExpressionIds(expressionIds: string[]): Promise<ExpressionImageLinkEntity[]>;
  findById(id: string): Promise<ExpressionImageLinkEntity | null>;
  findActiveByExpressionAndAsset(
    expressionId: string,
    imageAssetId: string,
    translationIndex?: number | null
  ): Promise<ExpressionImageLinkEntity | null>;
  updateById(id: string, update: ExpressionImageLinkUpdateInput): Promise<ExpressionImageLinkEntity | null>;
  clearPrimaryForExpression(expressionId: string, translationIndex?: number | null, excludeId?: string): Promise<void>;
  softDeleteById(id: string, now: Date): Promise<ExpressionImageLinkEntity | null>;
  softDeleteByImageAssetId(imageAssetId: string, now: Date): Promise<void>;
}
