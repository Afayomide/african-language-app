'use client'

import { useEffect, useMemo, useState } from "react";
import { languageService } from "@/services/language.service";
import type { Language, LanguageStatus, PublicLanguage } from "@/types";

const DEFAULT_STATUS = "all";
const languageCache = new Map<string, PublicLanguage[]>();
const pendingRequests = new Map<string, Promise<PublicLanguage[]>>();

function normalizeStatus(status: LanguageStatus | "all" | undefined) {
  return status || DEFAULT_STATUS;
}

function formatLanguageCode(code: string) {
  return String(code)
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function filterArchivedLanguages(languages: PublicLanguage[]) {
  return languages.filter((language) => language.status !== "archived");
}

export function isLanguage(value: string | null | undefined): value is Language {
  return Boolean(value && String(value).trim());
}

export function isKnownLanguage(
  value: string | null | undefined,
  languages: PublicLanguage[]
): value is Language {
  if (!value) return false;
  return languages.some((language) => language.code === value);
}

export function getLanguageByCode(code: string | null | undefined, languages: PublicLanguage[] = []) {
  if (!code) return null;
  return languages.find((language) => language.code === code) || null;
}

export function getLanguageName(code: Language | string, languages: PublicLanguage[] = []) {
  return getLanguageByCode(code, languages)?.name || formatLanguageCode(String(code));
}

export async function loadPublicLanguages(status: LanguageStatus | "all" = DEFAULT_STATUS) {
  const cacheKey = normalizeStatus(status);
  const cachedLanguages = languageCache.get(cacheKey);
  if (cachedLanguages) return cachedLanguages;

  const pendingRequest = pendingRequests.get(cacheKey);
  if (pendingRequest) return pendingRequest;

  const request = languageService
    .listLanguages(status)
    .then((languages) => {
      languageCache.set(cacheKey, languages);
      return languages;
    })
    .finally(() => {
      pendingRequests.delete(cacheKey);
    });

  pendingRequests.set(cacheKey, request);
  return request;
}

export function usePublicLanguages(status: LanguageStatus | "all" = DEFAULT_STATUS) {
  const cacheKey = normalizeStatus(status);
  const [languages, setLanguages] = useState<PublicLanguage[]>(languageCache.get(cacheKey) || []);
  const [isLoading, setIsLoading] = useState(!languageCache.has(cacheKey));
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    loadPublicLanguages(status)
      .then((result) => {
        if (!isMounted) return;
        setLanguages(result);
        setError("");
      })
      .catch((cause: unknown) => {
        if (!isMounted) return;
        const message = cause instanceof Error ? cause.message : "Failed to load languages.";
        setError(message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [status]);

  const selectableLanguages = useMemo(() => filterArchivedLanguages(languages), [languages]);

  return { languages, selectableLanguages, isLoading, error };
}
