import type { Request, Response } from "express";
import { AuthError } from "../../application/use-cases/auth/AuthErrors.js";
import { LearnerAuthUseCases } from "../../application/use-cases/auth/LearnerAuthUseCases.js";
import { AuthTokenService } from "../../application/services/AuthTokenService.js";
import { MongooseLearnerLanguageStateRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLearnerLanguageStateRepository.js";
import { MongooseLearnerProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLearnerProfileRepository.js";
import { MongooseUserRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUserRepository.js";
import {
  isValidHttpUrl,
  isValidPersonName,
  isStrongEnoughPassword,
  isValidEmail,
  isValidUsername,
  normalizePersonName,
  normalizeUsername,
  normalizeEmail
} from "../../interfaces/http/validators/auth.validators.js";
import { isValidLessonLanguage } from "../../interfaces/http/validators/lesson.validators.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";

const useCases = new LearnerAuthUseCases(
  new MongooseUserRepository(),
  new MongooseLearnerProfileRepository(),
  new MongooseLearnerLanguageStateRepository(),
  new AuthTokenService()
);

export async function signup(req: Request, res: Response) {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: "Server configuration is incomplete." });
  }

  const { name, email, password, language, dailyGoalMinutes } = req.body ?? {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required." });
  }
  if (!isValidPersonName(String(name))) {
    return res.status(400).json({ error: "Name can only contain letters, spaces, apostrophes, and hyphens." });
  }
  if (!isValidEmail(String(email))) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (!isStrongEnoughPassword(String(password))) {
    return res.status(400).json({ error: "Password must be at least 8 characters long." });
  }
  if (language && !isValidLessonLanguage(String(language))) {
    return res.status(400).json({ error: "Selected language is not valid." });
  }

  try {
    const normalizedLanguage = language
      ? (String(language) as "yoruba" | "igbo" | "hausa")
      : undefined;

    const result = await useCases.signup({
      name: normalizePersonName(String(name)),
      email: normalizeEmail(String(email)),
      password: String(password),
      language: normalizedLanguage,
      dailyGoalMinutes: dailyGoalMinutes ? Number(dailyGoalMinutes) : undefined
    });

    return res.status(201).json({
      ...result,
      message: "Account created successfully. Complete your profile to start learning."
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error("[LEARNER_AUTH_LOGIN] unexpected error", error);

    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

export async function login(req: Request, res: Response) {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: "Server configuration is incomplete." });
  }

  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const result = await useCases.login({
      email: normalizeEmail(String(email)),
      password: String(password)
    });

    return res.status(200).json({
      ...result,
      message: result.requiresOnboarding
        ? "Signed in successfully. Complete your profile to continue."
        : "Signed in successfully."
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error("[LEARNER_PROFILE_UPDATE] unexpected error", error);

    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

export async function me(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "You are not authorized to perform this action." });
  }

  try {
    const result = await useCases.me({
      userId: req.user.id,
      email: req.user.email,
      role: req.user.role
    });
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ error: error.message });
    }

    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

export async function updateProfile(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "You are not authorized to perform this action." });
  }

  const {
    name,
    displayName,
    username,
    avatarUrl,
    email,
    proficientLanguage,
    countryOfOrigin,
    currentLanguage,
    dailyGoalMinutes
  } = req.body ?? {};

  const resolvedName = name !== undefined ? name : displayName;

  if (resolvedName !== undefined && !String(resolvedName).trim()) {
    return res.status(400).json({ error: "Name cannot be empty." });
  }
  if (resolvedName !== undefined && !isValidPersonName(String(resolvedName))) {
    return res.status(400).json({ error: "Name can only contain letters, spaces, apostrophes, and hyphens." });
  }
  if (username !== undefined && String(username).trim() && !isValidUsername(String(username))) {
    return res.status(400).json({ error: "Username must be 3-24 characters and use only lowercase letters, numbers, or underscores." });
  }
  if (avatarUrl !== undefined && String(avatarUrl).trim() && !isValidHttpUrl(String(avatarUrl))) {
    return res.status(400).json({ error: "Avatar URL must be a valid http or https URL." });
  }
  if (email !== undefined && !isValidEmail(String(email))) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (proficientLanguage !== undefined && !String(proficientLanguage).trim()) {
    return res.status(400).json({ error: "Proficient language cannot be empty." });
  }
  if (countryOfOrigin !== undefined && !String(countryOfOrigin).trim()) {
    return res.status(400).json({ error: "Country of origin cannot be empty." });
  }
  if (currentLanguage !== undefined && !isValidLessonLanguage(String(currentLanguage))) {
    return res.status(400).json({ error: "Selected learning language is not valid." });
  }

  const parsedDailyGoalMinutes =
    dailyGoalMinutes !== undefined ? Number(dailyGoalMinutes) : undefined;
  if (
    parsedDailyGoalMinutes !== undefined &&
    (Number.isNaN(parsedDailyGoalMinutes) || parsedDailyGoalMinutes < 1 || parsedDailyGoalMinutes > 120)
  ) {
    return res.status(400).json({ error: "Daily goal must be between 1 and 120 minutes." });
  }

  try {
    const result = await useCases.updateProfile(req.user.id, {
      name: resolvedName !== undefined ? normalizePersonName(String(resolvedName)) : undefined,
      username: username !== undefined ? (String(username).trim() ? normalizeUsername(String(username)) : "") : undefined,
      avatarUrl: avatarUrl !== undefined ? String(avatarUrl).trim() : undefined,
      email: email !== undefined ? normalizeEmail(String(email)) : undefined,
      proficientLanguage: proficientLanguage !== undefined ? String(proficientLanguage) : undefined,
      countryOfOrigin: countryOfOrigin !== undefined ? String(countryOfOrigin) : undefined,
      currentLanguage:
        currentLanguage !== undefined ? (String(currentLanguage) as "yoruba" | "igbo" | "hausa") : undefined,
      dailyGoalMinutes: parsedDailyGoalMinutes
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error("[LEARNER_PROFILE_UPDATE] unexpected error", error);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

export async function changePassword(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "You are not authorized to perform this action." });
  }

  const { currentPassword, newPassword } = req.body ?? {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current password and new password are required." });
  }
  if (!isStrongEnoughPassword(String(newPassword))) {
    return res.status(400).json({ error: "Password must be at least 8 characters long." });
  }
  if (String(currentPassword) === String(newPassword)) {
    return res.status(400).json({ error: "New password must be different from the current password." });
  }

  try {
    const result = await useCases.changePassword(req.user.id, {
      currentPassword: String(currentPassword),
      newPassword: String(newPassword)
    });
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error("[LEARNER_PASSWORD_CHANGE] unexpected error", error);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
