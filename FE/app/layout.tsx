import React from "react"
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Quicksand } from 'next/font/google'
import { LearnerAuthProvider } from "@/components/auth/learner-auth-provider"
import { Toaster } from "@/components/ui/sonner"

import './globals.css'

const _geist = Geist({ subsets: ['latin'] })
const _geistMono = Geist_Mono({ subsets: ['latin'] })
const _quicksand = Quicksand({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Learn African Languages | Language Learning App',
  description: 'Learn Yoruba, Igbo, Hausa, and Pidgin with AI-powered practice and real African cultural context.',
  generator: 'v0.app',
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png"
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f172a"
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <LearnerAuthProvider>
          {children}
          <Toaster richColors position="top-center" />
        </LearnerAuthProvider>
      </body>
    </html>
  )
}
