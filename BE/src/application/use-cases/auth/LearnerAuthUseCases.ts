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
    const passwordHash = await bcrypt.hash(input.password, 10);
    let user = existing;

    if (!user) {
      user = await this.users.create({ email: input.email, passwordHash, roles: ["learner"] });
    } else {
      const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
      if (!passwordMatches) {
        throw new AuthError(409, "Email is already in use by another account.");
      }
      if (!user.roles.includes("learner")) {
        const withLearnerRole = await this.users.addRole(user.id, "learner");
        if (!withLearnerRole) {
          throw new AuthError(500, "Failed to assign learner role.");
        }
        user = withLearnerRole;
      }
    }

    let profile: LearnerProfileEntity | null = await this.learnerProfiles.findByUserId(user.id);
    if (!profile) {
      profile = await this.learnerProfiles.create({
        userId: user.id,
        displayName: input.name.trim(),
        currentLanguage: input.language || "yoruba",
        dailyGoalMinutes: input.dailyGoalMinutes && input.dailyGoalMinutes > 0 ? input.dailyGoalMinutes : 10
      });
    }

    const token = this.tokens.sign(user.id, user.email, "learner");

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: "learner" as const,
        roles: user.roles
      },
      profile
    };
  }

  async login(input: { email: string; password: string }) {
    const user = await this.users.findByEmail(input.email);
    if (!user || !user.roles.includes("learner")) {
      throw new AuthError(401, "Invalid email or password.");
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new AuthError(401, "Invalid email or password.");
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
        role: "learner" as const,
        roles: user.roles
      },
      profile
    };
  }
}
