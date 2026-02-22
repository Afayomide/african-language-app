'use client'

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NewPhrasePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/phrases");
  }, [router]);

  return null;
}
