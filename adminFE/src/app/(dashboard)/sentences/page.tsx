import { LanguageHubPage } from "@/components/common/language-hub-page";

export default function SentencesHubPage() {
  return (
    <LanguageHubPage
      title="Sentences Hub"
      description="Select a language to manage its sentence library."
      hrefPrefix="/sentences/lang"
      ctaLabel="Manage Sentences"
      iconName="scrollText"
      descriptionTemplate="Manage {language} practice sentences built from words and expressions."
    />
  );
}
