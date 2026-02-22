import bcrypt from "bcryptjs";
import type { VoiceArtistProfileRepository } from "../../../../domain/repositories/VoiceArtistProfileRepository.js";
import type { UserRepository } from "../../../../domain/repositories/UserRepository.js";
import { AuthTokenService } from "../../../services/AuthTokenService.js";
import { AuthError } from "../../auth/AuthErrors.js";
import type { AuthRole } from "../../../services/AuthTokenService.js";

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
    if (existing) {
      throw new AuthError(409, "email_already_in_use");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.users.create({
      email: input.email,
      passwordHash,
      role: "voice_artist"
    });

    let profile;
    try {
      profile = await this.voiceProfiles.create({
        userId: user.id,
        language: input.language,
        displayName: input.displayName?.trim() || "",
        isActive: false
      });
    } catch (error) {
      await this.users.deleteByIdAndRole(user.id, "voice_artist");
      throw error;
    }

    return {
      message: "signup_success_pending_admin_activation",
      user: { id: user.id, email: user.email, role: user.role },
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
    if (!user || user.role !== "voice_artist") {
      throw new AuthError(401, "invalid_credentials");
    }

    const profile = await this.voiceProfiles.findByUserId(user.id);
    if (!profile || !profile.isActive) {
      throw new AuthError(403, "voice_artist_profile_inactive_or_missing");
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new AuthError(401, "invalid_credentials");
    }

    const token = this.tokens.sign(user.id, user.email, "voice_artist");

    return {
      user: { id: user.id, email: user.email, role: user.role },
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
      throw new AuthError(404, "voice_artist_profile_not_found");
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
