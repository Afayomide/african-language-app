import type { Request, Response, NextFunction } from "express";

// Placeholder auth middleware. Replace with real validation.
export function auth(_req: Request, res: Response, next: NextFunction) {
  const header = _req.header("authorization");
  if (!header) {
    return res.status(401).json({ error: "missing_authorization" });
  }

  // TODO: validate token
  return next();
}
