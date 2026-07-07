'use client'

import Link from "next/link";
import { ArrowRight, BookOpen, MessageSquare, MessageSquareQuote, ScrollText, Type } from "lucide-react";
import { usePublicLanguages } from "@/lib/languages";

const ICONS = {
  bookOpen: BookOpen,
  messageSquare: MessageSquare,
  messageSquareQuote: MessageSquareQuote,
  scrollText: ScrollText,
  type: Type
} as const;

type LanguageHubPageProps = {
  title: string;
  description: string;
  hrefPrefix: string;
  ctaLabel: string;
  iconName: keyof typeof ICONS;
  descriptionTemplate: string;
};

export function LanguageHubPage({
  title,
  description,
  hrefPrefix,
  ctaLabel,
  iconName,
  descriptionTemplate
}: LanguageHubPageProps) {
  const { selectableLanguages, isLoading, error } = usePublicLanguages();
  const Icon = ICONS[iconName];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-muted-foreground">{description}</p>
      </div>

      {error && selectableLanguages.length === 0 ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">
          Failed to load languages.
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-3">
        {isLoading && selectableLanguages.length === 0
          ? Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-xl border bg-card p-8 shadow-sm">
                <div className="mb-5 h-14 w-14 animate-pulse rounded-lg bg-secondary" />
                <div className="mb-2 h-7 w-32 animate-pulse rounded bg-secondary" />
                <div className="mb-2 h-4 w-full animate-pulse rounded bg-secondary" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-secondary" />
              </div>
            ))
          : selectableLanguages.map((language) => (
              <Link
                key={language.id}
                href={`${hrefPrefix}/${language.code}`}
                className="group rounded-xl border bg-card p-8 shadow-sm transition-colors hover:bg-secondary/30"
              >
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Icon className="h-7 w-7" />
                </div>
                <h2 className="mb-1 text-2xl font-semibold">{language.name}</h2>
                <p className="mb-5 text-xs uppercase tracking-[0.18em] text-muted-foreground">{language.nativeName}</p>
                <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                  {descriptionTemplate.replace("{language}", language.name)}
                </p>
                <div className="flex items-center text-sm font-medium text-primary">
                  {ctaLabel} <ArrowRight className="ml-1 h-4 w-4" />
                </div>
              </Link>
            ))}
      </div>
    </div>
  );
}
