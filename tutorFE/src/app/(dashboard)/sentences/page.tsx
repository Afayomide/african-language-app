'use client'

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services";

export default function SentencesPage() {
  const router = useRouter();

  useEffect(() => {
    const tutor = authService.getTutorProfile();
    router.replace(`/sentences/lang/${tutor?.language || "yoruba"}`);
  }, [router]);

  return null;
}
