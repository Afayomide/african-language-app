import type { Request, Response } from "express";
import mongoose from "mongoose";
import { AdminTutorUseCases } from "../../application/use-cases/admin/tutor/AdminTutorUseCases.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import { MongooseUserRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUserRepository.js";
import {
  getSearchQuery,
  includesSearch,
  paginate,
  parsePaginationQuery
} from "../../interfaces/http/utils/pagination.js";

const tutorUseCases = new AdminTutorUseCases(
  new MongooseTutorProfileRepository(),
  new MongooseUserRepository()
);

export async function listTutors(req: Request, res: Response) {
  const status = req.query.status ? String(req.query.status) : "all";
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);

  if (status !== "all" && status !== "active" && status !== "pending") {
    return res.status(400).json({ error: "invalid_status" });
  }

  const tutors = await tutorUseCases.list(status);
  const filtered = q
    ? tutors.filter((tutor) =>
        [tutor.email, tutor.displayName, tutor.language, tutor.isActive ? "active" : "pending"].some((value) =>
          includesSearch(value, q)
        )
      )
    : tutors;
  const paginated = paginate(filtered, paginationInput);

  return res.status(200).json({
    total: filtered.length,
    tutors: paginated.items,
    pagination: paginated.pagination
  });
}

export async function activateTutor(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const tutor = await tutorUseCases.activate(id);

  if (!tutor) {
    return res.status(404).json({ error: "tutor_not_found" });
  }

  return res.status(200).json({ tutor });
}

export async function deactivateTutor(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const tutor = await tutorUseCases.deactivate(id);

  if (!tutor) {
    return res.status(404).json({ error: "tutor_not_found" });
  }

  return res.status(200).json({ tutor });
}

export async function deleteTutor(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const deleted = await tutorUseCases.delete(id);
  if (!deleted) {
    return res.status(404).json({ error: "tutor_not_found" });
  }

  return res.status(200).json({ message: "tutor_deleted" });
}
