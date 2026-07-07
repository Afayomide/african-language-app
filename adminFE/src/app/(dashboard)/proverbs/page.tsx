import { LanguageHubPage } from "@/components/common/language-hub-page";

export default function ProverbsHubPage() {
  return (
    <LanguageHubPage
      title="Proverbs Hub"
      description="Select a language to manage reusable proverbs."
      hrefPrefix="/proverbs/lang"
      ctaLabel="Manage Proverbs"
      iconName="messageSquareQuote"
      descriptionTemplate="Manage reusable {language} proverbs and map them to lessons."
    />
  );
}
