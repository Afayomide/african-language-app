'use client'

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services";

export default function WordsPage() {
  const router = useRouter();

  useEffect(() => {
    const tutor = authService.getTutorProfile();
    router.replace(`/words/lang/${tutor?.language || "yoruba"}`);
  }, [router]);

  return null;
}
