import type { TutorProfileRepository } from "../../../../domain/repositories/TutorProfileRepository.js";
import type { UserRepository } from "../../../../domain/repositories/UserRepository.js";

export class AdminTutorUseCases {
  constructor(
    private readonly tutorProfiles: TutorProfileRepository,
    private readonly users: UserRepository
  ) {}

  async list(status: "all" | "active" | "pending") {
    const isActive = status === "all" ? undefined : status === "active";
    const tutors = await this.tutorProfiles.list({ isActive });

    const users = await this.users.findByIds(tutors.map((t) => t.userId));
    const userById = new Map(users.map((u) => [u.id, u]));

    return tutors.map((tutor) => ({
      id: tutor.id,
      userId: tutor.userId,
      email: userById.get(tutor.userId)?.email || "",
      language: tutor.language,
      displayName: tutor.displayName,
      isActive: tutor.isActive,
      createdAt: tutor.createdAt,
      updatedAt: tutor.updatedAt
    }));
  }

  async activate(id: string) {
    return this.tutorProfiles.updateActiveById(id, true);
  }

  async deactivate(id: string) {
    return this.tutorProfiles.updateActiveById(id, false);
  }

  async delete(id: string): Promise<boolean> {
    const tutor = await this.tutorProfiles.deleteById(id);
    if (!tutor) return false;

    await this.users.deleteByIdAndRole(tutor.userId, "tutor");
    return true;
  }
}
