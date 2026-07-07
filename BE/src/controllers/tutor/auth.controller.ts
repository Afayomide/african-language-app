import type { Request, Response } from "express";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { AuthError } from "../../application/use-cases/auth/AuthErrors.js";
import { TutorAuthUseCases } from "../../application/use-cases/auth/TutorAuthUseCases.js";
import { AuthTokenService } from "../../application/services/AuthTokenService.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import { MongooseUserRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUserRepository.js";
import {
  isStrongEnoughPassword,
  isValidEmail,
  normalizeEmail
} from "../../interfaces/http/validators/auth.validators.js";
import { isValidLessonLanguage } from "../../interfaces/http/validators/lesson.validators.js";

const useCases = new TutorAuthUseCases(
  new MongooseUserRepository(),
  new MongooseTutorProfileRepository(),
  new AuthTokenService()
);

export async function signup(req: Request, res: Response) {
  const { email, password, displayName } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  if (!isValidEmail(String(email))) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (!isStrongEnoughPassword(String(password))) {
    return res.status(400).json({ error: "Password must be at least 8 characters long." });
  }

  try {
    const result = await useCases.signup({
      email: normalizeEmail(String(email)),
      password: String(password),
      displayName: displayName ? String(displayName) : undefined
    });

    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ error: error.message });
    }

    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const result = await useCases.login({
      email: normalizeEmail(String(email)),
      password: String(password)
    });

    return res.status(200).json(result);
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

export async function completeOnboarding(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "You are not authorized to perform this action." });
  }

  const { language } = req.body ?? {};
  if (!language || !isValidLessonLanguage(String(language))) {
    return res.status(400).json({ error: "Selected language is not valid." });
  }

  try {
    const result = await useCases.completeOnboarding({
      userId: req.user.id,
      language: String(language) as "yoruba" | "igbo" | "hausa" | "pidgin"
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ error: error.message });
    }

    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
