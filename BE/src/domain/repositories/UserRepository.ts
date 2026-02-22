import type { UserEntity, UserRole } from "../entities/User.js";

export interface UserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findByIds(ids: string[]): Promise<UserEntity[]>;
  create(input: { email: string; passwordHash: string; role: UserRole }): Promise<UserEntity>;
  deleteByIdAndRole(id: string, role: UserRole): Promise<void>;
}
