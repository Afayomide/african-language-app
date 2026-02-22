"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  page: number;
  limit: number;
  onLimitChange: (value: number) => void;
  totalPages: number;
  total: number;
  label?: string;
  onPrev: () => void;
  onNext: () => void;
};

export function DataTableControls({
  search,
  onSearchChange,
  page,
  limit,
  onLimitChange,
  totalPages,
  total,
  label = "Search",
  onPrev,
  onNext
}: Props) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <Input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={`${label}...`}
        className="max-w-md"
      />
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>{total} results</span>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
          value={limit}
          onChange={(event) => onLimitChange(Number(event.target.value))}
        >
          <option value={10}>10 / page</option>
          <option value={20}>20 / page</option>
          <option value={50}>50 / page</option>
        </select>
        <Button type="button" variant="outline" size="sm" onClick={onPrev} disabled={page <= 1}>
          Prev
        </Button>
        <span>
          Page {page} / {Math.max(1, totalPages)}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={onNext} disabled={page >= totalPages}>
          Next
        </Button>
      </div>
    </div>
  );
}
