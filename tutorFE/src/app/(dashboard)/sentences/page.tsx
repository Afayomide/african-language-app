
import Link from "next/link";
import { ScrollText, ArrowRight } from "lucide-react";

const LANGUAGES = [
  { key: "yoruba", label: "Yoruba", description: "Manage Yoruba practice sentences built from words and expressions." },
  { key: "igbo", label: "Igbo", description: "Manage Igbo practice sentences built from words and expressions." },
  { key: "hausa", label: "Hausa", description: "Manage Hausa practice sentences built from words and expressions." }
] as const;

export default function SentencesHubPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Sentences Hub</h1>
        <p className="mt-2 text-muted-foreground">Select a language to manage its sentence library.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {LANGUAGES.map((language) => (
          <Link
            key={language.key}
            href={`/sentences/lang/${language.key}`}
            className="group rounded-xl border bg-card p-8 shadow-sm transition-colors hover:bg-secondary/30"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-secondary text-primary">
              <ScrollText className="h-7 w-7" />
            </div>
            <h2 className="mb-2 text-2xl font-semibold">{language.label}</h2>
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{language.description}</p>
            <div className="flex items-center text-sm font-medium text-primary">
              Manage Sentences <ArrowRight className="ml-1 h-4 w-4" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
