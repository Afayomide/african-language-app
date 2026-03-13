export type PhraseImageLinkEntity = {
  id: string;
  _id?: string;
  phraseId: string;
  translationIndex: number | null;
  imageAssetId: string;
  isPrimary: boolean;
  notes: string;
  createdBy: string;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};
