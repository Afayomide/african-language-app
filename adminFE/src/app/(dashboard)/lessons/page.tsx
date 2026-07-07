import { LanguageHubPage } from "@/components/common/language-hub-page";

export default function LessonsHubPage() {
  return (
    <LanguageHubPage
      title="Lessons Hub"
      description="Select a language to manage its curriculum and lesson content."
      hrefPrefix="/lessons/lang"
      ctaLabel="Manage Content"
      iconName="bookOpen"
      descriptionTemplate="Manage lessons for the {language} language curriculum."
    />
  );
}
