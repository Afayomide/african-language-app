import type { Request, Response } from "express";
import { AuthError } from "../../application/use-cases/auth/AuthErrors.js";
import { VoiceArtistAuthUseCases } from "../../application/use-cases/voice/auth/VoiceArtistAuthUseCases.js";
import { AuthTokenService } from "../../application/services/AuthTokenService.js";
import { MongooseUserRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUserRepository.js";
import { MongooseVoiceArtistProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseVoiceArtistProfileRepository.js";
import {
  isStrongEnoughPassword,
  isValidEmail,
  normalizeEmail
} from "../../interfaces/http/validators/auth.validators.js";
import { isValidLessonLanguage } from "../../interfaces/http/validators/lesson.validators.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";

const useCases = new VoiceArtistAuthUseCases(
  new MongooseUserRepository(),
  new MongooseVoiceArtistProfileRepository(),
  new AuthTokenService()
);

export async function signup(req: Request, res: Response) {
  const { email, password, language, displayName } = req.body ?? {};

  if (!email || !password || !language) {
    return res.status(400).json({ error: "email_password_language_required" });
  }
  if (!isValidEmail(String(email))) {
    return res.status(400).json({ error: "invalid_email" });
  }
  if (!isStrongEnoughPassword(String(password))) {
    return res.status(400).json({ error: "password_too_short" });
  }
  if (!isValidLessonLanguage(String(language))) {
    return res.status(400).json({ error: "invalid_language" });
  }

  try {
    const result = await useCases.signup({
      email: normalizeEmail(String(email)),
      password: String(password),
      language: String(language) as "yoruba" | "igbo" | "hausa",
      displayName: displayName ? String(displayName) : undefined
    });

    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ error: error.code });
    }

    return res.status(500).json({ error: "internal_server_error" });
  }
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ error: "email_and_password_required" });
  }

  try {
    const result = await useCases.login({
      email: normalizeEmail(String(email)),
      password: String(password)
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ error: error.code });
    }

    return res.status(500).json({ error: "internal_server_error" });
  }
}

export async function me(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
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
      return res.status(error.status).json({ error: error.code });
    }

    return res.status(500).json({ error: "internal_server_error" });
  }
}
