'use client'

import React from "react"

import { useState } from 'react'
import { useRouter } from "next/navigation"
import { Button } from '@/components/ui/button'
import { Eye, EyeOff } from 'lucide-react'
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons";
import { AuthLayout } from "@/components/auth/auth-layout";
import { AuthFormCard } from "@/components/auth/auth-form-card";
import { FormField } from "@/components/forms/form-field";
import { learnerAuthService } from "@/services";

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      await learnerAuthService.login(formData.email, formData.password)
      router.push("/dashboard")
    } catch (error) {
      console.error("Login failed", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue your learning journey"
      footerText="Don't have an account?"
      footerLink={{ text: 'Sign up', href: '/auth/signup' }}
    >
      <AuthFormCard>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email Field */}
          <FormField
            label="Email Address"
            name="email"
            type="email"
            placeholder="you@example.com"
            value={formData.email}
            onChange={handleChange}
            required
          />

          {/* Password Field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                Password
              </label>
              <a
                href="/auth/forgot-password"
                className="text-xs font-medium text-primary hover:underline"
              >
                Forgot?
              </a>
            </div>
            <FormField
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleChange}
              toggleIcon={showPassword ? EyeOff : Eye}
              onToggle={() => setShowPassword(!showPassword)}
              hideLabel
              required
            />
          </div>

          {/* Remember me checkbox */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="remember"
              className="h-4 w-4 rounded border-border/50 text-primary focus:ring-primary"
            />
            <label htmlFor="remember" className="text-sm text-foreground/70">
              Remember me
            </label>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            size="lg"
            disabled={isLoading}
            className="w-full font-semibold shadow-lg transition-all duration-200 hover:shadow-xl"
          >
            {isLoading ? "Signing In..." : "Sign In"}
          </Button>
        </form>

        <SocialAuthButtons />
      </AuthFormCard>
    </AuthLayout>
  )
}
