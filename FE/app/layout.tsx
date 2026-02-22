import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono, Quicksand } from 'next/font/google'

import './globals.css'

const _geist = Geist({ subsets: ['latin'] })
const _geistMono = Geist_Mono({ subsets: ['latin'] })
const _quicksand = Quicksand({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Learn Nigerian Languages | Language Learning App',
  description: 'Learn Yoruba, Igbo, Hausa & Pidgin the easy way. AI-powered practice with real cultural context.',
  generator: 'v0.app',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
