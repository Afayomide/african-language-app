import bcrypt from "bcryptjs";
import type { VoiceArtistProfileRepository } from "../../../domain/repositories/VoiceArtistProfileRepository.js";
import type { UserRepository } from "../../../domain/repositories/UserRepository.js";
import { AuthTokenService } from "../../services/AuthTokenService.js";
import { AuthError } from "./AuthErrors.js";
import type { AuthRole } from "../../services/AuthTokenService.js";

export class VoiceArtistAuthUseCases {
  constructor(
    private readonly users: UserRepository,
    private readonly voiceProfiles: VoiceArtistProfileRepository,
    private readonly tokens: AuthTokenService
  ) {}

  async signup(input: {
    email: string;
    password: string;
    language: "yoruba" | "igbo" | "hausa";
    displayName?: string;
  }) {
    const existing = await this.users.findByEmail(input.email);
    const passwordHash = await bcrypt.hash(input.password, 10);
    let user = existing;

    if (!user) {
      user = await this.users.create({
        email: input.email,
        passwordHash,
        roles: ["voice_artist", "learner"]
      });
    } else {
      const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
      if (!passwordMatches) {
        throw new AuthError(409, "Email is already in use by another account.");
      }
      if (!user.roles.includes("voice_artist")) {
        const withVoiceRole = await this.users.addRole(user.id, "voice_artist");
        if (!withVoiceRole) {
          throw new AuthError(500, "Failed to assign voice artist role.");
        }
        user = withVoiceRole;
      }
      if (!user.roles.includes("learner")) {
        const withLearnerRole = await this.users.addRole(user.id, "learner");
        if (!withLearnerRole) {
          throw new AuthError(500, "Failed to assign learner role.");
        }
        user = withLearnerRole;
      }
    }

    let profile = await this.voiceProfiles.findByUserId(user.id);
    if (!profile) {
      profile = await this.voiceProfiles.create({
        userId: user.id,
        language: input.language,
        displayName: input.displayName?.trim() || "",
        isActive: false
      });
    }

    return {
      message: "Signup successful. Your voice artist account is pending admin activation.",
      user: { id: user.id, email: user.email, role: "voice_artist" as const, roles: user.roles },
      voiceArtist: {
        id: profile.id,
        language: profile.language,
        displayName: profile.displayName,
        isActive: profile.isActive
      }
    };
  }

  async login(input: { email: string; password: string }) {
    const user = await this.users.findByEmail(input.email);
    if (!user || !user.roles.includes("voice_artist")) {
      throw new AuthError(401, "Invalid email or password.");
    }

    const profile = await this.voiceProfiles.findByUserId(user.id);
    if (!profile || !profile.isActive) {
      throw new AuthError(403, "Voice artist account is pending activation.");
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new AuthError(401, "Invalid email or password.");
    }

    const token = this.tokens.sign(user.id, user.email, "voice_artist");

    return {
      user: { id: user.id, email: user.email, role: "voice_artist" as const, roles: user.roles },
      voiceArtist: {
        id: profile.id,
        language: profile.language,
        displayName: profile.displayName
      },
      token
    };
  }

  async me(input: { userId: string; email: string; role: AuthRole }) {
    const profile = await this.voiceProfiles.findByUserId(input.userId);
    if (!profile) {
      throw new AuthError(404, "Voice artist profile was not found.");
    }

    return {
      user: {
        id: input.userId,
        email: input.email,
        role: input.role
      },
      voiceArtist: {
        id: profile.id,
        language: profile.language,
        displayName: profile.displayName,
        isActive: profile.isActive
      }
    };
  }
}
