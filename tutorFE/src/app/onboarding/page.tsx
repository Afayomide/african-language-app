'use client'

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LanguageSelectItems } from "@/components/common/language-select-items";
import { authService } from "@/services/auth";
import { toast } from "sonner";
import type { Language } from "@/types";

export default function TutorOnboardingPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>("");
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.replace("/login");
      return;
    }

    const tutor = authService.getTutorProfile();
    if (tutor?.language) {
      router.replace("/dashboard");
      return;
    }

    setIsReady(true);
  }, [router]);

  async function handleSubmit() {
    if (!language) {
      toast.error("Select the language you want to teach.");
      return;
    }

    setIsSaving(true);
    try {
      await authService.completeOnboarding(language);
      toast.success("Tutor onboarding complete.");
      router.replace("/dashboard");
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to complete onboarding.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!isReady) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-lg border bg-card shadow-md">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">Tutor Onboarding</CardTitle>
          <CardDescription>
            Your account is active. Choose the language you want to teach before entering the tutor dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="teaching-language">Teaching Language</Label>
            <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
              <SelectTrigger id="teaching-language" className="h-11">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <LanguageSelectItems />
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardFooter>
          <Button className="h-11 w-full" onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "Saving..." : "Continue to Dashboard"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
