import type { UserEntity, UserRole } from "../entities/User.js";
import type { PageRequest, PagedResult } from "./pagination.js";

export type UserPageFilter = { role?: UserRole; search?: string } & PageRequest;

export interface UserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findByIds(ids: string[]): Promise<UserEntity[]>;
  listPaged(filter: UserPageFilter): Promise<PagedResult<UserEntity>>;
  setRoles(userId: string, roles: UserRole[]): Promise<UserEntity | null>;
  create(input: { email: string; passwordHash: string; roles: UserRole[] }): Promise<UserEntity>;
  updateEmail(userId: string, email: string): Promise<UserEntity | null>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<UserEntity | null>;
  addRole(userId: string, role: UserRole): Promise<UserEntity | null>;
  removeRole(userId: string, role: UserRole): Promise<UserEntity | null>;
}
