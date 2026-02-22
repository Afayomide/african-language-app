'use client'

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Sidebar from "@/components/layout/Sidebar"
import { authService } from "@/services/auth"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isAuthorized, setIsAuthorized] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push("/login")
    } else {
      setIsAuthorized(true)
    }
  }, [router])

  if (!isAuthorized) {
    return null
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-20 items-center justify-between border-b bg-card px-8">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-medium text-muted-foreground">Welcome back, Admin</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-bold">
              A
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-8 bg-background/50">
          <div className="relative mx-auto max-w-7xl">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 -right-24 -z-10 h-64 w-64 rounded-full bg-accent/5 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-24 -left-24 -z-10 h-64 w-64 rounded-full bg-primary/5 blur-3xl"
            />
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
