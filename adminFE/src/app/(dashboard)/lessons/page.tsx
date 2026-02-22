import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";

const LANGUAGES = [
  { 
    key: "yoruba", 
    label: "Yoruba", 
    description: "Manage lessons for the Yoruba language curriculum.",
    color: "bg-primary",
    lightColor: "bg-secondary",
    textColor: "text-primary"
  },
  { 
    key: "igbo", 
    label: "Igbo", 
    description: "Manage lessons for the Igbo language curriculum.",
    color: "bg-primary",
    lightColor: "bg-secondary",
    textColor: "text-primary"
  },
  { 
    key: "hausa", 
    label: "Hausa", 
    description: "Manage lessons for the Hausa language curriculum.",
    color: "bg-primary",
    lightColor: "bg-secondary",
    textColor: "text-primary"
  }
] as const;

export default function LessonsHubPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Lessons Hub</h1>
        <p className="text-muted-foreground mt-2">Select a language to manage its curriculum and lesson content.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {LANGUAGES.map((language) => (
          <Link
            key={language.key}
            href={`/lessons/lang/${language.key}`}
            className="group relative overflow-hidden rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-border hover:bg-secondary/20"
          >
            <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full ${language.color} opacity-10`} />
            
            <div className="relative z-10">
              <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-lg ${language.lightColor} ${language.textColor}`}>
                <BookOpen className="h-7 w-7" />
              </div>
              
              <h2 className="mb-2 text-2xl font-semibold">{language.label}</h2>
              <p className="mb-6 text-sm text-muted-foreground leading-relaxed">
                {language.description}
              </p>
              
              <div className={`flex items-center text-sm font-medium ${language.textColor}`}>
                Manage Content <ArrowRight className="ml-1 h-4 w-4" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
