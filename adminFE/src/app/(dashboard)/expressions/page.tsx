import { LanguageHubPage } from "@/components/common/language-hub-page";

export default function ExpressionsHubPage() {
  return (
    <LanguageHubPage
      title="Expressions Hub"
      description="Select a language to manage its expression library."
      hrefPrefix="/expressions/lang"
      ctaLabel="Manage Expressions"
      iconName="messageSquare"
      descriptionTemplate="Manage expressions and reusable language chunks for {language}."
    />
  );
}
