export type PageRequest = {
  page: number;
  limit: number;
};

export type PagedResult<T> = {
  items: T[];
  total: number;
};
