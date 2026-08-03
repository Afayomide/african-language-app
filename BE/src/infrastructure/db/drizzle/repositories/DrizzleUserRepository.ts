import { and, count, desc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import { users, type UserRow } from "../schema.js";
import type { UserEntity, UserRole } from "../../../../domain/entities/User.js";
import type { UserPageFilter, UserRepository } from "../../../../domain/repositories/UserRepository.js";
import type { PagedResult } from "../../../../domain/repositories/pagination.js";
import { likePattern } from "./contentMappers.js";

/**
 * Mongoose applied `lowercase: true, trim: true` to email automatically;
 * Postgres does not, so we normalize here. The unique index is on lower(email),
 * so lookups are case-insensitive regardless of how the caller passes it.
 */
function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

function toEntity(row: UserRow): UserEntity {
  const roles = (Array.isArray(row.roles) && row.roles.length > 0 ? row.roles : ["learner"]) as UserRole[];
  return {
    id: row.id,
    _id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    roles,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class DrizzleUserRepository implements UserRepository {
  async findById(id: string): Promise<UserEntity | null> {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const rows = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizeEmail(email)}`)
      .limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findByIds(ids: string[]): Promise<UserEntity[]> {
    if (ids.length === 0) return [];
    const rows = await db.select().from(users).where(inArray(users.id, ids));
    return rows.map(toEntity);
  }

  async listPaged(filter: UserPageFilter): Promise<PagedResult<UserEntity>> {
    const conditions: (SQL | undefined)[] = [];
    // Mongo `roles: <role>` means "array contains role"
    if (filter.role) conditions.push(sql`${filter.role}::text = any(${users.roles})`);
    if (filter.search) conditions.push(ilike(users.email, likePattern(filter.search)));

    const where = conditions.length > 0 ? and(...conditions.filter(Boolean)) : undefined;
    const [totals] = await db.select({ total: count() }).from(users).where(where);
    const total = Number(totals?.total ?? 0);

    const limit = Math.max(1, filter.limit);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(1, filter.page), totalPages);

    const rows = await db
      .select()
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return { items: rows.map(toEntity), total };
  }

  async setRoles(userId: string, roles: UserRole[]): Promise<UserEntity | null> {
    const rows = await db
      .update(users)
      .set({ roles, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async create(input: { email: string; passwordHash: string; roles: UserRole[] }): Promise<UserEntity> {
    const [row] = await db
      .insert(users)
      .values({
        email: normalizeEmail(input.email),
        passwordHash: input.passwordHash,
        roles: Array.isArray(input.roles) && input.roles.length > 0 ? input.roles : ["learner"]
      })
      .returning();
    return toEntity(row);
  }

  async updateEmail(userId: string, email: string): Promise<UserEntity | null> {
    const rows = await db
      .update(users)
      .set({ email: normalizeEmail(email), updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<UserEntity | null> {
    const rows = await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  /** Mongo `$addToSet` — append only when the role is not already present. */
  async addRole(userId: string, role: UserRole): Promise<UserEntity | null> {
    const rows = await db
      .update(users)
      .set({
        roles: sql`case when ${role}::text = any(${users.roles}) then ${users.roles} else array_append(${users.roles}, ${role}::text) end`,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  /** Mongo `$pull` — remove every occurrence of the role. */
  async removeRole(userId: string, role: UserRole): Promise<UserEntity | null> {
    const rows = await db
      .update(users)
      .set({
        roles: sql`array_remove(${users.roles}, ${role}::text)`,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }
}
