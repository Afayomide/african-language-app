import type { Request, Response } from "express";
import { AuthError } from "../../application/use-cases/auth/AuthErrors.js";
import { LearnerAuthUseCases } from "../../application/use-cases/auth/LearnerAuthUseCases.js";
import { AuthTokenService } from "../../application/services/AuthTokenService.js";
import { MongooseLearnerProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLearnerProfileRepository.js";
import { MongooseUserRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUserRepository.js";
import {
  isStrongEnoughPassword,
  isValidEmail,
  normalizeEmail
} from "../../interfaces/http/validators/auth.validators.js";
import { isValidLessonLanguage } from "../../interfaces/http/validators/lesson.validators.js";

const useCases = new LearnerAuthUseCases(
  new MongooseUserRepository(),
  new MongooseLearnerProfileRepository(),
  new AuthTokenService()
);

export async function signup(req: Request, res: Response) {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: "server_misconfigured_jwt_secret" });
  }

  const { name, email, password, language, dailyGoalMinutes } = req.body ?? {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: "name_email_password_required" });
  }
  if (!isValidEmail(String(email))) {
    return res.status(400).json({ error: "invalid_email" });
  }
  if (!isStrongEnoughPassword(String(password))) {
    return res.status(400).json({ error: "password_too_short" });
  }
  if (language && !isValidLessonLanguage(String(language))) {
    return res.status(400).json({ error: "invalid_language" });
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

    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ error: error.code });
    }

    return res.status(500).json({ error: "internal_server_error" });
  }
}

export async function login(req: Request, res: Response) {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: "server_misconfigured_jwt_secret" });
  }

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
