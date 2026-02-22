export type UserRole = "admin" | "learner" | "tutor";

export type UserEntity = {
  id: string;
  _id?: string;
  email: string;
  passwordHash: string;
  role: UserRole;
};
