import UserModel from "../../../../models/User.js";
import type { UserEntity, UserRole } from "../../../../domain/entities/User.js";
import type { UserPageFilter, UserRepository } from "../../../../domain/repositories/UserRepository.js";
import type { PagedResult } from "../../../../domain/repositories/pagination.js";
import { searchRegex } from "../../../../utils/search.js";

function toEntity(doc: {
  _id: { toString(): string };
  email: string;
  passwordHash: string;
  roles?: UserRole[];
  createdAt?: Date;
  updatedAt?: Date;
}): UserEntity {
  const roles = (Array.isArray(doc.roles) && doc.roles.length > 0 ? doc.roles : ["learner"]) as UserRole[];
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    email: doc.email,
    passwordHash: doc.passwordHash,
    roles,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseUserRepository implements UserRepository {
  async findById(id: string): Promise<UserEntity | null> {
    const user = await UserModel.findById(id).lean();
    return user ? toEntity(user) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const user = await UserModel.findOne({ email }).lean();
    return user ? toEntity(user) : null;
  }

  async findByIds(ids: string[]): Promise<UserEntity[]> {
    const users = await UserModel.find({ _id: { $in: ids } }).lean();
    return users.map(toEntity);
  }

  async listPaged(filter: UserPageFilter): Promise<PagedResult<UserEntity>> {
    const query: Record<string, unknown> = {};
    if (filter.role) query.roles = filter.role;
    if (filter.search) query.email = searchRegex(filter.search);

    const total = await UserModel.countDocuments(query);
    const limit = Math.max(1, filter.limit);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(1, filter.page), totalPages);
    const rows = await UserModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return { items: rows.map(toEntity), total };
  }

  async setRoles(userId: string, roles: UserRole[]): Promise<UserEntity | null> {
    const updated = await UserModel.findByIdAndUpdate(userId, { roles }, { new: true }).lean();
    return updated ? toEntity(updated) : null;
  }

  async create(input: { email: string; passwordHash: string; roles: UserRole[] }): Promise<UserEntity> {
    const created = await UserModel.create(input);
    return toEntity(created);
  }

  async updateEmail(userId: string, email: string): Promise<UserEntity | null> {
    const updated = await UserModel.findByIdAndUpdate(userId, { email }, { new: true });
    return updated ? toEntity(updated) : null;
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<UserEntity | null> {
    const updated = await UserModel.findByIdAndUpdate(userId, { passwordHash }, { new: true });
    return updated ? toEntity(updated) : null;
  }

  async addRole(userId: string, role: UserRole): Promise<UserEntity | null> {
    const updated = await UserModel.findByIdAndUpdate(
      userId,
      { $addToSet: { roles: role } },
      { new: true }
    );
    return updated ? toEntity(updated) : null;
  }

  async removeRole(userId: string, role: UserRole): Promise<UserEntity | null> {
    const updated = await UserModel.findByIdAndUpdate(
      userId,
      { $pull: { roles: role } },
      { new: true }
    );
    return updated ? toEntity(updated) : null;
  }
}
