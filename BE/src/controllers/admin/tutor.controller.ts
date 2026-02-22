import type { Request, Response } from "express";
import mongoose from "mongoose";
import { AdminTutorUseCases } from "../../application/use-cases/admin/tutor/AdminTutorUseCases.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import { MongooseUserRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUserRepository.js";

const tutorUseCases = new AdminTutorUseCases(
  new MongooseTutorProfileRepository(),
  new MongooseUserRepository()
);

export async function listTutors(req: Request, res: Response) {
  const status = req.query.status ? String(req.query.status) : "all";

  if (status !== "all" && status !== "active" && status !== "pending") {
    return res.status(400).json({ error: "invalid_status" });
  }

  const tutors = await tutorUseCases.list(status);

  return res.status(200).json({
    total: tutors.length,
    tutors
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
