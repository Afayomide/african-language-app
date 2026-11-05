import { FeaturesSection } from "@/components/sections/features-section";
import { KelaHero } from "@/components/landing/kela-hero";
import { TryItSection } from "@/components/landing/try-it-section";
import { LearningPathSection } from "@/components/landing/learning-path-section";
import { KelaCtaSection } from "@/components/landing/kela-cta-section";
import { MotionStyles } from "@lesson-player/motion";
import { CulturalShowcaseSection } from "@/components/sections/cultural-showcase-section";
import { AfricaMapSection } from "@/components/sections/africa-map-section";
import { Header } from "@/components/navigation/header";
import { Footer } from "@/components/navigation/footer";
import { getLearnerServerSession } from "@/lib/learnerServerSession";
import { defaultOgImage, siteDescription, siteName, siteUrl } from "@/lib/seo";
import { Book, Zap, Users } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isNativeAppUserAgent } from "@/lib/nativeApp";
import { NativeAppRedirect } from "@/components/app/native-app-redirect";

export default async function LandingPage() {
  const session = await getLearnerServerSession();
  const isAuthenticated = Boolean(session);

  // Inside the mobile app the marketing page is skipped: the app opens on its own welcome
  // screen, or straight on the dashboard for a signed-in learner.
  if (isNativeAppUserAgent((await headers()).get("user-agent"))) {
    redirect(isAuthenticated ? "/dashboard" : "/welcome");
  }
  const primaryHref = isAuthenticated ? "/dashboard" : "/auth/signup";
  const primaryLabel = isAuthenticated ? "Go to Dashboard" : "Start Learning";
  const ctaHref = isAuthenticated ? "/dashboard" : "/auth/signup";
  const ctaLabel = isAuthenticated ? "Go to Dashboard" : "Start Your Journey";
  const siteOrigin = siteUrl.toString().replace(/\/$/, "");
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: siteName,
      url: siteOrigin,
      logo: `${siteOrigin}${defaultOgImage}`,
      description: siteDescription,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: siteName,
      url: siteOrigin,
      description: siteDescription,
    },
  ];

  const features = [
    {
      icon: Zap,
      title: "Learn in 5–10 Minutes",
      description:
        "Perfect bite-sized lessons fit into your busiest days. Build the habit with micro-learning.",
    },
    {
      icon: Book,
      title: "Real Cultural Context",
      description:
        "Learn beyond words. Understand traditions, greetings, and cultural nuances that matter.",
      accentColor: "accent" as const,
    },
    {
      icon: Users,
      title: "AI-Powered Practice",
      description:
        "Adaptive learning that responds to your pace. Practice speaking, listening, and reading.",
    },
  ];

  const steps = [
    {
      title: "Choose Your Language",
      description:
        "Pick from Yoruba, Igbo, Hausa, or Pidgin. Focus on what excites you most.",
    },
    {
      title: "Set Your Goal",
      description:
        "Choose how much time you can dedicate daily. Even 5 minutes counts.",
    },
    {
      title: "Learn & Practice",
      description:
        "Engage with lessons, exercises, and real-world scenarios. Track your progress.",
    },
    {
      title: "Build Your Streak",
      description:
        "Celebrate milestones and maintain consistency. Watch your confidence grow.",
    },
  ];

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fffbff]">
      <MotionStyles />
      <NativeAppRedirect />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Header isAuthenticated={isAuthenticated} />

      <KelaHero primaryHref={primaryHref} primaryLabel={primaryLabel} />

      <TryItSection startHref={primaryHref} />

      <AfricaMapSection startHref={primaryHref} />

      <CulturalShowcaseSection />

      <FeaturesSection title={`Why learn with ${siteName}?`} features={features} />

      <LearningPathSection title="How It Works" steps={steps} />

      <KelaCtaSection
        title="Ready to Learn?"
        description="Join thousands of learners exploring African languages through culture, conversation, and daily life."
        ctaHref={ctaHref}
        ctaLabel={ctaLabel}
      />

      <Footer />
    </main>
  );
}
