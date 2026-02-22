import UserModel from "../../../../models/User.js";
import type { UserEntity, UserRole } from "../../../../domain/entities/User.js";
import type { UserRepository } from "../../../../domain/repositories/UserRepository.js";

function toEntity(doc: {
  _id: { toString(): string };
  email: string;
  passwordHash: string;
  role: UserRole;
}): UserEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    email: doc.email,
    passwordHash: doc.passwordHash,
    role: doc.role
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

  async create(input: { email: string; passwordHash: string; role: UserRole }): Promise<UserEntity> {
    const created = await UserModel.create(input);
    return toEntity(created);
  }

  async deleteByIdAndRole(id: string, role: UserRole): Promise<void> {
    await UserModel.deleteOne({ _id: id, role });
  }
}
