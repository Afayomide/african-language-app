import type { Request, Response } from "express";
import { AuthError } from "../../application/use-cases/auth/AuthErrors.js";
import { LearnerAuthUseCases } from "../../application/use-cases/auth/LearnerAuthUseCases.js";
import { AuthTokenService } from "../../application/services/AuthTokenService.js";
import { MongooseLearnerLanguageStateRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLearnerLanguageStateRepository.js";
import { MongooseLearnerProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLearnerProfileRepository.js";
import { MongooseUserRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUserRepository.js";
import {
  isStrongEnoughPassword,
  isValidEmail,
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
      name: String(name),
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
    displayName,
    proficientLanguage,
    countryOfOrigin,
    currentLanguage,
    dailyGoalMinutes
  } = req.body ?? {};

  if (displayName !== undefined && !String(displayName).trim()) {
    return res.status(400).json({ error: "Display name cannot be empty." });
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
      displayName: displayName !== undefined ? String(displayName) : undefined,
      proficientLanguage: proficientLanguage !== undefined ? String(proficientLanguage) : undefined,
      countryOfOrigin: countryOfOrigin !== undefined ? String(countryOfOrigin) : undefined,
      currentLanguage:
        currentLanguage !== undefined ? (String(currentLanguage) as "yoruba" | "igbo" | "hausa") : undefined,
      dailyGoalMinutes: parsedDailyGoalMinutes
    });

    console.log("[LEARNER_PROFILE_UPDATE] saved", {
      user: req.user,
      profile: result.profile,
      requiresOnboarding: result.requiresOnboarding
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ error: error.message });
    }

    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
