export type PaginationInput = {
  page: number;
  limit: number;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function parsePaginationQuery(query: { page?: unknown; limit?: unknown }): PaginationInput {
  const rawPage = Number(query.page);
  const rawLimit = Number(query.limit);

  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : DEFAULT_PAGE;
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;

  return { page, limit };
}

export function getSearchQuery(query: { q?: unknown }): string {
  if (typeof query.q !== "string") return "";
  return query.q.trim().toLowerCase();
}

export function includesSearch(target: unknown, q: string): boolean {
  if (!q) return true;
  if (target === null || target === undefined) return false;
  return String(target).toLowerCase().includes(q);
}

export function paginate<T>(items: T[], input: PaginationInput): { items: T[]; pagination: PaginationMeta } {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / input.limit));
  const safePage = Math.min(input.page, totalPages);
  const start = (safePage - 1) * input.limit;
  const end = start + input.limit;

  return {
    items: items.slice(start, end),
    pagination: {
      page: safePage,
      limit: input.limit,
      total,
      totalPages,
      hasPrevPage: safePage > 1,
      hasNextPage: safePage < totalPages
    }
  };
}
