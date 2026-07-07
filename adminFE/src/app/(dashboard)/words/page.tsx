import { LanguageHubPage } from "@/components/common/language-hub-page";

export default function WordsHubPage() {
  return (
    <LanguageHubPage
      title="Words Hub"
      description="Select a language to manage its word library."
      hrefPrefix="/words/lang"
      ctaLabel="Manage Words"
      iconName="type"
      descriptionTemplate="Manage {language} vocabulary and single-word introductions."
    />
  );
}
