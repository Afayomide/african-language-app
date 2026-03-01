import type { Request, Response } from "express";
import mongoose from "mongoose";
import UserModel from "../../models/User.js";
import TutorProfileModel from "../../models/tutor/TutorProfile.js";
import VoiceArtistProfileModel from "../../models/voice/VoiceArtistProfile.js";
import {
  getSearchQuery,
  parsePaginationQuery
} from "../../interfaces/http/utils/pagination.js";

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

  const query: Record<string, unknown> = {};
  if (role !== "all") query.roles = role;
  if (q) query.email = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

  const total = await UserModel.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(total / paginationInput.limit));
  const page = Math.min(paginationInput.page, totalPages);
  const skip = (page - 1) * paginationInput.limit;

  const users = await UserModel.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(paginationInput.limit)
    .select("_id email roles createdAt updatedAt")
    .lean();

  const userIds = users.map((user) => user._id);
  const [tutorProfiles, voiceProfiles] = await Promise.all([
    TutorProfileModel.find({ userId: { $in: userIds } }).select("userId language displayName isActive").lean(),
    VoiceArtistProfileModel.find({ userId: { $in: userIds } }).select("userId language displayName isActive").lean()
  ]);

  const tutorByUserId = new Map(tutorProfiles.map((profile) => [String(profile.userId), profile]));
  const voiceByUserId = new Map(voiceProfiles.map((profile) => [String(profile.userId), profile]));

  return res.status(200).json({
    total,
    users: users.map((user) => {
      const userId = String(user._id);
      return {
        id: userId,
        email: user.email,
        roles: user.roles || [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        tutorProfile: tutorByUserId.get(userId) || null,
        voiceArtistProfile: voiceByUserId.get(userId) || null
      };
    }),
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
  if (!mongoose.Types.ObjectId.isValid(id)) {
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
  const user = await UserModel.findByIdAndUpdate(id, { roles: normalizedRoles }, { new: true })
    .select("_id email roles createdAt updatedAt")
    .lean();

  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  if (!normalizedRoles.includes("tutor")) {
    await TutorProfileModel.deleteOne({ userId: id });
  }
  if (!normalizedRoles.includes("voice_artist")) {
    await VoiceArtistProfileModel.deleteOne({ userId: id });
  }

  return res.status(200).json({
    user: {
      id: String(user._id),
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

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid user id." });
  }
  if (!isValidRole(role)) {
    return res.status(400).json({ error: "Invalid role." });
  }

  const user = await UserModel.findById(id).select("_id email roles createdAt updatedAt");
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const nextRoles = ensureLearnerRole(Array.from(new Set([...(user.roles || []), role])) as UserRole[]);
  user.roles = nextRoles;
  await user.save();

  if (role === "tutor" || role === "voice_artist") {
    const profileModel = role === "tutor" ? TutorProfileModel : VoiceArtistProfileModel;
    const existingProfile = await profileModel.findOne({ userId: id }).lean();
    const finalLanguage = language || existingProfile?.language;
    if (!finalLanguage || !["yoruba", "igbo", "hausa"].includes(finalLanguage)) {
      return res.status(400).json({ error: "A valid language is required for tutor or voice artist." });
    }

    await profileModel.findOneAndUpdate(
      { userId: id },
      {
        $set: {
          language: finalLanguage,
          displayName,
          isActive: existingProfile?.isActive || false
        }
      },
      { upsert: true, new: true }
    );
  }

  return res.status(200).json({ message: "Role assigned successfully." });
}

export async function activateUserRole(req: Request, res: Response) {
  const { id } = req.params;
  const role = String(req.body?.role || "");
  const language = req.body?.language ? String(req.body.language) : undefined;
  const displayName = req.body?.displayName ? String(req.body.displayName) : "";

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid user id." });
  }
  const user = await UserModel.findById(id).select("_id email roles createdAt updatedAt");
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
    user.roles = nextRoles;
    await user.save();
    return res.status(200).json({ message: "Role activated successfully." });
  }

  const existingTutor = role === "tutor" ? await TutorProfileModel.findOne({ userId: id }).lean() : null;
  const existingVoice =
    role === "voice_artist" ? await VoiceArtistProfileModel.findOne({ userId: id }).lean() : null;
  const finalLanguage = language || existingTutor?.language || existingVoice?.language;

  if (!finalLanguage || !["yoruba", "igbo", "hausa"].includes(finalLanguage)) {
    return res.status(400).json({ error: "A valid language is required to activate this role." });
  }

  const nextRoles = ensureLearnerRole(Array.from(new Set([...(user.roles || []), role])) as UserRole[]);
  user.roles = nextRoles;
  await user.save();

  if (role === "tutor") {
    await TutorProfileModel.findOneAndUpdate(
      { userId: id },
      {
        $set: {
          language: finalLanguage,
          displayName,
          isActive: true
        }
      },
      { upsert: true, new: true }
    );
  }

  if (role === "voice_artist") {
    await VoiceArtistProfileModel.findOneAndUpdate(
      { userId: id },
      {
        $set: {
          language: finalLanguage,
          displayName,
          isActive: true
        }
      },
      { upsert: true, new: true }
    );
  }

  return res.status(200).json({ message: "Role activated successfully." });
}

export async function deactivateUserRole(req: Request, res: Response) {
  const { id } = req.params;
  const role = String(req.body?.role || "");

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid user id." });
  }
  const user = await UserModel.findById(id).select("_id roles");
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
    user.roles = normalized;
    await user.save();
    if (!normalized.includes("tutor")) {
      await TutorProfileModel.deleteOne({ userId: id });
    }
    if (!normalized.includes("voice_artist")) {
      await VoiceArtistProfileModel.deleteOne({ userId: id });
    }
    return res.status(200).json({ message: "Role deactivated successfully." });
  }

  if (role === "tutor") {
    await TutorProfileModel.findOneAndUpdate({ userId: id }, { isActive: false });
  }
  if (role === "voice_artist") {
    await VoiceArtistProfileModel.findOneAndUpdate({ userId: id }, { isActive: false });
  }

  return res.status(200).json({ message: "Role deactivated successfully." });
}
