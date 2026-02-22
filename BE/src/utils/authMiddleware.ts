import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type AuthUser = {
  id: string;
  email: string;
  role: "admin" | "learner" | "tutor";
};

export type AuthRequest = Request & { user?: AuthUser };

const JWT_SECRET = process.env.JWT_SECRET || "";

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing_or_invalid_authorization" });
  }

  if (!JWT_SECRET) {
    return res.status(500).json({ error: "server_misconfigured" });
  }

  const token = header.replace("Bearer ", "").trim();

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      email: string;
      role: "admin" | "learner" | "tutor";
    };

    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "admin_only" });
  }
  return next();
}

export function requireLearner(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "learner") {
    return res.status(403).json({ error: "learner_only" });
  }
  return next();
}

export function requireTutor(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "tutor") {
    return res.status(403).json({ error: "tutor_only" });
  }
  return next();
}
