import bcrypt from "bcryptjs";
import type { LearnerProfileEntity } from "../../../domain/entities/LearnerProfile.js";
import type { UserRepository } from "../../../domain/repositories/UserRepository.js";
import type { LearnerProfileRepository } from "../../../domain/repositories/LearnerProfileRepository.js";
import { AuthTokenService } from "../../services/AuthTokenService.js";
import { AuthError } from "./AuthErrors.js";

export class LearnerAuthUseCases {
  constructor(
    private readonly users: UserRepository,
    private readonly learnerProfiles: LearnerProfileRepository,
    private readonly tokens: AuthTokenService
  ) {}

  async signup(input: {
    name: string;
    email: string;
    password: string;
    language?: "yoruba" | "igbo" | "hausa";
    dailyGoalMinutes?: number;
  }) {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      throw new AuthError(409, "email_already_in_use");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.users.create({ email: input.email, passwordHash, role: "learner" });

    let profile: LearnerProfileEntity;
    try {
      profile = await this.learnerProfiles.create({
        userId: user.id,
        displayName: input.name.trim(),
        currentLanguage: input.language || "yoruba",
        dailyGoalMinutes: input.dailyGoalMinutes && input.dailyGoalMinutes > 0 ? input.dailyGoalMinutes : 10
      });
    } catch (error) {
      await this.users.deleteByIdAndRole(user.id, "learner");
      throw error;
    }

    const token = this.tokens.sign(user.id, user.email, "learner");

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      profile
    };
  }

  async login(input: { email: string; password: string }) {
    const user = await this.users.findByEmail(input.email);
    if (!user || user.role !== "learner") {
      throw new AuthError(401, "invalid_credentials");
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new AuthError(401, "invalid_credentials");
    }

    let profile = await this.learnerProfiles.findByUserId(user.id);
    if (!profile) {
      profile = await this.learnerProfiles.create({
        userId: user.id,
        displayName: "",
        currentLanguage: "yoruba",
        dailyGoalMinutes: 10
      });
    }

    const token = this.tokens.sign(user.id, user.email, "learner");

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      profile
    };
  }
}
