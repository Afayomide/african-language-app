'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, BookOpen, MessageSquare, CircleHelp, Users, Settings, LogOut, MessageSquareQuote } from "lucide-react"
import { authService } from "@/services/auth"

const menuItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Lessons", href: "/lessons", icon: BookOpen },
  { name: "Phrases", href: "/phrases", icon: MessageSquare },
  { name: "Proverbs", href: "/proverbs", icon: MessageSquareQuote },
  { name: "Questions", href: "/questions", icon: CircleHelp },
  { name: "Tutors", href: "/tutors", icon: Users },
  { name: "Users", href: "/users", icon: Users },
  { name: "Voice Artists", href: "/voice-artists", icon: Users },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex h-screen w-72 flex-col border-r bg-card px-4 py-5">
      <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex h-20 items-center border-b px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Settings className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-semibold leading-none text-foreground">Admin</span>
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Portal</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-6">
          <nav className="space-y-1.5">
            {menuItems.map((item) => {
              const isActive = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "group flex items-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <item.icon
                    className={cn(
                      "mr-3 h-4 w-4 flex-shrink-0",
                      isActive
                        ? "text-primary-foreground"
                        : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="mt-auto border-t bg-secondary/35 p-4">
          <button
            onClick={() => authService.logout()}
            className="flex w-full items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5"
          >
            <LogOut className="mr-2 h-4 w-4 flex-shrink-0" />
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}
