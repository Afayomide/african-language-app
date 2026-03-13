import type { Response } from "express";
import mongoose from "mongoose";
import ImageAssetModel from "../../models/ImageAsset.js";
import { MongooseImageAssetRepository } from "../../infrastructure/db/mongoose/repositories/MongooseImageAssetRepository.js";
import { MongoosePhraseImageLinkRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseImageLinkRepository.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { parseImageUpload, uploadImageFile } from "../shared/imageUpload.js";
import { getSearchQuery, parsePaginationQuery } from "../../interfaces/http/utils/pagination.js";

const imageRepo = new MongooseImageAssetRepository();
const phraseImageLinkRepo = new MongoosePhraseImageLinkRepository();

function parseTags(tags: unknown) {
  if (!Array.isArray(tags)) return [];
  return Array.from(new Set(tags.map((item) => String(item || "").trim()).filter(Boolean)));
}

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function createImageAsset(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { url, thumbnailUrl, mimeType, width, height, description, altText, tags, languageNeutralLabel, status, imageUpload } = req.body ?? {};
  if (!altText || !String(altText).trim()) {
    return res.status(400).json({ error: "alt text is required" });
  }

  const parsedUpload = parseImageUpload(imageUpload);
  if (parsedUpload === "invalid_image_upload") {
    return res.status(400).json({ error: "invalid image upload" });
  }
  if (parsedUpload === "image_too_large") {
    return res.status(400).json({ error: "image too large" });
  }

  let resolvedUrl = String(url || "").trim();
  let resolvedStorageKey = "";
  let resolvedMimeType = String(mimeType || "").trim();
  if (parsedUpload) {
    const uploaded = await uploadImageFile({ ...parsedUpload, ownerId: req.user.id });
    resolvedUrl = uploaded.url;
    resolvedStorageKey = uploaded.storageKey;
    resolvedMimeType = parsedUpload.mimeType;
  }

  if (!resolvedUrl) {
    return res.status(400).json({ error: "image url or upload is required" });
  }
  if (status !== undefined && !["draft", "approved"].includes(String(status))) {
    return res.status(400).json({ error: "invalid image status" });
  }

  const image = await imageRepo.create({
    url: resolvedUrl,
    thumbnailUrl: String(thumbnailUrl || "").trim(),
    storageKey: resolvedStorageKey,
    mimeType: resolvedMimeType || "image/jpeg",
    width: width !== undefined ? Number(width) : undefined,
    height: height !== undefined ? Number(height) : undefined,
    description: String(description || "").trim() || String(altText || "").trim(),
    altText: String(altText).trim(),
    tags: parseTags(tags),
    languageNeutralLabel: String(languageNeutralLabel || "").trim(),
    status: status !== undefined ? String(status) as "draft" | "approved" : "draft",
    uploadedBy: req.user.id
  });

  return res.status(201).json({ image });
}

export async function listImageAssets(req: AuthRequest, res: Response) {
  const pagination = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);
  const status = req.query.status ? String(req.query.status) : undefined;
  if (status && !["draft", "approved"].includes(status)) {
    return res.status(400).json({ error: "invalid image status" });
  }

  const query: Record<string, unknown> = { isDeleted: { $ne: true } };
  if (status) query.status = status;
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [
      { description: regex },
      { altText: regex },
      { tags: regex },
      { languageNeutralLabel: regex },
      { mimeType: regex }
    ];
  }

  const total = await ImageAssetModel.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(total / pagination.limit));
  const page = Math.min(pagination.page, totalPages);
  const skip = (page - 1) * pagination.limit;
  const images = await ImageAssetModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(pagination.limit).lean();

  return res.status(200).json({
    total,
    images,
    pagination: {
      page,
      limit: pagination.limit,
      total,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages
    }
  });
}

export async function getImageAssetById(req: AuthRequest, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid image id" });
  }

  const image = await imageRepo.findById(id);
  if (!image) {
    return res.status(404).json({ error: "image not found" });
  }
  return res.status(200).json({ image });
}

export async function updateImageAsset(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid image id" });
  }

  const { url, thumbnailUrl, mimeType, width, height, description, altText, tags, languageNeutralLabel, status, imageUpload } = req.body ?? {};
  const parsedUpload = parseImageUpload(imageUpload);
  if (parsedUpload === "invalid_image_upload") {
    return res.status(400).json({ error: "invalid image upload" });
  }
  if (parsedUpload === "image_too_large") {
    return res.status(400).json({ error: "image too large" });
  }
  if (status !== undefined && !["draft", "approved"].includes(String(status))) {
    return res.status(400).json({ error: "invalid image status" });
  }

  const update: Parameters<typeof imageRepo.updateById>[1] = {};
  if (url !== undefined) update.url = String(url || "").trim();
  if (thumbnailUrl !== undefined) update.thumbnailUrl = String(thumbnailUrl || "").trim();
  if (mimeType !== undefined) update.mimeType = String(mimeType || "").trim();
  if (width !== undefined) update.width = Number(width);
  if (height !== undefined) update.height = Number(height);
  if (description !== undefined) update.description = String(description || "").trim();
  if (altText !== undefined) {
    if (!String(altText).trim()) return res.status(400).json({ error: "alt text is required" });
    update.altText = String(altText).trim();
  }
  if (tags !== undefined) update.tags = parseTags(tags);
  if (languageNeutralLabel !== undefined) update.languageNeutralLabel = String(languageNeutralLabel || "").trim();
  if (status !== undefined) update.status = String(status) as "draft" | "approved";
  if (parsedUpload) {
    const uploaded = await uploadImageFile({ ...parsedUpload, ownerId: req.user.id });
    update.url = uploaded.url;
    update.storageKey = uploaded.storageKey;
    update.mimeType = parsedUpload.mimeType;
  }

  const image = await imageRepo.updateById(id, update);
  if (!image) {
    return res.status(404).json({ error: "image not found" });
  }

  return res.status(200).json({ image });
}

export async function deleteImageAsset(req: AuthRequest, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid image id" });
  }

  const image = await imageRepo.softDeleteById(id, new Date());
  if (!image) {
    return res.status(404).json({ error: "image not found" });
  }
  await phraseImageLinkRepo.softDeleteByImageAssetId(id, new Date());

  return res.status(200).json({ message: "image deleted", image });
}
