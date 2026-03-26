import React from 'react'
import type { Metadata, Viewport } from 'next'
import { Manrope, Plus_Jakarta_Sans } from 'next/font/google'
import { LearnerAuthProvider } from '@/components/auth/learner-auth-provider'
import { Toaster } from '@/components/ui/sonner'

import './globals.css'

const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' })
const plusJakartaSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' })

export const metadata: Metadata = {
  title: 'Learn African Languages | Language Learning App',
  description: 'Learn Yoruba, Igbo, Hausa, and Pidgin with AI-powered practice and real African cultural context.',
  generator: 'v0.app',
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#fdf9f3',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL,GRAD,opsz@100..700,0..1,0,24"
        />
      </head>
      <body className={`${manrope.variable} ${plusJakartaSans.variable} font-sans antialiased`}>
        <LearnerAuthProvider>
          {children}
          <Toaster richColors position="top-center" />
        </LearnerAuthProvider>
      </body>
    </html>
  )
}
