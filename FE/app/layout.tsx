import React from "react"
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Quicksand } from 'next/font/google'
import { PwaRegister } from "@/components/pwa/register-sw"

import './globals.css'

const _geist = Geist({ subsets: ['latin'] })
const _geistMono = Geist_Mono({ subsets: ['latin'] })
const _quicksand = Quicksand({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Learn Nigerian Languages | Language Learning App',
  description: 'Learn Yoruba, Igbo, Hausa & Pidgin the easy way. AI-powered practice with real cultural context.',
  generator: 'v0.app',
  manifest: "/manifest.webmanifest",
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
        <PwaRegister />
        {children}
      </body>
    </html>
  )
}
