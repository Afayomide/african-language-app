import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type AuthUser = {
  id: string;
  email: string;
  role: "admin" | "learner" | "tutor" | "voice_artist";
};

export type AuthRequest = Request & { user?: AuthUser };

const JWT_SECRET = process.env.JWT_SECRET || "";

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization token is missing or invalid." });
  }

  if (!JWT_SECRET) {
    return res.status(500).json({ error: "Server configuration is incomplete." });
  }

  const token = header.replace("Bearer ", "").trim();

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      email: string;
      role: "admin" | "learner" | "tutor" | "voice_artist";
    };

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Session is invalid or has expired. Please log in again." });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "This action is only available to administrators." });
  }
  return next();
}

export function requireLearner(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "learner") {
    return res.status(403).json({ error: "This action is only available to learners." });
  }
  return next();
}

export function requireTutor(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "tutor") {
    return res.status(403).json({ error: "This action is only available to tutors." });
  }
  return next();
}

export function requireVoiceArtist(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "voice_artist") {
    return res.status(403).json({ error: "This action is only available to voice artists." });
  }
  return next();
}
