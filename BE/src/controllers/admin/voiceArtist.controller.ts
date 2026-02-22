import type { Request, Response } from "express";
import mongoose from "mongoose";
import { AdminVoiceArtistUseCases } from "../../application/use-cases/admin/voice-artist/AdminVoiceArtistUseCases.js";
import { MongooseUserRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUserRepository.js";
import { MongooseVoiceArtistProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseVoiceArtistProfileRepository.js";
import {
  getSearchQuery,
  includesSearch,
  paginate,
  parsePaginationQuery
} from "../../interfaces/http/utils/pagination.js";

const useCases = new AdminVoiceArtistUseCases(
  new MongooseVoiceArtistProfileRepository(),
  new MongooseUserRepository()
);

export async function listVoiceArtists(req: Request, res: Response) {
  const status = req.query.status ? String(req.query.status) : "all";
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);

  if (status !== "all" && status !== "active" && status !== "pending") {
    return res.status(400).json({ error: "invalid_status" });
  }

  const voiceArtists = await useCases.list(status);
  const filtered = q
    ? voiceArtists.filter((artist) =>
        [artist.email, artist.displayName, artist.language, artist.isActive ? "active" : "pending"].some((value) =>
          includesSearch(value, q)
        )
      )
    : voiceArtists;
  const paginated = paginate(filtered, paginationInput);
  return res.status(200).json({
    total: filtered.length,
    voiceArtists: paginated.items,
    pagination: paginated.pagination
  });
}

export async function activateVoiceArtist(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const voiceArtist = await useCases.activate(id);
  if (!voiceArtist) {
    return res.status(404).json({ error: "voice_artist_not_found" });
  }

  return res.status(200).json({ voiceArtist });
}

export async function deactivateVoiceArtist(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const voiceArtist = await useCases.deactivate(id);
  if (!voiceArtist) {
    return res.status(404).json({ error: "voice_artist_not_found" });
  }

  return res.status(200).json({ voiceArtist });
}

export async function deleteVoiceArtist(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const deleted = await useCases.delete(id);
  if (!deleted) {
    return res.status(404).json({ error: "voice_artist_not_found" });
  }

  return res.status(200).json({ message: "voice_artist_deleted" });
}
