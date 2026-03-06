import { redirect } from "next/navigation";

export default async function UnitsLanguageRedirectPage({
  params
}: {
  params: Promise<{ language: string }>;
}) {
  const { language } = await params;
  redirect(`/units?language=${language}`);
}
