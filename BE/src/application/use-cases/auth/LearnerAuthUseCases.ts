import bcrypt from "bcryptjs";
import type { LearnerProfileEntity } from "../../../domain/entities/LearnerProfile.js";
import type { LearnerLanguageStateRepository } from "../../../domain/repositories/LearnerLanguageStateRepository.js";
import type { UserRepository } from "../../../domain/repositories/UserRepository.js";
import type { LearnerProfileRepository } from "../../../domain/repositories/LearnerProfileRepository.js";
import { AuthTokenService } from "../../services/AuthTokenService.js";
import { AuthError } from "./AuthErrors.js";
import type { AuthRole } from "../../services/AuthTokenService.js";

export class LearnerAuthUseCases {
  constructor(
    private readonly users: UserRepository,
    private readonly learnerProfiles: LearnerProfileRepository,
    private readonly learnerLanguageStates: LearnerLanguageStateRepository,
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
        name: input.name.trim(),
        username: "",
        avatarUrl: "",
        proficientLanguage: "",
        countryOfOrigin: "",
        onboardingCompleted: false,
        currentLanguage: input.language || "yoruba",
        dailyGoalMinutes: input.dailyGoalMinutes && input.dailyGoalMinutes > 0 ? input.dailyGoalMinutes : 10
      });
    }

    await this.learnerLanguageStates.upsertByUserAndLanguage(
      user.id,
      profile.currentLanguage,
      {
        userId: user.id,
        languageCode: profile.currentLanguage,
        dailyGoalMinutes: profile.dailyGoalMinutes,
        isEnrolled: true
      }
    );

    const token = this.tokens.sign(user.id, user.email, "learner");

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: "learner" as const,
        roles: user.roles
      },
      profile,
      requiresOnboarding: !profile.onboardingCompleted
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
        name: "",
        username: "",
        avatarUrl: "",
        proficientLanguage: "",
        countryOfOrigin: "",
        onboardingCompleted: false,
        currentLanguage: "yoruba",
        dailyGoalMinutes: 10
      });
    }

    await this.learnerLanguageStates.upsertByUserAndLanguage(
      user.id,
      profile.currentLanguage,
      {
        userId: user.id,
        languageCode: profile.currentLanguage,
        dailyGoalMinutes: profile.dailyGoalMinutes,
        isEnrolled: true
      }
    );

    const token = this.tokens.sign(user.id, user.email, "learner");

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: "learner" as const,
        roles: user.roles
      },
      profile,
      requiresOnboarding: !profile.onboardingCompleted
    };
  }

  async me(input: { userId: string; email: string; role: AuthRole }) {
    const [existingProfile, user] = await Promise.all([
      this.learnerProfiles.findByUserId(input.userId),
      this.users.findById(input.userId)
    ]);

    if (!user) {
      throw new AuthError(404, "User not found.");
    }

    let profile = existingProfile;
    if (!profile) {
      profile = await this.learnerProfiles.create({
        userId: input.userId,
        name: "",
        username: "",
        avatarUrl: "",
        proficientLanguage: "",
        countryOfOrigin: "",
        onboardingCompleted: false,
        currentLanguage: "yoruba",
        dailyGoalMinutes: 10
      });
    }

    return {
      user: {
        id: input.userId,
        email: user.email,
        role: input.role,
        roles: user.roles
      },
      profile,
      requiresOnboarding: !profile.onboardingCompleted
    };
  }

  async updateProfile(
    userId: string,
    input: Partial<{
      name: string;
      username: string;
      avatarUrl: string;
      email: string;
      proficientLanguage: string;
      countryOfOrigin: string;
      currentLanguage: "yoruba" | "igbo" | "hausa";
      dailyGoalMinutes: number;
    }>
  ) {
    let profile = await this.learnerProfiles.findByUserId(userId);
    if (!profile) {
      profile = await this.learnerProfiles.create({
        userId,
        name: "",
        username: "",
        avatarUrl: "",
        proficientLanguage: "",
        countryOfOrigin: "",
        onboardingCompleted: false,
        currentLanguage: input.currentLanguage || "yoruba",
        dailyGoalMinutes: input.dailyGoalMinutes && input.dailyGoalMinutes > 0 ? input.dailyGoalMinutes : 10
      });
    }

    const user = await this.users.findById(userId);
    if (!user) {
      throw new AuthError(404, "User not found.");
    }

    const nextName = input.name !== undefined ? input.name.trim() : profile.name;
    const nextUsername = input.username !== undefined ? input.username : profile.username || "";
    const nextAvatarUrl = input.avatarUrl !== undefined ? input.avatarUrl.trim() : (profile.avatarUrl || "");
    const nextProficientLanguage =
      input.proficientLanguage !== undefined ? input.proficientLanguage.trim() : profile.proficientLanguage;
    const nextCountryOfOrigin =
      input.countryOfOrigin !== undefined ? input.countryOfOrigin.trim() : profile.countryOfOrigin;
    const nextCurrentLanguage = input.currentLanguage || profile.currentLanguage;
    const nextDailyGoalMinutes =
      input.dailyGoalMinutes && input.dailyGoalMinutes > 0 ? input.dailyGoalMinutes : profile.dailyGoalMinutes;
    const nextEmail = input.email !== undefined ? input.email.trim().toLowerCase() : user.email;

    let updatedUser = user;
    if (nextEmail !== user.email) {
      const existing = await this.users.findByEmail(nextEmail);
      if (existing && existing.id !== userId) {
        throw new AuthError(409, "Email is already in use by another account.");
      }
      const userWithNewEmail = await this.users.updateEmail(userId, nextEmail);
      if (!userWithNewEmail) {
        throw new AuthError(500, "Failed to update email address.");
      }
      updatedUser = userWithNewEmail;
    }

    if (nextUsername) {
      const existingProfile = await this.learnerProfiles.findByUsername(nextUsername);
      if (existingProfile && existingProfile.userId !== userId) {
        throw new AuthError(409, "Username is already in use.");
      }
    }

    const updated = await this.learnerProfiles.updateByUserId(userId, {
      name: nextName,
      username: nextUsername,
      avatarUrl: nextAvatarUrl,
      proficientLanguage: nextProficientLanguage,
      countryOfOrigin: nextCountryOfOrigin,
      onboardingCompleted: Boolean(nextProficientLanguage && nextCountryOfOrigin),
      currentLanguage: nextCurrentLanguage,
      dailyGoalMinutes: nextDailyGoalMinutes
    });

    if (!updated) {
      throw new AuthError(500, "Failed to update learner profile.");
    }

 await this.learnerLanguageStates.upsertByUserAndLanguage(
      userId,
      updated.currentLanguage,
      {
        userId,
        languageCode: updated.currentLanguage,
        dailyGoalMinutes: updated.dailyGoalMinutes,
        isEnrolled: true
      },
      {
        isEnrolled: true,
        dailyGoalMinutes: updated.dailyGoalMinutes
      }
    );


    return {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        role: "learner" as const,
        roles: updatedUser.roles
      },
      profile: updated,
      requiresOnboarding: !updated.onboardingCompleted
    };
  }

  async changePassword(
    userId: string,
    input: {
      currentPassword: string;
      newPassword: string;
    }
  ) {
    const user = await this.users.findById(userId);
    if (!user || !user.roles.includes("learner")) {
      throw new AuthError(404, "User not found.");
    }

    const passwordMatches = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!passwordMatches) {
      throw new AuthError(400, "Current password is incorrect.");
    }

    const nextPasswordHash = await bcrypt.hash(input.newPassword, 10);
    const updatedUser = await this.users.updatePasswordHash(userId, nextPasswordHash);
    if (!updatedUser) {
      throw new AuthError(500, "Failed to update password.");
    }

    return { success: true };
  }
}
