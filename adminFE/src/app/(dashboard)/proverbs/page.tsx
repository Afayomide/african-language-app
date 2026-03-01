import Link from "next/link";
import { MessageSquareQuote, ArrowRight } from "lucide-react";

const LANGUAGES = [
  {
    key: "yoruba",
    label: "Yoruba",
    description: "Manage reusable Yoruba proverbs and map them to lessons.",
  },
  {
    key: "igbo",
    label: "Igbo",
    description: "Manage reusable Igbo proverbs and map them to lessons.",
  },
  {
    key: "hausa",
    label: "Hausa",
    description: "Manage reusable Hausa proverbs and map them to lessons.",
  }
] as const;

export default function ProverbsHubPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Proverbs Hub</h1>
        <p className="text-muted-foreground mt-2">Select a language to manage reusable proverbs.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {LANGUAGES.map((language) => (
          <Link
            key={language.key}
            href={`/proverbs/lang/${language.key}`}
            className="group relative overflow-hidden rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-border hover:bg-secondary/20"
          >
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary opacity-10" />

            <div className="relative z-10">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-lg bg-secondary text-primary">
                <MessageSquareQuote className="h-7 w-7" />
              </div>

              <h2 className="mb-2 text-2xl font-semibold">{language.label}</h2>
              <p className="mb-6 text-sm text-muted-foreground leading-relaxed">
                {language.description}
              </p>

              <div className="flex items-center text-sm font-medium text-primary">
                Manage Proverbs <ArrowRight className="ml-1 h-4 w-4" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
