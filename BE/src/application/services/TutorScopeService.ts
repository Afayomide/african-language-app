import type { TutorProfileRepository } from "../../domain/repositories/TutorProfileRepository.js";

export class TutorScopeService {
  constructor(private readonly tutorProfiles: TutorProfileRepository) {}

  async getActiveLanguage(userId: string): Promise<"yoruba" | "igbo" | "hausa" | null> {
    const tutor = await this.tutorProfiles.findByUserId(userId);
    if (!tutor || !tutor.isActive) {
      return null;
    }

    return tutor.language;
  }
}
