import type { Request, Response } from "express";
import { isValidId } from "../../utils/ids.js";
import type { Language } from "../../domain/entities/Lesson.js";
import { DrizzleUserRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleUserRepository.js";
import { DrizzleTutorProfileRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleTutorProfileRepository.js";
import { DrizzleVoiceArtistProfileRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleVoiceArtistProfileRepository.js";
import { isValidLessonLanguage } from "../../interfaces/http/validators/lesson.validators.js";
import {
  getSearchQuery,
  parsePaginationQuery
} from "../../interfaces/http/utils/pagination.js";

const userRepo = new DrizzleUserRepository();
const tutorProfileRepo = new DrizzleTutorProfileRepository();
const voiceArtistProfileRepo = new DrizzleVoiceArtistProfileRepository();

type UserRole = "admin" | "learner" | "tutor" | "voice_artist";

const VALID_ROLES: UserRole[] = ["admin", "learner", "tutor", "voice_artist"];

function isValidRole(role: string): role is UserRole {
  return VALID_ROLES.includes(role as UserRole);
}

function normalizeRoles(input: unknown): UserRole[] | null {
  if (!Array.isArray(input)) return null;
  const roles = Array.from(new Set(input.map((item) => String(item)))) as UserRole[];
  if (roles.some((role) => !isValidRole(role))) return null;
  return roles;
}

function ensureLearnerRole(roles: UserRole[]) {
  const privileged = roles.includes("admin") || roles.includes("tutor") || roles.includes("voice_artist");
  if (privileged && !roles.includes("learner")) {
    return [...roles, "learner"] as UserRole[];
  }
  return roles;
}

function hasPrivilegedRole(roles: UserRole[]) {
  return roles.includes("admin") || roles.includes("tutor") || roles.includes("voice_artist");
}

export async function listUsers(req: Request, res: Response) {
  const role = req.query.role ? String(req.query.role) : "all";
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);

  if (role !== "all" && !isValidRole(role)) {
    return res.status(400).json({ error: "Invalid role filter." });
  }

  const { items: users, total } = await userRepo.listPaged({
    role: role === "all" ? undefined : role,
    search: q || undefined,
    page: paginationInput.page,
    limit: paginationInput.limit
  });
  const totalPages = Math.max(1, Math.ceil(total / paginationInput.limit));
  const page = Math.min(paginationInput.page, totalPages);

  const userIds = users.map((user) => user.id);
  const [tutorProfiles, voiceProfiles] = await Promise.all([
    tutorProfileRepo.listByUserIds(userIds),
    voiceArtistProfileRepo.listByUserIds(userIds)
  ]);

  const tutorByUserId = new Map(tutorProfiles.map((profile) => [String(profile.userId), profile]));
  const voiceByUserId = new Map(voiceProfiles.map((profile) => [String(profile.userId), profile]));

  return res.status(200).json({
    total,
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      roles: user.roles || [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      tutorProfile: tutorByUserId.get(user.id) || null,
      voiceArtistProfile: voiceByUserId.get(user.id) || null
    })),
    pagination: {
      page,
      limit: paginationInput.limit,
      total,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages
    }
  });
}

export async function updateUserRoles(req: Request, res: Response) {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: "Invalid user id." });
  }

  const roles = normalizeRoles(req.body?.roles);
  if (!roles) {
    return res.status(400).json({ error: "Roles must be a valid array." });
  }
  if (hasPrivilegedRole(roles) && !roles.includes("learner")) {
    return res.status(400).json({ error: "Learner role is required when admin, tutor, or voice artist role is assigned." });
  }

  const normalizedRoles = ensureLearnerRole(roles);
  const user = await userRepo.setRoles(id, normalizedRoles);

  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  if (!normalizedRoles.includes("tutor")) {
    await tutorProfileRepo.deleteByUserId(id);
  }
  if (!normalizedRoles.includes("voice_artist")) {
    await voiceArtistProfileRepo.deleteByUserId(id);
  }

  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      roles: user.roles || [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  });
}

export async function assignUserRole(req: Request, res: Response) {
  const { id } = req.params;
  const role = String(req.body?.role || "");
  const language = req.body?.language ? String(req.body.language) : undefined;
  const displayName = req.body?.displayName ? String(req.body.displayName) : "";

  if (!isValidId(id)) {
    return res.status(400).json({ error: "Invalid user id." });
  }
  if (!isValidRole(role)) {
    return res.status(400).json({ error: "Invalid role." });
  }

  const user = await userRepo.findById(id);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const nextRoles = ensureLearnerRole(Array.from(new Set([...(user.roles || []), role])) as UserRole[]);
  await userRepo.setRoles(id, nextRoles);

  if (role === "tutor") {
    const existingProfile = await tutorProfileRepo.findByUserId(id);
    const finalLanguage = language || existingProfile?.language;
    if (!finalLanguage || !isValidLessonLanguage(finalLanguage)) {
      return res.status(400).json({ error: "A valid language is required for tutor or voice artist." });
    }

    await tutorProfileRepo.upsertByUserId(id, {
      language: finalLanguage as Language,
      displayName,
      isActive: existingProfile?.isActive || false
    });
  }

  if (role === "voice_artist") {
    const existingProfile = await voiceArtistProfileRepo.findByUserId(id);
    const finalLanguage = language || existingProfile?.language;
    if (!finalLanguage || !isValidLessonLanguage(finalLanguage)) {
      return res.status(400).json({ error: "A valid language is required for tutor or voice artist." });
    }

    await voiceArtistProfileRepo.upsertByUserId(id, {
      language: finalLanguage as Language,
      displayName,
      isActive: existingProfile?.isActive || false
    });
  }

  return res.status(200).json({ message: "Role assigned successfully." });
}

export async function activateUserRole(req: Request, res: Response) {
  const { id } = req.params;
  const role = String(req.body?.role || "");
  const language = req.body?.language ? String(req.body.language) : undefined;
  const displayName = req.body?.displayName ? String(req.body.displayName) : "";

  if (!isValidId(id)) {
    return res.status(400).json({ error: "Invalid user id." });
  }
  const user = await userRepo.findById(id);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  if (!isValidRole(role)) {
    return res.status(400).json({ error: "Invalid role." });
  }
  if (role === "learner" && hasPrivilegedRole(user.roles || [])) {
    return res.status(400).json({ error: "Cannot deactivate learner role while admin, tutor, or voice artist role is still assigned." });
  }

  if (role === "admin" || role === "learner") {
    const nextRoles = ensureLearnerRole(Array.from(new Set([...(user.roles || []), role])) as UserRole[]);
    await userRepo.setRoles(id, nextRoles);
    return res.status(200).json({ message: "Role activated successfully." });
  }

  const existingTutor = role === "tutor" ? await tutorProfileRepo.findByUserId(id) : null;
  const existingVoice = role === "voice_artist" ? await voiceArtistProfileRepo.findByUserId(id) : null;
  const finalLanguage = language || existingTutor?.language || existingVoice?.language;

  if (!finalLanguage || !isValidLessonLanguage(finalLanguage)) {
    return res.status(400).json({ error: "A valid language is required to activate this role." });
  }

  const nextRoles = ensureLearnerRole(Array.from(new Set([...(user.roles || []), role])) as UserRole[]);
  await userRepo.setRoles(id, nextRoles);

  if (role === "tutor") {
    await tutorProfileRepo.upsertByUserId(id, {
      language: finalLanguage as Language,
      displayName,
      isActive: true
    });
  }

  if (role === "voice_artist") {
    await voiceArtistProfileRepo.upsertByUserId(id, {
      language: finalLanguage as Language,
      displayName,
      isActive: true
    });
  }

  return res.status(200).json({ message: "Role activated successfully." });
}

export async function deactivateUserRole(req: Request, res: Response) {
  const { id } = req.params;
  const role = String(req.body?.role || "");

  if (!isValidId(id)) {
    return res.status(400).json({ error: "Invalid user id." });
  }
  const user = await userRepo.findById(id);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  if (!isValidRole(role)) {
    return res.status(400).json({ error: "Invalid role." });
  }

  if (role === "admin" || role === "learner") {
    const nextRoles = (user.roles || []).filter((entry) => entry !== role);
    if (nextRoles.length === 0) {
      return res.status(400).json({ error: "A user must keep at least one role." });
    }
    const normalized = ensureLearnerRole(nextRoles as UserRole[]);
    await userRepo.setRoles(id, normalized);
    if (!normalized.includes("tutor")) {
      await tutorProfileRepo.deleteByUserId(id);
    }
    if (!normalized.includes("voice_artist")) {
      await voiceArtistProfileRepo.deleteByUserId(id);
    }
    return res.status(200).json({ message: "Role deactivated successfully." });
  }

  if (role === "tutor") {
    await tutorProfileRepo.updateByUserId(id, { isActive: false });
  }
  if (role === "voice_artist") {
    await voiceArtistProfileRepo.updateByUserId(id, { isActive: false });
  }

  return res.status(200).json({ message: "Role deactivated successfully." });
}
