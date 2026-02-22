'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, BookOpen, MessageSquare, Settings, LogOut } from "lucide-react"
import { authService } from "@/services/auth"

const menuItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Lessons", href: "/lessons", icon: BookOpen },
  { name: "Phrases", href: "/phrases", icon: MessageSquare },
  { name: "Questions", href: "/questions", icon: BookOpen },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex h-screen w-72 flex-col p-4 bg-background">
      <div className="flex flex-col h-full rounded-[2.5rem] bg-card shadow-2xl border-4 border-secondary/50 overflow-hidden">
        <div className="flex h-24 items-center px-8 border-b-2 border-secondary/30">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <Settings className="h-6 w-6 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tighter text-foreground leading-none">Tutor</span>
              <span className="text-xs font-black text-primary tracking-[0.2em] uppercase">Portal</span>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto py-10 px-4">
          <nav className="space-y-4">
            {menuItems.map((item) => {
              const isActive = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "group flex items-center rounded-[1.5rem] px-6 py-4 text-sm font-black transition-all duration-300",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-xl shadow-primary/20 scale-[1.05]"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-primary hover:scale-[1.02]"
                  )}
                >
                  <item.icon
                    className={cn(
                      "mr-4 h-5 w-5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110",
                      isActive
                        ? "text-primary-foreground"
                        : "text-muted-foreground group-hover:text-primary"
                    )}
                  />
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </div>
        
        <div className="p-8 bg-secondary/10 mt-auto">
          <button
            onClick={() => authService.logout()}
            className="flex w-full items-center justify-center rounded-2xl px-6 py-4 text-sm font-black text-destructive transition-all border-2 border-transparent hover:border-destructive/20 hover:bg-destructive/5"
          >
            <LogOut className="mr-3 h-5 w-5 flex-shrink-0" />
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}
