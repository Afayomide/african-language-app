'use client'

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services";

export default function LessonsPage() {
  const router = useRouter();

  useEffect(() => {
    const tutor = authService.getTutorProfile();
    if (tutor?.language) {
      router.replace(`/lessons/lang/${tutor.language}`);
    }
  }, [router]);

  return null;
}
