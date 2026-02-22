import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";
const TOKEN_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"];

export type AuthRole = "admin" | "learner" | "tutor";

export class AuthTokenService {
  sign(userId: string, email: string, role: AuthRole) {
    if (!JWT_SECRET) {
      throw new Error("server_misconfigured_jwt_secret");
    }

    return jwt.sign({ sub: userId, email, role }, JWT_SECRET, {
      expiresIn: TOKEN_EXPIRES_IN
    });
  }
}
