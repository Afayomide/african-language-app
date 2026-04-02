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
        displayName: input.name.trim(),
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
        displayName: "",
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
    let profile = await this.learnerProfiles.findByUserId(input.userId);
    if (!profile) {
      profile = await this.learnerProfiles.create({
        userId: input.userId,
        displayName: "",
        proficientLanguage: "",
        countryOfOrigin: "",
        onboardingCompleted: false,
        currentLanguage: "yoruba",
        dailyGoalMinutes: 10
      });
    }

    await this.learnerLanguageStates.upsertByUserAndLanguage(
      input.userId,
      profile.currentLanguage,
      {
        userId: input.userId,
        languageCode: profile.currentLanguage,
        dailyGoalMinutes: profile.dailyGoalMinutes,
        isEnrolled: true
      }
    );

    console.log("LearnerAuthUseCases.me - user:", {
      id: input.userId,
      email: input.email,
      role: input.role
    });
    console.log("LearnerAuthUseCases.me - profile:", profile);

    return {
      user: {
        id: input.userId,
        email: input.email,
        role: input.role
      },
      profile,
      requiresOnboarding: !profile.onboardingCompleted
    };
  }

  async updateProfile(
    userId: string,
    input: Partial<{
      displayName: string;
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
        displayName: "",
        proficientLanguage: "",
        countryOfOrigin: "",
        onboardingCompleted: false,
        currentLanguage: input.currentLanguage || "yoruba",
        dailyGoalMinutes: input.dailyGoalMinutes && input.dailyGoalMinutes > 0 ? input.dailyGoalMinutes : 10
      });
    }

    const nextDisplayName = input.displayName !== undefined ? input.displayName.trim() : profile.displayName;
    const nextProficientLanguage =
      input.proficientLanguage !== undefined ? input.proficientLanguage.trim() : profile.proficientLanguage;
    const nextCountryOfOrigin =
      input.countryOfOrigin !== undefined ? input.countryOfOrigin.trim() : profile.countryOfOrigin;
    const nextCurrentLanguage = input.currentLanguage || profile.currentLanguage;
    const nextDailyGoalMinutes =
      input.dailyGoalMinutes && input.dailyGoalMinutes > 0 ? input.dailyGoalMinutes : profile.dailyGoalMinutes;

    const updated = await this.learnerProfiles.updateByUserId(userId, {
      displayName: nextDisplayName,
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
      profile: updated,
      requiresOnboarding: !updated.onboardingCompleted
    };
  }
}
