'use client'

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { authService } from "@/services/auth"

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    if (authService.isAuthenticated()) {
      router.push("/dashboard")
    } else {
      router.push("/login")
    }
  }, [router])

  return null
}