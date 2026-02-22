export type UserRole = "admin" | "learner" | "tutor" | "voice_artist";

export type UserEntity = {
  id: string;
  _id?: string;
  email: string;
  passwordHash: string;
  role: UserRole;
};
