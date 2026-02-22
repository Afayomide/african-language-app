import bcrypt from "bcryptjs";
import type { UserRepository } from "../../../domain/repositories/UserRepository.js";
import { AuthTokenService } from "../../services/AuthTokenService.js";
import { AuthError } from "./AuthErrors.js";

export class AdminAuthUseCases {
  constructor(
    private readonly users: UserRepository,
    private readonly tokens: AuthTokenService
  ) {}

  async login(input: { email: string; password: string }) {
    const user = await this.users.findByEmail(input.email);
    if (!user || user.role !== "admin") {
      throw new AuthError(401, "invalid_credentials");
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new AuthError(401, "invalid_credentials");
    }

    const token = this.tokens.sign(user.id, user.email, "admin");
    return {
      user: { id: user.id, email: user.email, role: user.role },
      token
    };
  }
}
