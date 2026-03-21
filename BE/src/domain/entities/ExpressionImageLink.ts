export type ExpressionImageLinkEntity = {
  id: string;
  _id?: string;
  expressionId: string;
  translationIndex: number | null;
  imageAssetId: string;
  isPrimary: boolean;
  notes: string;
  createdBy: string;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};
