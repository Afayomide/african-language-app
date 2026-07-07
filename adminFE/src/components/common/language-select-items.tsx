'use client'

import { SelectItem } from "@/components/ui/select";
import { usePublicLanguages } from "@/lib/languages";
import type { LanguageStatus } from "@/types";

export function LanguageSelectItems({
  status = "all"
}: {
  status?: LanguageStatus | "all";
}) {
  const { selectableLanguages, isLoading, error } = usePublicLanguages(status);

  if (isLoading && selectableLanguages.length === 0) {
    return <SelectItem value="__loading_languages" disabled>Loading languages...</SelectItem>;
  }

  if (error && selectableLanguages.length === 0) {
    return <SelectItem value="__failed_languages" disabled>Failed to load languages</SelectItem>;
  }

  return (
    <>
      {selectableLanguages.map((language) => (
        <SelectItem key={language.id} value={language.code}>
          {language.name}
        </SelectItem>
      ))}
    </>
  );
}
