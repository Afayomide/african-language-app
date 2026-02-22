'use client'

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services";

export default function PhrasesPage() {
  const router = useRouter();

  useEffect(() => {
    const tutor = authService.getTutorProfile();
    if (tutor?.language) {
      router.replace(`/phrases/lang/${tutor.language}`);
    }
  }, [router]);

  return null;
}
