'use client'

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NewExpressionPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/expressions");
  }, [router]);

  return null;
}
