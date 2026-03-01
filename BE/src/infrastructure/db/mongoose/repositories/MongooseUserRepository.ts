import UserModel from "../../../../models/User.js";
import type { UserEntity, UserRole } from "../../../../domain/entities/User.js";
import type { UserRepository } from "../../../../domain/repositories/UserRepository.js";

function toEntity(doc: {
  _id: { toString(): string };
  email: string;
  passwordHash: string;
  roles?: UserRole[];
}): UserEntity {
  const roles = (Array.isArray(doc.roles) && doc.roles.length > 0 ? doc.roles : ["learner"]) as UserRole[];
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    email: doc.email,
    passwordHash: doc.passwordHash,
    roles
  };
}

export class MongooseUserRepository implements UserRepository {
  async findById(id: string): Promise<UserEntity | null> {
    const user = await UserModel.findById(id);
    return user ? toEntity(user) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const user = await UserModel.findOne({ email });
    return user ? toEntity(user) : null;
  }

  async findByIds(ids: string[]): Promise<UserEntity[]> {
    const users = await UserModel.find({ _id: { $in: ids } });
    return users.map(toEntity);
  }

  async create(input: { email: string; passwordHash: string; roles: UserRole[] }): Promise<UserEntity> {
    const created = await UserModel.create(input);
    return toEntity(created);
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
