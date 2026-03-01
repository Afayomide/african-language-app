import type { Request, Response } from "express";
import { AdminAuthUseCases } from "../../application/use-cases/auth/AdminAuthUseCases.js";
import { AuthError } from "../../application/use-cases/auth/AuthErrors.js";
import { AuthTokenService } from "../../application/services/AuthTokenService.js";
import { MongooseUserRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUserRepository.js";
import { normalizeEmail } from "../../interfaces/http/validators/auth.validators.js";

const useCases = new AdminAuthUseCases(new MongooseUserRepository(), new AuthTokenService());

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
