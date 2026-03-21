'use client'

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services";

export default function ExpressionsPage() {
  const router = useRouter();

  useEffect(() => {
    const profile = authService.getProfile();
    if (profile?.language) {
      router.replace(`/content/lang/${profile.language}`);
    }
  }, [router]);

  return null;
}
