import bcrypt from "bcryptjs";
import type { TutorProfileRepository } from "../../../domain/repositories/TutorProfileRepository.js";
import type { UserRepository } from "../../../domain/repositories/UserRepository.js";
import { AuthTokenService } from "../../services/AuthTokenService.js";
import { AuthError } from "./AuthErrors.js";

export class TutorAuthUseCases {
  constructor(
    private readonly users: UserRepository,
    private readonly tutorProfiles: TutorProfileRepository,
    private readonly tokens: AuthTokenService
  ) {}

  async signup(input: {
    email: string;
    password: string;
    language: "yoruba" | "igbo" | "hausa";
    displayName?: string;
  }) {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      throw new AuthError(409, "email_already_in_use");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.users.create({ email: input.email, passwordHash, role: "tutor" });

    let tutor;
    try {
      tutor = await this.tutorProfiles.create({
        userId: user.id,
        language: input.language,
        displayName: input.displayName?.trim() || "",
        isActive: false
      });
    } catch (error) {
      await this.users.deleteByIdAndRole(user.id, "tutor");
      throw error;
    }

    return {
      message: "signup_success_pending_admin_activation",
      user: { id: user.id, email: user.email, role: user.role },
      tutor: {
        id: tutor.id,
        language: tutor.language,
        displayName: tutor.displayName,
        isActive: tutor.isActive
      }
    };
  }

  async login(input: { email: string; password: string }) {
    const user = await this.users.findByEmail(input.email);
    if (!user || user.role !== "tutor") {
      throw new AuthError(401, "invalid_credentials");
    }

    const tutor = await this.tutorProfiles.findByUserId(user.id);
    if (!tutor || !tutor.isActive) {
      throw new AuthError(403, "tutor_profile_inactive_or_missing");
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new AuthError(401, "invalid_credentials");
    }

    const token = this.tokens.sign(user.id, user.email, "tutor");

    return {
      user: { id: user.id, email: user.email, role: user.role },
      tutor: {
        id: tutor.id,
        language: tutor.language,
        displayName: tutor.displayName
      },
      token
    };
  }

  async me(input: { userId: string; email: string; role: "admin" | "learner" | "tutor" }) {
    const tutor = await this.tutorProfiles.findByUserId(input.userId);
    if (!tutor) {
      throw new AuthError(404, "tutor_profile_not_found");
    }

    return {
      user: {
        id: input.userId,
        email: input.email,
        role: input.role
      },
      tutor: {
        id: tutor.id,
        language: tutor.language,
        displayName: tutor.displayName,
        isActive: tutor.isActive
      }
    };
  }
}
