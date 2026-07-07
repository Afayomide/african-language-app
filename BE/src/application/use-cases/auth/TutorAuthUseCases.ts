import bcrypt from "bcryptjs";
import type { Language } from "../../../domain/entities/Lesson.js";
import type { TutorProfileRepository } from "../../../domain/repositories/TutorProfileRepository.js";
import type { UserRepository } from "../../../domain/repositories/UserRepository.js";
import { AuthTokenService } from "../../services/AuthTokenService.js";
import { AuthError } from "./AuthErrors.js";

function serializeTutor(tutor: {
  id: string;
  language?: Language | null;
  displayName: string;
  isActive: boolean;
}) {
  return {
    id: tutor.id,
    language: tutor.language || null,
    displayName: tutor.displayName,
    isActive: tutor.isActive
  };
}

export class TutorAuthUseCases {
  constructor(
    private readonly users: UserRepository,
    private readonly tutorProfiles: TutorProfileRepository,
    private readonly tokens: AuthTokenService
  ) {}

  async signup(input: {
    email: string;
    password: string;
    displayName?: string;
  }) {
    const existing = await this.users.findByEmail(input.email);
    const passwordHash = await bcrypt.hash(input.password, 10);
    let user = existing;

    if (!user) {
      user = await this.users.create({ email: input.email, passwordHash, roles: ["tutor", "learner"] });
    } else {
      const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
      if (!passwordMatches) {
        throw new AuthError(409, "Email is already in use by another account.");
      }
      if (!user.roles.includes("tutor")) {
        const withTutorRole = await this.users.addRole(user.id, "tutor");
        if (!withTutorRole) {
          throw new AuthError(500, "Failed to assign tutor role.");
        }
        user = withTutorRole;
      }
      if (!user.roles.includes("learner")) {
        const withLearnerRole = await this.users.addRole(user.id, "learner");
        if (!withLearnerRole) {
          throw new AuthError(500, "Failed to assign learner role.");
        }
        user = withLearnerRole;
      }
    }

    let tutor = await this.tutorProfiles.findByUserId(user.id);
    if (!tutor) {
      tutor = await this.tutorProfiles.create({
        userId: user.id,
        language: null,
        displayName: input.displayName?.trim() || "",
        isActive: false
      });
    }

    return {
      message: "Signup successful. Your tutor account is pending admin activation.",
      user: { id: user.id, email: user.email, role: "tutor" as const, roles: user.roles },
      tutor: serializeTutor(tutor),
      requiresOnboarding: !tutor.language
    };
  }

  async login(input: { email: string; password: string }) {
    const user = await this.users.findByEmail(input.email);
    if (!user || !user.roles.includes("tutor")) {
      throw new AuthError(401, "Invalid email or password.");
    }

    const tutor = await this.tutorProfiles.findByUserId(user.id);
    if (!tutor || !tutor.isActive) {
      throw new AuthError(403, "Tutor account is pending activation.");
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new AuthError(401, "Invalid email or password.");
    }

    const token = this.tokens.sign(user.id, user.email, "tutor");

    return {
      user: { id: user.id, email: user.email, role: "tutor" as const, roles: user.roles },
      tutor: serializeTutor(tutor),
      requiresOnboarding: !tutor.language,
      token
    };
  }

  async me(input: { userId: string; email: string; role: "admin" | "learner" | "tutor" | "voice_artist" }) {
    const tutor = await this.tutorProfiles.findByUserId(input.userId);
    if (!tutor) {
      throw new AuthError(404, "Tutor profile was not found.");
    }

    return {
      user: {
        id: input.userId,
        email: input.email,
        role: input.role
      },
      tutor: serializeTutor(tutor),
      requiresOnboarding: !tutor.language
    };
  }

  async completeOnboarding(input: { userId: string; language: Language }) {
    const tutor = await this.tutorProfiles.findByUserId(input.userId);
    if (!tutor) {
      throw new AuthError(404, "Tutor profile was not found.");
    }
    if (!tutor.isActive) {
      throw new AuthError(403, "Tutor account is pending activation.");
    }

    const updated = await this.tutorProfiles.updateByUserId(input.userId, { language: input.language });
    if (!updated) {
      throw new AuthError(500, "Failed to update tutor onboarding.");
    }

    return {
      tutor: serializeTutor(updated),
      requiresOnboarding: !updated.language
    };
  }
}
