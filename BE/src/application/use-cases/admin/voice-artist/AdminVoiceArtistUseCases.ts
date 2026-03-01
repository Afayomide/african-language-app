import type { UserRepository } from "../../../../domain/repositories/UserRepository.js";
import type { VoiceArtistProfileRepository } from "../../../../domain/repositories/VoiceArtistProfileRepository.js";

export class AdminVoiceArtistUseCases {
  constructor(
    private readonly voiceProfiles: VoiceArtistProfileRepository,
    private readonly users: UserRepository
  ) {}

  async list(status: "all" | "active" | "pending") {
    const isActive = status === "all" ? undefined : status === "active";
    const profiles = await this.voiceProfiles.list({ isActive });

    const users = await this.users.findByIds(profiles.map((p) => p.userId));
    const userById = new Map(users.map((u) => [u.id, u]));

    return profiles.map((profile) => ({
      id: profile.id,
      userId: profile.userId,
      email: userById.get(profile.userId)?.email || "",
      language: profile.language,
      displayName: profile.displayName,
      isActive: profile.isActive,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    }));
  }

  async activate(id: string) {
    return this.voiceProfiles.updateActiveById(id, true);
  }

  async deactivate(id: string) {
    return this.voiceProfiles.updateActiveById(id, false);
  }

  async delete(id: string): Promise<boolean> {
    const profile = await this.voiceProfiles.deleteById(id);
    if (!profile) return false;

    await this.users.removeRole(profile.userId, "voice_artist");
    return true;
  }
}
